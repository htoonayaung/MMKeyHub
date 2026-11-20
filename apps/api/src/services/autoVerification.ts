import { OrderStatus, VerificationMode } from '@prisma/client';
import {
  clearAdminGroupButtonsAfterWebAction,
  deliverApprovedOrderToTelegram,
  notifyAdminNewOrder,
  sendAdminAutoVerifiedLog,
  sendLowStockAlertsToGroup,
} from '../bot/bot.js';
import { prisma } from '../lib/prisma.js';
import { sendOrderApprovedEmail } from './emailNotifier.js';
import { approveOrderById, OrderActionError } from './orderFulfillment.js';

const pendingFallbackTimers = new Map<string, NodeJS.Timeout>();

function clearFallbackTimer(orderId: string): void {
  const existing = pendingFallbackTimers.get(orderId);
  if (existing) {
    clearTimeout(existing);
    pendingFallbackTimers.delete(orderId);
  }
}

function txIdsMatch(
  ocrTxId: string | null | undefined,
  proofLast6: string | null | undefined,
  ledgerTxId: string,
  ledgerLast6: string | null
): boolean {
  const cleanLedgerTx = ledgerTxId.trim().toUpperCase();
  const cleanLedger6 = (ledgerLast6 || cleanLedgerTx.slice(-6)).toUpperCase();

  if (ocrTxId) {
    const cleanOcrTx = ocrTxId.trim().toUpperCase();
    if (cleanOcrTx === cleanLedgerTx) return true;
    if (cleanOcrTx.length >= 6 && cleanLedgerTx.endsWith(cleanOcrTx.slice(-6))) return true;
  }

  if (proofLast6) {
    const cleanProof6 = proofLast6.trim().toUpperCase();
    if (cleanProof6 === cleanLedger6 || cleanLedgerTx.endsWith(cleanProof6)) return true;
  }

  return false;
}

/**
 * Schedules a 60-second fallback escalation to the Admin Telegram Group
 * when receipt OCR passed cleanly and the system is waiting for the matching Android SMS.
 */
export function scheduleAdminFallbackTimer(orderId: string, delayMs = 60_000): void {
  clearFallbackTimer(orderId);

  const timer = setTimeout(() => {
    pendingFallbackTimers.delete(orderId);
    void (async () => {
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, status: true, adminMessageId: true },
        });
        if (!order || order.status !== OrderStatus.PENDING_APPROVAL || order.adminMessageId) {
          return;
        }
        await notifyAdminNewOrder(order.id);
      } catch (err) {
        console.warn(`[AutoVerify] Fallback notification check failed for order ${orderId}:`, err);
      }
    })();
  }, delayMs);

  timer.unref();
  pendingFallbackTimers.set(orderId, timer);
}

/**
 * Direction A (Order Submitted -> Check Existing Unmatched IncomingPayment Ledger):
 * Matches a clean OCR receipt against already-received bank SMS records.
 */
