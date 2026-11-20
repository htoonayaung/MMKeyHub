import fs from 'node:fs';
import path from 'node:path';
import {
  ActorType,
  AssetStatus,
  DiscountType,
  OrderStatus,
  PaymentProvider,
  Prisma,
  VerificationMode,
} from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  clearAdminGroupButtonsAfterWebAction,
  deliverApprovedOrderToTelegram,
  notifyRejectedOrderToTelegram,
  sendCriticalSecurityAlertToGroup,
  sendLowStockAlertsToGroup,
  sendTelegramBroadcast,
} from '../bot/bot.js';
import { prisma } from '../lib/prisma.js';
import {
  getReceiptsUploadDir,
  uploadProductImageMiddleware,
  writeSanitizedProductImageFile,
} from '../middleware/upload.js';
import { computeAndSendDailySummary } from '../services/dailySummary.js';
import { sendOrderApprovedEmail } from '../services/emailNotifier.js';
import {
  approveOrderById,
  OrderActionError,
  rejectOrderById,
} from '../services/orderFulfillment.js';
import { extractClientIp, recordAuditLog } from '../utils/audit.js';
import { InvalidReceiptImageError, sanitizeProductImage } from '../utils/imageSecurity.js';
import { requireAdminApiKey } from '../utils/telegramAuth.js';

export const adminRouter = Router();

adminRouter.use('/admin', requireAdminApiKey);

