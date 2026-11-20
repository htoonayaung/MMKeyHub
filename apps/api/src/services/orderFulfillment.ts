import { AssetStatus, OrderStatus, Prisma, VerificationMode } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { recordAuditLog } from '../utils/audit.js';
import { decryptSecret } from '../utils/crypto.js';

export class OrderActionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'OrderActionError';
    this.statusCode = statusCode;
  }
}

export interface ApprovedOrderResult {
  orderId: string;
  orderNumber: string;
  accessToken: string;
  customerEmail: string | null;
  customerTelegramId: bigint | null;
  adminGroupChatId: bigint | null;
  adminMessageId: number | null;
  decryptedDeliverables: Array<{
    productId: string;
    productTitleEn: string;
    productTitleMm: string;
    deliveryFormat: string;
    instructionsEn: string | null;
    instructionsMm: string | null;
    secrets: Array<{ payload: string; regionLabel: string | null }>;
  }>;
  lowStockAlerts: Array<{
    productId: string;
    titleEn: string;
    remaining: number;
  }>;
}

export interface RejectedOrderResult {
  orderId: string;
  orderNumber: string;
  customerTelegramId: bigint | null;
  adminGroupChatId: bigint | null;
  adminMessageId: number | null;
  releasedCount: number;
  rejectionReason: string;
}

function computeWarrantyExpiryDate(
  items: Array<{ product: { durationLabelEn: string | null } }>,
  approvedAt: Date
): Date | null {
  let soonestMs: number | null = null;
  for (const item of items) {
    const label = (item.product.durationLabelEn ?? '').toLowerCase();
    if (!label || label.includes('lifetime') || label.includes('permanent')) continue;

    let days = 0;
    const dayMatch = label.match(/(\d+)\s*day/);
    const weekMatch = label.match(/(\d+)\s*week/);
    const monthMatch = label.match(/(\d+)\s*month/);
    const yearMatch = label.match(/(\d+)\s*year/);

    if (dayMatch) days = Number(dayMatch[1]);
    else if (weekMatch) days = Number(weekMatch[1]) * 7;
    else if (monthMatch) days = Number(monthMatch[1]) * 30;
    else if (yearMatch) days = Number(yearMatch[1]) * 365;

    if (days > 0) {
      const targetMs = approvedAt.getTime() + days * 24 * 60 * 60 * 1000;
      if (soonestMs === null || targetMs < soonestMs) {
        soonestMs = targetMs;
      }
    }
  }
  return soonestMs ? new Date(soonestMs) : null;
}

/**
 * Atomically approves an order inside a PostgreSQL transaction:
 * - Locks Order (`FOR UPDATE`) to prevent duplicate approvals
 * - Locks RESERVED DigitalAssets (or fallback AVAILABLE via `FOR UPDATE SKIP LOCKED`)
 * - Marks assets SOLD, marks Order APPROVED, decrypts secrets, and computes low-stock alerts
 */
