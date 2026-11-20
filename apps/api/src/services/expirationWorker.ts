import { AssetStatus, OrderStatus, Prisma } from '@prisma/client';
import { sendWarrantyExpiryReminder } from '../bot/bot.js';
import { prisma } from '../lib/prisma.js';
import { computeAndSendDailySummary, getLocalDayContext } from './dailySummary.js';

let workerTimer: NodeJS.Timeout | null = null;
let dailySummaryTimer: NodeJS.Timeout | null = null;
let lastDailySummaryDateKey: string | null = null;

/**
 * Releases expired RESERVED DigitalAssets back to AVAILABLE and marks
 * stale pending orders as EXPIRED inside an atomic transaction.
 */
export async function runReservationCleanup(): Promise<{
  expiredOrders: number;
  releasedAssets: number;
}> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const staleOrders = await tx.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_APPROVAL] },
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        orderNumber: true,
        promoCodeId: true,
        items: { select: { id: true } },
      },
      take: 50,
    });

    if (staleOrders.length === 0) {
      return { expiredOrders: 0, releasedAssets: 0 };
    }

    const orderIds = staleOrders.map((o) => o.id);
    const orderItemIds = staleOrders.flatMap((o) => o.items.map((i) => i.id));

    let releasedAssets = 0;
    if (orderItemIds.length > 0) {
      const res = await tx.digitalAsset.updateMany({
        where: {
          orderItemId: { in: orderItemIds },
          status: AssetStatus.RESERVED,
        },
        data: {
          status: AssetStatus.AVAILABLE,
          orderItemId: null,
          reservedUntil: null,
        },
      });
      releasedAssets = res.count;
    }

    const promoReleaseCounts = new Map<string, number>();
    for (const ord of staleOrders) {
      if (ord.promoCodeId) {
        promoReleaseCounts.set(ord.promoCodeId, (promoReleaseCounts.get(ord.promoCodeId) ?? 0) + 1);
      }
    }
    for (const [promoId, count] of promoReleaseCounts.entries()) {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "PromoCode"
          SET "usedCount" = GREATEST(0, "usedCount" - ${count})
          WHERE id = ${promoId}
        `
      );
    }

    const updatedOrders = await tx.order.updateMany({
      where: {
        id: { in: orderIds },
        status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_APPROVAL] },
      },
      data: {
        status: OrderStatus.EXPIRED,
        rejectionReason: 'Order verification window expired automatically.',
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorId: 'expiration-worker',
        action: 'RESERVATIONS_EXPIRED_CLEANUP',
        entityType: 'Order',
        entityId: orderIds[0],
        metadata: {
          expiredOrderNumbers: staleOrders.map((o) => o.orderNumber),
          releasedAssets,
        },
      },
    });

    return {
      expiredOrders: updatedOrders.count,
      releasedAssets,
    };
  });
}

/**
 * Sends Telegram renewal/expiry reminder DMs for approved orders expiring within 48 hours.
 */
export async function runWarrantyExpiryReminders(): Promise<number> {
  const now = new Date();
  const threshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const expiringOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.APPROVED,
      warrantyExpiresAt: {
        gt: now,
        lte: threshold,
      },
      expiryReminderSentAt: null,
    },
    include: {
      customer: { select: { telegramId: true } },
      items: {
        take: 1,
        include: {
          product: { select: { titleEn: true, titleMm: true } },
        },
      },
    },
    take: 25,
  });

  let sentReminders = 0;
  for (const ord of expiringOrders) {
    const tgId = ord.telegramChatId ?? ord.customer.telegramId;
    if (!tgId || !ord.warrantyExpiresAt || ord.items.length === 0) continue;

    const sent = await sendWarrantyExpiryReminder({
      telegramUserId: tgId,
      orderNumber: ord.orderNumber,
      productTitleEn: ord.items[0].product.titleEn,
      productTitleMm: ord.items[0].product.titleMm,
      expiresAt: ord.warrantyExpiresAt,
    });

    if (sent) {
      await prisma.order.update({
        where: { id: ord.id },
        data: { expiryReminderSentAt: new Date() },
      });
      sentReminders += 1;
    }
  }

  return sentReminders;
}

export async function checkDailySummarySchedule(): Promise<boolean> {
  const ctx = getLocalDayContext();
  if (ctx.hour === 23 && ctx.minute === 59 && lastDailySummaryDateKey !== ctx.dateKey) {
    lastDailySummaryDateKey = ctx.dateKey;
    try {
      const report = await computeAndSendDailySummary();
      console.log(
        `[DailySummary] Scheduled summary for ${report.dateKey} (${report.timezone}): ${report.telegramStatus}`
      );
      return true;
    } catch (err) {
      lastDailySummaryDateKey = null;
      console.error('[DailySummary] Scheduled dispatch failed:', err);
    }
  }
  return false;
}

export function startExpirationWorker(intervalMs = 5 * 60 * 1000): void {
  if (!workerTimer) {
    workerTimer = setInterval(() => {
      void runReservationCleanup()
        .then((res) => {
          if (res.expiredOrders > 0 || res.releasedAssets > 0) {
            console.log(
              `[ExpirationWorker] Expired ${res.expiredOrders} order(s), released ${res.releasedAssets} reserved asset(s).`
            );
          }
        })
        .catch((err) => {
          console.error('[ExpirationWorker] Cleanup failed:', err);
        });

      void runWarrantyExpiryReminders()
        .then((count) => {
          if (count > 0) {
            console.log(`[ExpirationWorker] Sent ${count} warranty/expiry reminder(s).`);
          }
        })
        .catch((err) => {
          console.error('[ExpirationWorker] Expiry reminder sweep failed:', err);
        });
    }, intervalMs);

    // Allow Node process to exit cleanly without hanging on timer
    workerTimer.unref();
  }

  if (!dailySummaryTimer) {
    dailySummaryTimer = setInterval(() => {
      void checkDailySummarySchedule();
    }, 30 * 1000);
    dailySummaryTimer.unref();
  }
}

export function stopExpirationWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  if (dailySummaryTimer) {
    clearInterval(dailySummaryTimer);
    dailySummaryTimer = null;
  }
}