function isValidProductImageUrl(val: string): boolean {
  if (val === '') return true;
  if (/^https?:\/\//i.test(val)) return true;
  if (/^\/(api\/products\/images|images)\/[A-Za-z0-9._-]+$/.test(val)) return true;
  return false;
}

const updateProductSchema = z.object({
  titleEn: z.string().min(2).max(160).optional(),
  titleMm: z.string().min(1).max(200).optional(),
  descriptionEn: z.string().min(2).optional(),
  descriptionMm: z.string().min(1).optional(),
  priceMmk: z.coerce.number().int().positive().optional(),
  originalPriceMmk: z.coerce.number().int().positive().nullable().optional(),
  durationLabelEn: z.string().max(60).nullable().optional(),
  imageUrl: z
    .string()
    .trim()
    .refine(
      isValidProductImageUrl,
      'imageUrl must be an http(s) URL or an uploaded product image path'
    )
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
  isActive: z.boolean().optional(),
});

const createPromoCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, hyphens, and underscores'),
  discountType: z.nativeEnum(DiscountType),
  discountValue: z.coerce.number().int().positive(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updatePromoCodeSchema = z.object({
  isActive: z.boolean().optional(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const upsertPaymentMethodSchema = z.object({
  accountName: z.string().min(2).max(120),
  accountPhone: z.string().min(6).max(32),
  qrImageUrl: z
    .string()
    .max(250000, 'QR image data is too large; please use a smaller image or URL')
    .refine(
      (val) =>
        val === '' ||
        /^https?:\/\//i.test(val) ||
        /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(val),
      'Must be an http(s) URL or compressed PNG/JPEG/WEBP image'
    )
    .optional()
    .default(''),
  instructionsEn: z.string().max(500).optional(),
  instructionsMm: z.string().max(500).optional(),
  isActive: z.boolean().optional().default(true),
});

const rejectOrderBodySchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

const heroSlideSchema = z.object({
  id: z.string().min(1).max(60),
  badgeEn: z.string().trim().min(1).max(120),
  badgeMm: z.string().trim().min(1).max(160),
  titleEn: z.string().trim().min(2).max(160),
  titleMm: z.string().trim().min(1).max(200),
  subtitleEn: z.string().trim().min(2).max(400),
  subtitleMm: z.string().trim().min(1).max(500),
  ctaLabelEn: z.string().trim().min(1).max(60),
  ctaLabelMm: z.string().trim().min(1).max(80),
  targetCategory: z.enum(['ALL', 'LICENSE_KEY', 'ACCOUNT_LOGIN', 'VPN_CONFIG']).default('ALL'),
  imageUrl: z.string().trim().max(250000).optional().nullable(),
});

const updateMerchantSettingsSchema = z.object({
  isShopOpen: z.boolean(),
  offlineNotice: z.string().trim().min(5).max(500).optional(),
  brandLogoUrl: z
    .string()
    .trim()
    .max(250000, 'Brand logo data is too large; use an HTTPS URL or compressed image under 200KB')
    .refine(
      (val) =>
        val === '' ||
        /^https?:\/\//i.test(val) ||
        /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(val),
      'Must be an http(s) URL or compressed PNG/JPEG/WEBP/SVG image'
    )
    .nullable()
    .optional(),
  flashSaleEndsAt: z.string().datetime().nullable().optional(),
  flashSaleLabelEn: z.string().trim().max(80).nullable().optional(),
  flashSaleLabelMm: z.string().trim().max(100).nullable().optional(),
  heroSlides: z.array(heroSlideSchema).max(6).nullable().optional(),
});

const broadcastSchema = z.object({
  message: z.string().trim().min(2, 'Broadcast message cannot be empty').max(3500),
  photoUrl: z
    .string()
    .trim()
    .refine(
      (val) => val === '' || /^https?:\/\//i.test(val),
      'Photo URL must start with http:// or https://'
    )
    .optional()
    .nullable(),
  promoCode: z.string().trim().max(40).optional().nullable(),
});

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * GET /api/admin/dashboard
 * Returns revenue/order metrics, low stock alerts, product inventory counts,
 * payment method settings, and recent orders.
 */
adminRouter.get('/admin/dashboard', async (_req: Request, res: Response) => {
  try {
    const [
      revenueAgg,
      pendingCount,
      approvedCount,
      products,
      stockGrouped,
      recentOrders,
      paymentMethods,
      promoCodes,
      activeSubscribers,
      blockedSubscribers,
      merchantSettings,
      incomingPayments,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { status: OrderStatus.APPROVED },
        _sum: { totalMmk: true },
      }),
      prisma.order.count({
        where: {
          status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.PENDING_PAYMENT] },
        },
      }),
      prisma.order.count({
        where: { status: OrderStatus.APPROVED },
      }),
      prisma.product.findMany({
        include: {
          category: {
            select: {
              id: true,
              slug: true,
              nameEn: true,
              nameMm: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.digitalAsset.groupBy({
        by: ['productId', 'status'],
        _count: { _all: true },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          customer: {
            select: {
              telegramId: true,
              telegramUsername: true,
              firstName: true,
              email: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  titleEn: true,
                  titleMm: true,
                  deliveryFormat: true,
                },
              },
            },
          },
          paymentProofs: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.paymentMethod.findMany({
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.promoCode.findMany({
        orderBy: { createdAt: 'desc' },
      }),
      prisma.botSubscriber.count({
        where: { isBlocked: false },
      }),
      prisma.botSubscriber.count({
        where: { isBlocked: true },
      }),
      prisma.merchantSettings.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default', isShopOpen: true },
      }),
      prisma.incomingPayment.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 30,
      }),
    ]);

    const stockByProduct = new Map<
      string,
      { available: number; reserved: number; sold: number }
    >();

    for (const row of stockGrouped) {
      const entry = stockByProduct.get(row.productId) ?? {
        available: 0,
        reserved: 0,
        sold: 0,
      };
      if (row.status === AssetStatus.AVAILABLE) entry.available = row._count._all;
      if (row.status === AssetStatus.RESERVED) entry.reserved = row._count._all;
      if (row.status === AssetStatus.SOLD) entry.sold = row._count._all;
      stockByProduct.set(row.productId, entry);
    }

    const mappedProducts = products.map((product) => {
      const counts = stockByProduct.get(product.id) ?? {
        available: 0,
        reserved: 0,
        sold: 0,
      };
      return {
        id: product.id,
        slug: product.slug,
        titleEn: product.titleEn,
        titleMm: product.titleMm,
        priceMmk: product.priceMmk,
        originalPriceMmk: product.originalPriceMmk,
        deliveryFormat: product.deliveryFormat,
        durationLabelEn: product.durationLabelEn,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        category: product.category,
        availableStockCount: counts.available,
        reservedStockCount: counts.reserved,
        soldStockCount: counts.sold,
      };
    });

    const lowStockProducts = mappedProducts.filter(
      (p) => p.isActive && p.availableStockCount < 5
    );

    const mappedOrders = recentOrders.map((order) => {
      const latestProof = order.paymentProofs[0] ?? null;
      const receiptFilename = latestProof ? path.basename(latestProof.receiptPath) : null;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotalMmk: order.subtotalMmk ?? order.totalMmk,
        discountMmk: order.discountMmk,
        promoCodeText: order.promoCodeText,
        totalMmk: order.totalMmk,
        contactEmail: order.contactEmail,
        contactPhone: order.contactPhone,
        reviewedByName: order.reviewedByName,
        rejectionReason: order.rejectionReason,
        reviewedAt: order.reviewedAt,
        createdAt: order.createdAt,
        customer: {
          telegramId: order.customer.telegramId
            ? order.customer.telegramId.toString()
            : null,
          telegramUsername: order.customer.telegramUsername,
          firstName: order.customer.firstName,
          email: order.customer.email,
          phone: order.customer.phone,
        },
        items: order.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          subtotalMmk: item.subtotalMmk,
          productTitleEn: item.product.titleEn,
          deliveryFormat: item.product.deliveryFormat,
        })),
        paymentProof: latestProof
          ? {
              provider: latestProof.provider,
              receiptPath: receiptFilename
                ? `/api/admin/receipts/${encodeURIComponent(receiptFilename)}`
                : latestProof.receiptPath,
              transactionLast6: latestProof.transactionLast6,
              isDuplicateTxWarning: latestProof.isDuplicateTxWarning,
              duplicateTxOrderNumber: latestProof.duplicateTxOrderNumber,
              isSimilarSlipWarning: latestProof.isSimilarSlipWarning,
              similarSlipOrderNumber: latestProof.similarSlipOrderNumber,
              similarSlipDistance: latestProof.similarSlipDistance,
              verificationMode: latestProof.verificationMode,
              ocrExtractedTxId: latestProof.ocrExtractedTxId,
              ocrExtractedAmount: latestProof.ocrExtractedAmount,
              ocrConfidenceScore: latestProof.ocrConfidenceScore,
              ocrTamperingFlags: latestProof.ocrTamperingFlags,
              submittedAt: latestProof.submittedAt,
            }
          : null,
      };
    });

    res.json({
      metrics: {
        totalRevenueMmk: revenueAgg._sum.totalMmk ?? 0,
        pendingOrdersCount: pendingCount,
        approvedOrdersCount: approvedCount,
        lowStockCount: lowStockProducts.length,
      },
      lowStockProducts,
      products: mappedProducts,
      recentOrders: mappedOrders,
      incomingPayments,
      paymentMethods,
      promoCodes,
      subscriberStats: {
        activeSubscribers,
        blockedSubscribers,
        totalSubscribers: activeSubscribers + blockedSubscribers,
      },
      merchantSettings: {
        isShopOpen: merchantSettings.isShopOpen,
        offlineNotice: merchantSettings.offlineNotice,
        brandLogoUrl: merchantSettings.brandLogoUrl,
        flashSaleEndsAt: merchantSettings.flashSaleEndsAt,
        flashSaleLabelEn: merchantSettings.flashSaleLabelEn,
        flashSaleLabelMm: merchantSettings.flashSaleLabelMm,
        heroSlides: merchantSettings.heroSlides,
        updatedAt: merchantSettings.updatedAt,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/dashboard] Error:', err);
    res.status(500).json({ error: 'Failed to load admin dashboard metrics' });
  }
});

/**
 * POST /api/admin/orders/:id/approve
 * Allows Web Admin to approve an order atomically, unlock keys, and send Telegram DM.
 */
adminRouter.post('/admin/orders/:id/approve', async (req: Request, res: Response) => {
  const orderId = String(req.params.id ?? '').trim();
  try {
    const result = await approveOrderById(orderId, {
      actorType: 'ADMIN',
      actorId: 'web-admin',
      actorName: 'Web Admin',
      actorIp: extractClientIp(req),
    });

    const dmNote = await deliverApprovedOrderToTelegram(result);
    await sendOrderApprovedEmail(result);
    await clearAdminGroupButtonsAfterWebAction(
      result.adminGroupChatId,
      result.adminMessageId,
      `✅ <b>Approved via Web Admin</b> (${result.orderNumber})${dmNote}`
    );
    await sendLowStockAlertsToGroup(result.lowStockAlerts);

    res.json({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      status: OrderStatus.APPROVED,
    });
  } catch (err) {
    if (err instanceof OrderActionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[POST /api/admin/orders/:id/approve] Error:', err);
    res.status(500).json({ error: 'Failed to approve order' });
  }
});

/**
 * POST /api/admin/orders/:id/reject
 * Allows Web Admin to reject an order, release reserved stock, and notify Telegram user.
 */
adminRouter.post('/admin/orders/:id/reject', async (req: Request, res: Response) => {
  const orderId = String(req.params.id ?? '').trim();
  const parsed = rejectOrderBodySchema.safeParse(req.body ?? {});
  const reason = parsed.success && parsed.data.reason
    ? parsed.data.reason
    : 'Payment could not be verified by administrator.';

  try {
    const result = await rejectOrderById(orderId, reason, {
      actorType: 'ADMIN',
      actorId: 'web-admin',
      actorName: 'Web Admin',
      actorIp: extractClientIp(req),
    });

    await notifyRejectedOrderToTelegram(result);
    await clearAdminGroupButtonsAfterWebAction(
      result.adminGroupChatId,
      result.adminMessageId,
      `❌ <b>Rejected via Web Admin</b> (${result.orderNumber}) · Reason: <i>${result.rejectionReason}</i>`
    );

    res.json({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      status: OrderStatus.REJECTED,
      releasedCount: result.releasedCount,
    });
  } catch (err) {
    if (err instanceof OrderActionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[POST /api/admin/orders/:id/reject] Error:', err);
    res.status(500).json({ error: 'Failed to reject order' });
  }
});

/**
 * POST /api/admin/products/upload-image
 * Accepts a multipart product cover image (`image`), validates & sanitizes via Sharp to WebP,
 * stores under `/app/uploads/products`, and returns the public `/api/products/images/:filename` URL.
 */
adminRouter.post('/admin/products/upload-image', (req: Request, res: Response) => {
  uploadProductImageMiddleware.single('image')(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      const msg =
        uploadErr instanceof Error ? uploadErr.message : 'Failed to upload product image';
      res.status(400).json({ error: msg });
      return;
    }

    if (!req.file?.buffer) {
      res.status(400).json({ error: 'Product image file is required (field name: image)' });
      return;
    }

    try {
      const sanitized = await sanitizeProductImage(req.file.buffer);
      const saved = await writeSanitizedProductImageFile(
        sanitized.sanitizedBuffer,
        sanitized.extension
      );

      await recordAuditLog(prisma, {
        actorType: ActorType.ADMIN,
        actorId: 'web-admin',
        actorIp: extractClientIp(req),
        action: 'PRODUCT_IMAGE_UPLOADED',
        entityType: 'ProductImage',
        entityId: saved.filename,
        targetId: saved.filename,
        metadata: {
          imageUrl: saved.imageUrl,
          width: sanitized.width,
          height: sanitized.height,
          fileSizeBytes: sanitized.fileSizeBytes,
        },
      });

      res.status(201).json({
        imageUrl: saved.imageUrl,
        filename: saved.filename,
        width: sanitized.width,
        height: sanitized.height,
        fileSizeBytes: sanitized.fileSizeBytes,
      });
    } catch (err) {
      if (err instanceof InvalidReceiptImageError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('[POST /api/admin/products/upload-image] Error:', err);
      res.status(500).json({ error: 'Failed to sanitize and save product image' });
    }
  });
});

/**
 * PATCH /api/admin/products/:id
 * Edit product price, titles, descriptions, or toggle active/archived state.
 */
adminRouter.patch('/admin/products/:id', async (req: Request, res: Response) => {
  const productId = String(req.params.id ?? '').trim();
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid product update payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const updated = await prisma.product.update({
      where: { id: productId },
      data: parsed.data,
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: updated.id,
      targetId: updated.id,
      metadata: parsed.data,
    });

    res.json({ product: updated });
  } catch (err: unknown) {
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === 'P2025') {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    console.error('[PATCH /api/admin/products/:id] Error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * PUT /api/admin/payment-methods/:provider
 * Upserts KPay or WavePay merchant account name, phone, QR image URL, and instructions.
 * Triggers an immediate CRITICAL SECURITY ALERT to Telegram Admin Group when receiving
 * phone numbers or account holder names change.
 */
adminRouter.put('/admin/payment-methods/:provider', async (req: Request, res: Response) => {
  const rawProvider = String(req.params.provider ?? '').toUpperCase();
  if (rawProvider !== PaymentProvider.KPAY && rawProvider !== PaymentProvider.WAVEPAY) {
    res.status(400).json({ error: 'Provider must be KPAY or WAVEPAY' });
    return;
  }

  const parsed = upsertPaymentMethodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payment method payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const provider = rawProvider as PaymentProvider;
  const input = parsed.data;
  const actorIp = extractClientIp(req);

  try {
    const previous = await prisma.paymentMethod.findUnique({ where: { provider } });

    const method = await prisma.paymentMethod.upsert({
      where: { provider },
      update: {
        accountName: input.accountName,
        accountPhone: input.accountPhone,
        qrImageUrl: input.qrImageUrl,
        instructionsEn: input.instructionsEn ?? null,
        instructionsMm: input.instructionsMm ?? null,
        isActive: input.isActive,
      },
      create: {
        provider,
        accountName: input.accountName,
        accountPhone: input.accountPhone,
        qrImageUrl: input.qrImageUrl,
        instructionsEn: input.instructionsEn ?? null,
        instructionsMm: input.instructionsMm ?? null,
        isActive: input.isActive,
        sortOrder: provider === PaymentProvider.KPAY ? 1 : 2,
      },
    });

    const phoneChanged = !previous || previous.accountPhone.trim() !== input.accountPhone.trim();
    const nameChanged = !previous || previous.accountName.trim() !== input.accountName.trim();
    const isCriticalCanaryEvent = phoneChanged || nameChanged;

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp,
      action: 'MERCHANT_SETTINGS_UPDATED',
      entityType: 'PaymentMethod',
      entityId: method.id,
      targetId: provider,
      metadata: {
        provider,
        previousAccountName: previous?.accountName ?? null,
        newAccountName: input.accountName,
        previousAccountPhone: previous?.accountPhone ?? null,
        newAccountPhone: input.accountPhone,
        canaryAlertTriggered: isCriticalCanaryEvent,
      },
    });

    if (isCriticalCanaryEvent) {
      await sendCriticalSecurityAlertToGroup({
        title: `Merchant ${provider} Receiving Account Modified`,
        details: [
          `Provider: ${provider}`,
          `Account Name: ${previous?.accountName ?? '(none)'} -> ${input.accountName}`,
          `Phone Number: ${previous?.accountPhone ?? '(none)'} -> ${input.accountPhone}`,
        ],
        actorIp,
      });
    }

    res.json({ paymentMethod: method });
  } catch (err) {
    console.error('[PUT /api/admin/payment-methods/:provider] Error:', err);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

/**
 * PUT /api/admin/merchant-settings
 * Toggles Online (5-min delivery) vs Night Mode (delayed delivery) & updates offline notice.
 */
adminRouter.put('/admin/merchant-settings', async (req: Request, res: Response) => {
  const parsed = updateMerchantSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid merchant settings payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const dataPatch = {
      isShopOpen: parsed.data.isShopOpen,
      ...(parsed.data.offlineNotice !== undefined
        ? { offlineNotice: parsed.data.offlineNotice }
        : {}),
      ...(parsed.data.brandLogoUrl !== undefined
        ? { brandLogoUrl: parsed.data.brandLogoUrl ? parsed.data.brandLogoUrl : null }
        : {}),
      ...(parsed.data.flashSaleEndsAt !== undefined
        ? {
            flashSaleEndsAt: parsed.data.flashSaleEndsAt
              ? new Date(parsed.data.flashSaleEndsAt)
              : null,
          }
        : {}),
      ...(parsed.data.flashSaleLabelEn !== undefined
        ? { flashSaleLabelEn: parsed.data.flashSaleLabelEn || null }
        : {}),
      ...(parsed.data.flashSaleLabelMm !== undefined
        ? { flashSaleLabelMm: parsed.data.flashSaleLabelMm || null }
        : {}),
      ...(parsed.data.heroSlides !== undefined
        ? {
            heroSlides:
              parsed.data.heroSlides === null
                ? Prisma.JsonNull
                : (parsed.data.heroSlides as Prisma.InputJsonValue),
          }
        : {}),
    };

    const updated = await prisma.merchantSettings.upsert({
      where: { id: 'default' },
      update: dataPatch,
      create: {
        id: 'default',
        ...dataPatch,
      },
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'MERCHANT_SETTINGS_UPDATED',
      entityType: 'MerchantSettings',
      entityId: updated.id,
      targetId: updated.id,
      metadata: {
        isShopOpen: updated.isShopOpen,
        offlineNotice: updated.offlineNotice,
        hasBrandLogo: Boolean(updated.brandLogoUrl),
        flashSaleEndsAt: updated.flashSaleEndsAt?.toISOString() ?? null,
      },
    });

    res.json({
      merchantSettings: {
        isShopOpen: updated.isShopOpen,
        offlineNotice: updated.offlineNotice,
        brandLogoUrl: updated.brandLogoUrl,
        flashSaleEndsAt: updated.flashSaleEndsAt,
        flashSaleLabelEn: updated.flashSaleLabelEn,
        flashSaleLabelMm: updated.flashSaleLabelMm,
        heroSlides: updated.heroSlides,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error('[PUT /api/admin/merchant-settings] Error:', err);
    res.status(500).json({ error: 'Failed to update merchant settings' });
  }
});

/**
 * GET /api/admin/receipts/:filename
 * Authenticated receipt viewer protected by ADMIN_API_KEY so customer receipts
 * are never exposed publicly via Nginx.
 */
adminRouter.get('/admin/receipts/:filename', (req: Request, res: Response) => {
  const rawName = String(req.params.filename ?? '');
  const safeName = path.basename(rawName);
  if (!safeName || safeName !== rawName || !/^[A-Za-z0-9._-]+$/.test(safeName)) {
    res.status(400).json({ error: 'Invalid receipt filename' });
    return;
  }

  const uploadDir = getReceiptsUploadDir();
  const absPath = path.resolve(uploadDir, safeName);
  if (!absPath.startsWith(uploadDir + path.sep)) {
    res.status(403).json({ error: 'Forbidden path' });
    return;
  }

  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Receipt image not found' });
    return;
  }

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(absPath);
});

/**
 * POST /api/admin/promo-codes
 * Creates a new percentage or fixed-MMK discount promo code.
 */
adminRouter.post('/admin/promo-codes', async (req: Request, res: Response) => {
  const parsed = createPromoCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid promo code payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const input = parsed.data;
  if (input.discountType === DiscountType.PERCENTAGE && (input.discountValue < 1 || input.discountValue > 95)) {
    res.status(400).json({ error: 'Percentage discount must be between 1 and 95' });
    return;
  }

  const normalizedCode = input.code.trim().toUpperCase();

  try {
    const promoCode = await prisma.promoCode.create({
      data: {
        code: normalizedCode,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.isActive,
      },
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'PROMO_CREATED',
      entityType: 'PromoCode',
      entityId: promoCode.id,
      targetId: promoCode.code,
      metadata: {
        code: promoCode.code,
        discountType: promoCode.discountType,
        discountValue: promoCode.discountValue,
        maxUses: promoCode.maxUses,
      },
    });

    res.status(201).json({ promoCode });
  } catch (err: unknown) {
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === 'P2002') {
      res.status(409).json({ error: `Promo code "${normalizedCode}" already exists` });
      return;
    }
    console.error('[POST /api/admin/promo-codes] Error:', err);
    res.status(500).json({ error: 'Failed to create promo code' });
  }
});

/**
 * PATCH /api/admin/promo-codes/:id
 * Toggle active/inactive state or update usage limit / expiration on an existing promo code.
 */
adminRouter.patch('/admin/promo-codes/:id', async (req: Request, res: Response) => {
  const promoId = String(req.params.id ?? '').trim();
  const parsed = updatePromoCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid promo code update payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const updateData: {
    isActive?: boolean;
    maxUses?: number | null;
    expiresAt?: Date | null;
  } = {};

  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.maxUses !== undefined) updateData.maxUses = parsed.data.maxUses;
  if (parsed.data.expiresAt !== undefined) {
    updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }

  try {
    const promoCode = await prisma.promoCode.update({
      where: { id: promoId },
      data: updateData,
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'PROMO_UPDATED',
      entityType: 'PromoCode',
      entityId: promoCode.id,
      targetId: promoCode.code,
      metadata: { code: promoCode.code, isActive: promoCode.isActive },
    });

    res.json({ promoCode });
  } catch (err: unknown) {
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === 'P2025') {
      res.status(404).json({ error: 'Promo code not found' });
      return;
    }
    console.error('[PATCH /api/admin/promo-codes/:id] Error:', err);
    res.status(500).json({ error: 'Failed to update promo code' });
  }
});

/**
 * POST /api/admin/broadcast
 * Sends rate-limited promotional Telegram broadcasts to all active BotSubscribers.
 */
adminRouter.post('/admin/broadcast', async (req: Request, res: Response) => {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid broadcast payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await sendTelegramBroadcast({
      message: parsed.data.message,
      photoUrl: parsed.data.photoUrl || null,
      promoCode: parsed.data.promoCode || null,
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'BROADCAST_SENT',
      entityType: 'BotSubscriber',
      entityId: 'broadcast',
      targetId: parsed.data.promoCode ? parsed.data.promoCode.toUpperCase() : 'all-subscribers',
      metadata: {
        totalTargets: result.totalTargets,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        blockedCount: result.blockedCount,
        promoCode: parsed.data.promoCode || null,
        hasPhoto: Boolean(parsed.data.photoUrl),
      },
    });

    res.json(result);
  } catch (err) {
    console.error('[POST /api/admin/broadcast] Error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to dispatch Telegram broadcast',
    });
  }
});

/**
 * GET /api/admin/orders/export-csv
 * Downloads order & revenue accounting records as CSV (optional ?month=YYYY-MM).
 */
adminRouter.get('/admin/orders/export-csv', async (req: Request, res: Response) => {
  const monthParam = typeof req.query.month === 'string' ? req.query.month.trim() : '';

  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (monthParam) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
      res.status(400).json({ error: 'month query parameter must be formatted as YYYY-MM' });
      return;
    }
    const [yearStr, monStr] = monthParam.split('-');
    const year = Number(yearStr);
    const month = Number(monStr);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    dateFilter = { gte: start, lt: end };
  }

  try {
    const orders = await prisma.order.findMany({
      where: dateFilter ? { createdAt: dateFilter } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        customer: {
          select: {
            telegramId: true,
            telegramUsername: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: { select: { titleEn: true } },
          },
        },
        paymentProofs: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    const header = [
      'Order Number',
      'Created At (UTC)',
      'Status',
      'Customer',
      'Products',
      'Quantity',
      'Subtotal (MMK)',
      'Discount (MMK)',
      'Promo Code',
      'Total (MMK)',
      'Payment Provider',
      'Tx Last 6',
      'Reviewed By',
      'Reviewed At (UTC)',
    ]
      .map(escapeCsvCell)
      .join(',');

    const rows = orders.map((ord) => {
      const customerLabel = ord.customer.telegramUsername
        ? `@${ord.customer.telegramUsername}`
        : ord.customer.telegramId
          ? `TG:${ord.customer.telegramId.toString()}`
          : ord.contactPhone ?? ord.contactEmail ?? ord.customer.phone ?? ord.customer.email ?? 'Guest';

      const productList = ord.items.map((i) => `${i.product.titleEn} x${i.quantity}`).join(' | ');
      const totalQty = ord.items.reduce((sum, i) => sum + i.quantity, 0);
      const proof = ord.paymentProofs[0];

      return [
        ord.orderNumber,
        ord.createdAt.toISOString(),
        ord.status,
        customerLabel,
        productList,
        totalQty,
        ord.subtotalMmk ?? ord.totalMmk,
        ord.discountMmk,
        ord.promoCodeText ?? '',
        ord.totalMmk,
        proof?.provider ?? '',
        proof?.transactionLast6 ?? '',
        ord.reviewedByName ?? '',
        ord.reviewedAt ? ord.reviewedAt.toISOString() : '',
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    const csvBody = [header, ...rows].join('\r\n');
    const filename = monthParam
      ? `mmkeyhub-sales-${monthParam}.csv`
      : `mmkeyhub-sales-all.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csvBody}`);
  } catch (err) {
    console.error('[GET /api/admin/orders/export-csv] Error:', err);
    res.status(500).json({ error: 'Failed to export sales report CSV' });
  }
});

/**
 * GET /api/admin/orders
 * Server-side paginated order search (by order #, Tx ID, or contact) and status filter.
 */
adminRouter.get('/admin/orders', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const statusParam =
    typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 15) || 15));

  const andClauses: Prisma.OrderWhereInput[] = [];

  if (statusParam === 'PENDING_APPROVAL') {
    andClauses.push({ status: OrderStatus.PENDING_APPROVAL });
  } else if (statusParam === 'APPROVED') {
    andClauses.push({ status: OrderStatus.APPROVED });
  } else if (statusParam === 'REJECTED') {
    andClauses.push({ status: OrderStatus.REJECTED });
  } else if (statusParam === 'MANUAL_REVIEW') {
    andClauses.push({
      paymentProofs: {
        some: { verificationMode: VerificationMode.MANUAL_REVIEW },
      },
    });
  } else if (statusParam === 'AUTO_VERIFIED') {
    andClauses.push({
      paymentProofs: {
        some: { verificationMode: VerificationMode.AUTO_VERIFIED },
      },
    });
  }

  if (q) {
    andClauses.push({
      OR: [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { contactPhone: { contains: q, mode: 'insensitive' } },
        { customer: { telegramUsername: { contains: q, mode: 'insensitive' } } },
        { customer: { firstName: { contains: q, mode: 'insensitive' } } },
        {
          paymentProofs: {
            some: {
              OR: [
                { transactionLast6: { contains: q, mode: 'insensitive' } },
                { ocrExtractedTxId: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    });
  }

  const where: Prisma.OrderWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  try {
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: {
            select: {
              telegramId: true,
              telegramUsername: true,
              firstName: true,
              email: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  titleEn: true,
                  titleMm: true,
                  deliveryFormat: true,
                },
              },
            },
          },
          paymentProofs: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const mappedOrders = orders.map((order) => {
      const latestProof = order.paymentProofs[0] ?? null;
      const receiptFilename = latestProof ? path.basename(latestProof.receiptPath) : null;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotalMmk: order.subtotalMmk ?? order.totalMmk,
        discountMmk: order.discountMmk,
        promoCodeText: order.promoCodeText,
        totalMmk: order.totalMmk,
        contactEmail: order.contactEmail,
        contactPhone: order.contactPhone,
        reviewedByName: order.reviewedByName,
        rejectionReason: order.rejectionReason,
        reviewedAt: order.reviewedAt,
        createdAt: order.createdAt,
        customer: {
          telegramId: order.customer.telegramId ? order.customer.telegramId.toString() : null,
          telegramUsername: order.customer.telegramUsername,
          firstName: order.customer.firstName,
          email: order.customer.email,
          phone: order.customer.phone,
        },
        items: order.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          subtotalMmk: item.subtotalMmk,
          productTitleEn: item.product.titleEn,
          deliveryFormat: item.product.deliveryFormat,
        })),
        paymentProof: latestProof
          ? {
              provider: latestProof.provider,
              receiptPath: receiptFilename
                ? `/api/admin/receipts/${encodeURIComponent(receiptFilename)}`
                : latestProof.receiptPath,
              transactionLast6: latestProof.transactionLast6,
              isDuplicateTxWarning: latestProof.isDuplicateTxWarning,
              duplicateTxOrderNumber: latestProof.duplicateTxOrderNumber,
              isSimilarSlipWarning: latestProof.isSimilarSlipWarning,
              similarSlipOrderNumber: latestProof.similarSlipOrderNumber,
              similarSlipDistance: latestProof.similarSlipDistance,
              verificationMode: latestProof.verificationMode,
              ocrExtractedTxId: latestProof.ocrExtractedTxId,
              ocrExtractedAmount: latestProof.ocrExtractedAmount,
              ocrConfidenceScore: latestProof.ocrConfidenceScore,
              ocrTamperingFlags: latestProof.ocrTamperingFlags,
              submittedAt: latestProof.submittedAt,
            }
          : null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      orders: mappedOrders,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error('[GET /api/admin/orders] Error:', err);
    res.status(500).json({ error: 'Failed to search and paginate orders' });
  }
});

const linkSmsSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
});

/**
 * POST /api/admin/incoming-payments/:id/link
 * 1-click links an unmatched incoming bank SMS directly to a pending order and unlocks keys immediately.
 */
adminRouter.post('/admin/incoming-payments/:id/link', async (req: Request, res: Response) => {
  const incomingPaymentId = String(req.params.id ?? '').trim();
  const parsed = linkSmsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Select a valid pending order to link',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const incoming = await prisma.incomingPayment.findUnique({
      where: { id: incomingPaymentId },
    });

    if (!incoming) {
      res.status(404).json({ error: 'Incoming SMS record not found' });
      return;
    }

    if (incoming.isMatched) {
      res.status(409).json({ error: 'This incoming bank SMS is already matched to an order' });
      return;
    }

    const result = await approveOrderById(
      parsed.data.orderId,
      {
        actorType: 'ADMIN',
        actorId: 'web-admin',
        actorName: `Web Admin (Linked SMS #${incoming.transactionLast6 || incoming.transactionId})`,
        actorIp: extractClientIp(req),
      },
      {
        verificationMode: VerificationMode.ADMIN_APPROVED,
        matchedIncomingPaymentId: incoming.id,
      }
    );

    const dmNote = await deliverApprovedOrderToTelegram(result);
    await sendOrderApprovedEmail(result);
    await clearAdminGroupButtonsAfterWebAction(
      result.adminGroupChatId,
      result.adminMessageId,
      `✅ <b>Approved &amp; Linked Bank SMS #${incoming.transactionId}</b> (${result.orderNumber})${dmNote}`
    );
    await sendLowStockAlertsToGroup(result.lowStockAlerts);

    res.json({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      incomingPaymentId: incoming.id,
      transactionId: incoming.transactionId,
      status: OrderStatus.APPROVED,
    });
  } catch (err) {
    if (err instanceof OrderActionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[POST /api/admin/incoming-payments/:id/link] Error:', err);
    res.status(500).json({ error: 'Failed to link incoming SMS and approve order' });
  }
});