export async function approveOrderById(
  orderId: string,
  actor: {
    actorType: 'ADMIN' | 'SYSTEM';
    actorId: string;
    actorName: string;
    actorIp?: string | null;
    telegramId?: bigint;
  },
  options?: {
    verificationMode?: VerificationMode;
    matchedIncomingPaymentId?: string;
  }
): Promise<ApprovedOrderResult> {
  return prisma.$transaction(
    async (tx) => {
      const lockedOrderRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>(
        Prisma.sql`
          SELECT id, status
          FROM "Order"
          WHERE id = ${orderId}
          FOR UPDATE
        `
      );

      const lockedOrder = lockedOrderRows[0];
      if (!lockedOrder) {
        throw new OrderActionError('Order not found', 404);
      }

      if (lockedOrder.status !== OrderStatus.PENDING_APPROVAL) {
        throw new OrderActionError(`Order already processed (${lockedOrder.status})`, 409);
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      const now = new Date();
      const decryptedDeliverables: ApprovedOrderResult['decryptedDeliverables'] = [];

      for (const item of order.items) {
        const reservedRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id
            FROM "DigitalAsset"
            WHERE "orderItemId" = ${item.id}
              AND "status" = 'RESERVED'
            ORDER BY "createdAt" ASC
            FOR UPDATE
          `
        );

        let selectedIds = reservedRows.map((r) => r.id);

        if (selectedIds.length < item.quantity) {
          const needed = item.quantity - selectedIds.length;
          const fallbackRows = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT id
              FROM "DigitalAsset"
              WHERE "productId" = ${item.productId}
                AND "status" = 'AVAILABLE'
              ORDER BY "createdAt" ASC
              FOR UPDATE SKIP LOCKED
              LIMIT ${needed}
            `
          );
          selectedIds = [...selectedIds, ...fallbackRows.map((r) => r.id)];
        }

        if (selectedIds.length < item.quantity) {
          throw new OrderActionError(
            `Insufficient stock for ${item.product.titleEn} (needed ${item.quantity}, found ${selectedIds.length})`,
            409
          );
        }

        await tx.digitalAsset.updateMany({
          where: { id: { in: selectedIds } },
          data: {
            status: AssetStatus.SOLD,
            orderItemId: item.id,
            reservedUntil: null,
            soldAt: now,
          },
        });

        const soldAssets = await tx.digitalAsset.findMany({
          where: { id: { in: selectedIds } },
          orderBy: { createdAt: 'asc' },
        });

        if (soldAssets.length < item.quantity) {
          throw new OrderActionError(
            `Stock consistency check failed for ${item.product.titleEn}`,
            409
          );
        }

        const secrets = soldAssets.map((asset) => ({
          payload: decryptSecret({
            encryptedPayload: asset.encryptedPayload,
            iv: asset.iv,
            authTag: asset.authTag,
          }),
          regionLabel: asset.regionLabel,
        }));

        decryptedDeliverables.push({
          productId: item.productId,
          productTitleEn: item.product.titleEn,
          productTitleMm: item.product.titleMm,
          deliveryFormat: item.product.deliveryFormat,
          instructionsEn: item.product.deliveryInstructionsEn,
          instructionsMm: item.product.deliveryInstructionsMm,
          secrets,
        });
      }

      const warrantyExpiresAt = computeWarrantyExpiryDate(order.items, now);

      if (options?.matchedIncomingPaymentId) {
        const lockedLedgerRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id
            FROM "IncomingPayment"
            WHERE id = ${options.matchedIncomingPaymentId}
              AND "isMatched" = false
            FOR UPDATE SKIP LOCKED
          `
        );

        if (lockedLedgerRows.length === 0) {
          throw new OrderActionError(
            'Incoming bank payment has already been matched to another order.',
            409
          );
        }

        await tx.incomingPayment.update({
          where: { id: options.matchedIncomingPaymentId },
          data: {
            isMatched: true,
            matchedOrderId: order.id,
            matchedAt: now,
          },
        });
      }

      const targetVerificationMode =
        options?.verificationMode ?? VerificationMode.ADMIN_APPROVED;

      await tx.paymentProof.updateMany({
        where: { orderId: order.id },
        data: {
          verificationMode: targetVerificationMode,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.APPROVED,
          reviewedByTelegramId: actor.telegramId ?? null,
          reviewedByName: actor.actorName,
          reviewedAt: now,
          warrantyExpiresAt,
        },
      });

      await recordAuditLog(tx, {
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorIp: actor.actorIp ?? null,
        action: 'ORDER_APPROVED',
        entityType: 'Order',
        entityId: order.id,
        targetId: order.orderNumber,
        metadata: {
          orderNumber: order.orderNumber,
          approvedBy: actor.actorName,
          verificationMode: targetVerificationMode,
          matchedIncomingPaymentId: options?.matchedIncomingPaymentId ?? null,
        },
      });

      const productIds = [...new Set(order.items.map((i) => i.productId))];
      const remainingCounts = await tx.digitalAsset.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          status: AssetStatus.AVAILABLE,
        },
        _count: { _all: true },
      });

      const remainingMap = new Map<string, number>();
      for (const row of remainingCounts) {
        remainingMap.set(row.productId, row._count._all);
      }

      const lowStockAlerts = order.items
        .map((item) => ({
          productId: item.productId,
          titleEn: item.product.titleEn,
          remaining: remainingMap.get(item.productId) ?? 0,
        }))
        .filter(
          (entry, idx, arr) =>
            entry.remaining < 5 && arr.findIndex((x) => x.productId === entry.productId) === idx
        );

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        accessToken: updatedOrder.accessToken,
        customerEmail: order.contactEmail ?? order.customer.email ?? null,
        customerTelegramId: order.telegramChatId ?? order.customer.telegramId,
        adminGroupChatId: order.adminGroupChatId,
        adminMessageId: order.adminMessageId,
        decryptedDeliverables,
        lowStockAlerts,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    }
  );
}

/**
 * Atomically rejects an order inside a PostgreSQL transaction:
 * - Locks Order (`FOR UPDATE`)
 * - Releases RESERVED DigitalAssets back to AVAILABLE
 * - Marks Order REJECTED with explicit reason
 */
export async function rejectOrderById(
  orderId: string,
  reason: string,
  actor: {
    actorType: 'ADMIN';
    actorId: string;
    actorName: string;
    actorIp?: string | null;
    telegramId?: bigint;
  }
): Promise<RejectedOrderResult> {
  const cleanReason =
    reason.trim() || 'Payment could not be verified by administrator.';

  return prisma.$transaction(
    async (tx) => {
      const lockedOrderRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>(
        Prisma.sql`
          SELECT id, status
          FROM "Order"
          WHERE id = ${orderId}
          FOR UPDATE
        `
      );

      const lockedOrder = lockedOrderRows[0];
      if (!lockedOrder) {
        throw new OrderActionError('Order not found', 404);
      }

      if (lockedOrder.status !== OrderStatus.PENDING_APPROVAL) {
        throw new OrderActionError(`Order already processed (${lockedOrder.status})`, 409);
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          customer: true,
          items: { select: { id: true } },
        },
      });

      const orderItemIds = order.items.map((i) => i.id);
      let releasedCount = 0;

      if (orderItemIds.length > 0) {
        const releaseRes = await tx.digitalAsset.updateMany({
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
        releasedCount = releaseRes.count;
      }

      if (order.promoCodeId) {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "PromoCode"
            SET "usedCount" = GREATEST(0, "usedCount" - 1)
            WHERE id = ${order.promoCodeId}
          `
        );
      }

      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.REJECTED,
          reviewedByTelegramId: actor.telegramId ?? null,
          reviewedByName: actor.actorName,
          rejectionReason: cleanReason,
          reviewedAt: now,
        },
      });

      await recordAuditLog(tx, {
        actorType: actor.actorType,
        actorId: actor.actorId,
        actorIp: actor.actorIp ?? null,
        action: 'ORDER_REJECTED',
        entityType: 'Order',
        entityId: order.id,
        targetId: order.orderNumber,
        metadata: {
          orderNumber: order.orderNumber,
          rejectedBy: actor.actorName,
          reason: cleanReason,
          releasedStockCount: releasedCount,
        },
      });

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        customerTelegramId: order.telegramChatId ?? order.customer.telegramId,
        adminGroupChatId: order.adminGroupChatId,
        adminMessageId: order.adminMessageId,
        releasedCount,
        rejectionReason: cleanReason,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    }
  );
}