export async function tryAutoMatchOrderWithLedger(orderId: string): Promise<{
  matched: boolean;
  incomingPaymentId?: string;
  transactionId?: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      paymentProofs: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!order || order.status !== OrderStatus.PENDING_APPROVAL) {
    return { matched: false };
  }

  const proof = order.paymentProofs[0];
  if (!proof || proof.ocrTamperingFlags.length > 0) {
    return { matched: false };
  }

  const candidatePayments = await prisma.incomingPayment.findMany({
    where: {
      isMatched: false,
      provider: proof.provider,
      amountMmk: order.totalMmk,
    },
    orderBy: { receivedAt: 'desc' },
    take: 25,
  });

  const matchedSms = candidatePayments.find((sms) =>
    txIdsMatch(proof.ocrExtractedTxId, proof.transactionLast6, sms.transactionId, sms.transactionLast6)
  );

  if (!matchedSms) {
    return { matched: false };
  }

  try {
    clearFallbackTimer(order.id);
    const result = await approveOrderById(
      order.id,
      {
        actorType: 'SYSTEM',
        actorId: 'auto-verify-ocr-sms',
        actorName: 'Auto-Verified (AI + Bank SMS)',
      },
      {
        verificationMode: VerificationMode.AUTO_VERIFIED,
        matchedIncomingPaymentId: matchedSms.id,
      }
    );

    const dmStatusNote = await deliverApprovedOrderToTelegram(result);
    await sendOrderApprovedEmail(result);
    await sendAdminAutoVerifiedLog(result, {
      provider: matchedSms.provider,
      amountMmk: matchedSms.amountMmk,
      transactionId: matchedSms.transactionId,
      confidenceScore: proof.ocrConfidenceScore,
      dmStatusNote,
    });
    await sendLowStockAlertsToGroup(result.lowStockAlerts);

    return {
      matched: true,
      incomingPaymentId: matchedSms.id,
      transactionId: matchedSms.transactionId,
    };
  } catch (err) {
    if (err instanceof OrderActionError) {
      return { matched: false };
    }
    console.error(`[AutoVerify] Failed to auto-match order ${order.orderNumber}:`, err);
    return { matched: false };
  }
}

/**
 * Direction B (SMS Webhook Arrives -> Check Pending Orders):
 * Matches an incoming KPay/WavePay SMS against PENDING_APPROVAL orders whose AI OCR passed cleanly.
 */
export async function tryAutoMatchIncomingSms(incomingPaymentId: string): Promise<{
  matched: boolean;
  orderNumber?: string;
}> {
  const incoming = await prisma.incomingPayment.findUnique({
    where: { id: incomingPaymentId },
  });

  if (!incoming || incoming.isMatched) {
    return { matched: false };
  }

  const candidateOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING_APPROVAL,
      totalMmk: incoming.amountMmk,
      paymentProofs: {
        some: {
          provider: incoming.provider,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: {
      paymentProofs: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
      },
    },
  });

  for (const order of candidateOrders) {
    const proof = order.paymentProofs[0];
    if (!proof || proof.provider !== incoming.provider) continue;
    // Never auto-verify orders flagged for manual review or tampering
    if (proof.ocrTamperingFlags.length > 0) continue;

    if (
      !txIdsMatch(
        proof.ocrExtractedTxId,
        proof.transactionLast6,
        incoming.transactionId,
        incoming.transactionLast6
      )
    ) {
      continue;
    }

    try {
      clearFallbackTimer(order.id);
      const result = await approveOrderById(
        order.id,
        {
          actorType: 'SYSTEM',
          actorId: 'auto-verify-ocr-sms',
          actorName: 'Auto-Verified (AI + Bank SMS)',
        },
        {
          verificationMode: VerificationMode.AUTO_VERIFIED,
          matchedIncomingPaymentId: incoming.id,
        }
      );

      const dmStatusNote = await deliverApprovedOrderToTelegram(result);
      await sendOrderApprovedEmail(result);
      if (result.adminGroupChatId && result.adminMessageId) {
        await clearAdminGroupButtonsAfterWebAction(
          result.adminGroupChatId,
          result.adminMessageId,
          `✅ <b>Auto-Verified &amp; Delivered</b> (${result.orderNumber} · Bank SMS ${incoming.transactionId} matched)${dmStatusNote}`
        );
      } else {
        await sendAdminAutoVerifiedLog(result, {
          provider: incoming.provider,
          amountMmk: incoming.amountMmk,
          transactionId: incoming.transactionId,
          confidenceScore: proof.ocrConfidenceScore,
          dmStatusNote,
        });
      }
      await sendLowStockAlertsToGroup(result.lowStockAlerts);

      return {
        matched: true,
        orderNumber: result.orderNumber,
      };
    } catch (err) {
      if (err instanceof OrderActionError) {
        continue;
      }
      console.error(`[AutoVerify] Error matching incoming SMS ${incoming.id}:`, err);
    }
  }

  return { matched: false };
}