/**
 * POST /api/admin/daily-summary/send
 * Manually triggers the Daily Sales & Auto-Verify Summary to Telegram Admin Group.
 */
adminRouter.post('/admin/daily-summary/send', async (req: Request, res: Response) => {
  try {
    const report = await computeAndSendDailySummary();

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'DAILY_SUMMARY_TRIGGERED',
      entityType: 'DailySummary',
      entityId: report.dateKey,
      targetId: report.dateKey,
      metadata: {
        totalRevenueMmk: report.totalRevenueMmk,
        approvedOrdersCount: report.approvedOrdersCount,
        autoVerifyRatePct: report.autoVerifyRatePct,
        pendingOrdersCount: report.pendingOrdersCount,
        telegramSent: report.telegramSent,
      },
    });

    res.json({ report });
  } catch (err) {
    console.error('[POST /api/admin/daily-summary/send] Error:', err);
    res.status(500).json({ error: 'Failed to compute or send daily summary report' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Strictly read-only security audit trail endpoint for inspecting immutable operational logs.
 */
adminRouter.get('/admin/audit-logs', async (req: Request, res: Response) => {
  const actionFilter = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase() : '';
  const actorTypeParam =
    typeof req.query.actorType === 'string' ? req.query.actorType.trim().toUpperCase() : '';
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));

  const where: Prisma.AuditLogWhereInput = {};
  if (actionFilter && actionFilter !== 'ALL') {
    where.action = actionFilter;
  }
  if (actorTypeParam && actorTypeParam !== 'ALL') {
    if (Object.values(ActorType).includes(actorTypeParam as ActorType)) {
      where.actorType = actorTypeParam as ActorType;
    }
  }

  try {
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      logs: logs.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        actorIp: entry.actorIp,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        targetId: entry.targetId ?? entry.entityId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[GET /api/admin/audit-logs] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve immutable security audit logs' });
  }
});
