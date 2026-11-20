import crypto from 'node:crypto';
import {
  ActorType,
  AssetStatus,
  Locale,
  OrderStatus,
  PaymentProvider,
  Prisma,
  VerificationMode,
} from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  safeUnlinkFile,
  uploadReceiptMiddleware,
  writeSanitizedReceiptFile,
} from '../middleware/upload.js';
import { notifyAdminNewOrder } from '../bot/bot.js';
import {
  scheduleAdminFallbackTimer,
  tryAutoMatchOrderWithLedger,
} from '../services/autoVerification.js';
import { verifyReceiptImage } from '../services/receiptVerifier.js';
import { extractClientIp, recordAuditLog } from '../utils/audit.js';
import { decryptSecret, generateOrderAccessToken, safeTimingCompare } from '../utils/crypto.js';
import {
  computeHammingDistance,
  InvalidReceiptImageError,
  sanitizeAndHashReceipt,
} from '../utils/imageSecurity.js';
import { optionalTelegramAuth } from '../utils/telegramAuth.js';
import {
  computePromoTotals,
  type PromoSnapshot,
  validatePromoEligibility,
} from './promo.js';

export const ordersRouter = Router();

const orderCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many order submissions. Please wait a few minutes before retrying.' },
});

const orderStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many status requests. Please slow down.' },
});

class HttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const cartLineItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

const createOrderSchema = z.object({
  productId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(10).optional().default(1),
  items: z.union([z.string(), z.array(cartLineItemSchema)]).optional(),
  paymentMethod: z.nativeEnum(PaymentProvider),
  customerContact: z.string().trim().max(160).optional(),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: z.string().trim().min(6).max(32).optional(),
  transactionLast6: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,12}$/, 'transactionLast6 must be 4-12 alphanumeric characters')
    .optional(),
  senderName: z.string().trim().max(100).optional(),
  senderPhone: z.string().trim().max(32).optional(),
  promoCode: z.string().trim().max(40).optional(),
  locale: z.nativeEnum(Locale).optional().default(Locale.EN),
});

function resolveRequestedLineItems(input: z.infer<typeof createOrderSchema>): Array<{
  productId: string;
  quantity: number;
}> {
  let rawItems: Array<{ productId: string; quantity: number }> = [];

  if (typeof input.items === 'string' && input.items.trim()) {
    const parsedJson = JSON.parse(input.items) as unknown;
    const validated = z.array(cartLineItemSchema).min(1).max(10).parse(parsedJson);
    rawItems = validated;
  } else if (Array.isArray(input.items) && input.items.length > 0) {
    rawItems = input.items;
  } else if (input.productId) {
    rawItems = [{ productId: input.productId, quantity: input.quantity }];
  } else {
    throw new HttpError('Provide either productId or a non-empty items cart array', 400);
  }

  const merged = new Map<string, number>();
  for (const entry of rawItems) {
    const nextQty = (merged.get(entry.productId) ?? 0) + entry.quantity;
    if (nextQty > 10) {
      throw new HttpError('Maximum 10 units per product per order', 400);
    }
    merged.set(entry.productId, nextQty);
  }

  const totalUnits = Array.from(merged.values()).reduce((acc, q) => acc + q, 0);
  if (totalUnits > 20) {
    throw new HttpError('Maximum 20 total digital units per checkout cart', 400);
  }

  // Deterministic ordering prevents PostgreSQL lock-order deadlocks on concurrent multi-item carts
  return Array.from(merged.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MMK-${y}${m}${d}-${suffix}`;
}

function splitContact(
  customerContact?: string,
  explicitEmail?: string,
  explicitPhone?: string
): { email?: string; phone?: string } {
  const emailCandidate = explicitEmail?.trim();
  const phoneCandidate = explicitPhone?.trim();

  if (emailCandidate || phoneCandidate) {
    return {
      email: emailCandidate || undefined,
      phone: phoneCandidate || undefined,
    };
  }

  const raw = customerContact?.trim();
  if (!raw) {
    return {};
  }

  if (raw.includes('@')) {
    return { email: raw.toLowerCase() };
  }
  return { phone: raw };
}

/**
 * Wraps Multer upload so file size / MIME errors return clean 400 responses.
 */
function handleReceiptUpload(req: Request, res: Response, next: NextFunction): void {
  uploadReceiptMiddleware.single('receipt')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message = err instanceof Error ? err.message : 'Receipt upload failed';
    res.status(400).json({ error: message });
  });
}

/**
 * POST /api/orders
 * Accepts multipart/form-data (productId, paymentMethod [KPAY/WAVEPAY], receipt image,
 * customerContact or validated Telegram initData user).
 * Atomically locks & reserves DigitalAsset inventory via PostgreSQL FOR UPDATE SKIP LOCKED
 * and notifies the Admin Telegram Group.
 */
ordersRouter.post(
  '/orders',
  orderCreateLimiter,
  optionalTelegramAuth,
  handleReceiptUpload,
  async (req: Request, res: Response) => {
    const uploadedFile = req.file;

    if (!uploadedFile || !uploadedFile.buffer) {
      res.status(400).json({ error: 'Payment receipt screenshot image (field: receipt) is required' });
      return;
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid order submission',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const input = parsed.data;
    let lineItems: Array<{ productId: string; quantity: number }>;
    try {
      lineItems = resolveRequestedLineItems(input);
    } catch (itemErr) {
      res.status(400).json({
        error: itemErr instanceof Error ? itemErr.message : 'Invalid cart items payload',
      });
      return;
    }

    const { email, phone } = splitContact(
      input.customerContact,
      input.customerEmail,
      input.customerPhone
    );

    if (!req.telegramUser && !email && !phone) {
      res.status(400).json({
        error: 'Provide customerContact (email or phone) or authenticate via Telegram Mini App',
      });
      return;
    }

    let sanitizedAbsPath: string | undefined;
    const actorIp = extractClientIp(req);

    try {
      // Security Layer 0 — Polyglot & EXIF Defense: validate true binary headers, strip metadata,
      // re-encode to clean WebP, and compute SHA-256 + 64-bit dHash perceptual hash.
      const sanitized = await sanitizeAndHashReceipt(uploadedFile.buffer);
      const receiptHash = sanitized.sha256Hash;
      const perceptualHash = sanitized.perceptualHash;

      // Fast pre-check for exact duplicate receipt image before writing to disk or invoking OCR
      const preDuplicateReceipt = await prisma.paymentProof.findFirst({
        where: { receiptHash },
        select: {
          id: true,
          order: { select: { orderNumber: true } },
        },
      });
      if (preDuplicateReceipt) {
        res.status(409).json({
          error: `Duplicate receipt image detected. This exact screenshot was already used for order ${preDuplicateReceipt.order.orderNumber}.`,
        });
        return;
      }

      // Compute 64-bit dHash similarity against previously approved receipts (>= 92% => distance <= 5)
      const approvedPerceptualProofs = await prisma.paymentProof.findMany({
        where: {
          perceptualHash: { not: null },
          order: { status: OrderStatus.APPROVED },
        },
        orderBy: { submittedAt: 'desc' },
        take: 500,
        select: {
          perceptualHash: true,
          order: { select: { orderNumber: true } },
        },
      });

      let isSimilarSlipWarning = false;
      let similarSlipOrderNumber: string | null = null;
      let similarSlipDistance: number | null = null;

      for (const prevProof of approvedPerceptualProofs) {
        if (!prevProof.perceptualHash) continue;
        const dist = computeHammingDistance(perceptualHash, prevProof.perceptualHash);
        if (dist <= 5 && (similarSlipDistance === null || dist < similarSlipDistance)) {
          isSimilarSlipWarning = true;
          similarSlipOrderNumber = prevProof.order.orderNumber;
          similarSlipDistance = dist;
        }
      }

      const savedFile = await writeSanitizedReceiptFile(
        sanitized.sanitizedBuffer,
        sanitized.extension
      );
      sanitizedAbsPath = savedFile.absPath;
      const receiptPath = savedFile.receiptPath;

      const normalizedTx6 = input.transactionLast6?.trim().toUpperCase() || null;
      const reservationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const requestedProductIds = lineItems.map((i) => i.productId);

      // Load merchant payment accounts + validate product prices/promo preview BEFORE running AI Vision
      const [merchantMethods, previewProducts] = await Promise.all([
        prisma.paymentMethod.findMany({
          where: { isActive: true },
          select: {
            provider: true,
            accountName: true,
            accountPhone: true,
          },
        }),
        prisma.product.findMany({
          where: { id: { in: requestedProductIds }, isActive: true },
          select: { id: true, priceMmk: true },
        }),
      ]);

      const previewProductMap = new Map(previewProducts.map((p) => [p.id, p]));
      let expectedTotalForOcr = 0;
      for (const reqItem of lineItems) {
        const matchedProd = previewProductMap.get(reqItem.productId);
        if (!matchedProd) {
          await safeUnlinkFile(sanitizedAbsPath);
          res.status(404).json({ error: 'One or more selected products are unavailable' });
          return;
        }
        expectedTotalForOcr += matchedProd.priceMmk * reqItem.quantity;
      }
      if (input.promoCode?.trim()) {
        const promoCandidate = await prisma.promoCode.findUnique({
          where: { code: input.promoCode.trim().toUpperCase() },
          select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
            maxUses: true,
            usedCount: true,
            expiresAt: true,
            isActive: true,
          },
        });
        const check = validatePromoEligibility(promoCandidate);
        if (check.valid) {
          expectedTotalForOcr = computePromoTotals(check.promo, expectedTotalForOcr).totalMmk;
        }
      }

      // Layer 1 — AI Vision / OCR inspection on sanitized buffer (gracefully falls back to manual review if flagged)
      const ocrResult = await verifyReceiptImage({
        imageBuffer: sanitized.sanitizedBuffer,
        mimeType: sanitized.mimeType,
        expectedProvider: input.paymentMethod,
        expectedAmountMmk: expectedTotalForOcr,
        merchantAccounts: merchantMethods,
      });

      const resolvedTx6 = normalizedTx6 ?? ocrResult.transactionLast6;

      const createdOrder = await prisma.$transaction(
        async (tx) => {
          const duplicateReceipt = await tx.paymentProof.findFirst({
            where: { receiptHash },
            select: {
              id: true,
              order: { select: { orderNumber: true } },
            },
          });

          if (duplicateReceipt) {
            throw new HttpError(
              `Duplicate receipt image detected. This exact screenshot was already used for order ${duplicateReceipt.order.orderNumber}.`,
              409
            );
          }

          let isDuplicateTxWarning = false;
          let duplicateTxOrderNumber: string | null = null;
          if (resolvedTx6 || ocrResult.transactionId) {
            const matchedApprovedTx = await tx.paymentProof.findFirst({
              where: {
                order: { status: OrderStatus.APPROVED },
                OR: [
                  ...(ocrResult.transactionId
                    ? [{ ocrExtractedTxId: ocrResult.transactionId }]
                    : []),
                  ...(resolvedTx6 ? [{ transactionLast6: resolvedTx6 }] : []),
                ],
              },
              orderBy: { submittedAt: 'desc' },
              select: {
                order: { select: { orderNumber: true } },
              },
            });

            if (matchedApprovedTx) {
              isDuplicateTxWarning = true;
              duplicateTxOrderNumber = matchedApprovedTx.order.orderNumber;
            }
          }
          const txProducts = await tx.product.findMany({
            where: {
              id: { in: requestedProductIds },
              isActive: true,
            },
          });

          const txProductMap = new Map(txProducts.map((p) => [p.id, p]));
          for (const reqItem of lineItems) {
            if (!txProductMap.has(reqItem.productId)) {
              throw new HttpError('One or more selected products are unavailable', 404);
            }
          }

          // Resolve or upsert customer identity (Telegram Mini App user OR Web guest)
          let customerId: string;

          if (req.telegramUser) {
            const tgId = BigInt(req.telegramUser.id);
            const tgCustomer = await tx.customer.upsert({
              where: { telegramId: tgId },
              update: {
                telegramUsername: req.telegramUser.username ?? null,
                firstName: req.telegramUser.first_name ?? null,
                lastName: req.telegramUser.last_name ?? null,
                preferredLocale: input.locale,
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
              },
              create: {
                telegramId: tgId,
                telegramUsername: req.telegramUser.username ?? null,
                firstName: req.telegramUser.first_name ?? null,
                lastName: req.telegramUser.last_name ?? null,
                email: email ?? null,
                phone: phone ?? null,
                preferredLocale: input.locale,
              },
            });

            await tx.botSubscriber.upsert({
              where: { telegramUserId: tgId },
              update: {
                telegramUsername: req.telegramUser.username ?? null,
                firstName: req.telegramUser.first_name ?? null,
                lastName: req.telegramUser.last_name ?? null,
                source: 'MINI_APP',
                isBlocked: false,
                lastActiveAt: new Date(),
              },
              create: {
                telegramUserId: tgId,
                telegramUsername: req.telegramUser.username ?? null,
                firstName: req.telegramUser.first_name ?? null,
                lastName: req.telegramUser.last_name ?? null,
                source: 'MINI_APP',
              },
            });

            customerId = tgCustomer.id;
          } else {
            const existingGuest = await tx.customer.findFirst({
              where: {
                OR: [
                  ...(email ? [{ email }] : []),
                  ...(phone ? [{ phone }] : []),
                ],
              },
            });

            if (existingGuest) {
              const updated = await tx.customer.update({
                where: { id: existingGuest.id },
                data: {
                  preferredLocale: input.locale,
                  ...(email && !existingGuest.email ? { email } : {}),
                  ...(phone && !existingGuest.phone ? { phone } : {}),
                },
              });
              customerId = updated.id;
            } else {
              const createdGuest = await tx.customer.create({
                data: {
                  email: email ?? null,
                  phone: phone ?? null,
                  preferredLocale: input.locale,
                },
              });
              customerId = createdGuest.id;
            }
          }

          // Row-level lock on AVAILABLE DigitalAsset rows per cart item (sorted deterministically by productId)
          const reservationsByProduct = new Map<string, string[]>();
          let subtotalMmk = 0;

          const orderItemsCreateData: Array<{
            productId: string;
            quantity: number;
            unitPriceMmk: number;
            subtotalMmk: number;
          }> = [];

          for (const reqItem of lineItems) {
            const product = txProductMap.get(reqItem.productId)!;
            const lockedAssets = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT id
                FROM "DigitalAsset"
                WHERE "productId" = ${product.id}
                  AND "status" = 'AVAILABLE'
                ORDER BY "createdAt" ASC
                FOR UPDATE SKIP LOCKED
                LIMIT ${reqItem.quantity}
              `
            );

            if (lockedAssets.length < reqItem.quantity) {
              throw new HttpError(
                `Insufficient stock for ${product.titleEn}: requested ${reqItem.quantity}, only ${lockedAssets.length} available`,
                409
              );
            }

            const itemSubtotal = product.priceMmk * reqItem.quantity;
            subtotalMmk += itemSubtotal;
            reservationsByProduct.set(
              product.id,
              lockedAssets.map((a) => a.id)
            );
            orderItemsCreateData.push({
              productId: product.id,
              quantity: reqItem.quantity,
              unitPriceMmk: product.priceMmk,
              subtotalMmk: itemSubtotal,
            });
          }

          let discountMmk = 0;
          let totalMmk = subtotalMmk;
          let appliedPromoId: string | null = null;
          let appliedPromoText: string | null = null;

          const rawPromo = input.promoCode?.trim();
          if (rawPromo) {
            const normalizedCode = rawPromo.toUpperCase();
            const lockedPromoRows = await tx.$queryRaw<PromoSnapshot[]>(
              Prisma.sql`
                SELECT id, code, "discountType", "discountValue", "maxUses", "usedCount", "expiresAt", "isActive"
                FROM "PromoCode"
                WHERE code = ${normalizedCode}
                FOR UPDATE
              `
            );

            const promoRow = lockedPromoRows[0] ?? null;
            const check = validatePromoEligibility(promoRow);
            if (!check.valid) {
              throw new HttpError(check.reason, 400);
            }

            const totals = computePromoTotals(check.promo, subtotalMmk);
            discountMmk = totals.discountMmk;
            totalMmk = totals.totalMmk;
            appliedPromoId = check.promo.id;
            appliedPromoText = check.promo.code;

            await tx.promoCode.update({
              where: { id: check.promo.id },
              data: { usedCount: { increment: 1 } },
            });
          }

          const orderNumber = generateOrderNumber();
          const accessToken = generateOrderAccessToken();

          const order = await tx.order.create({
            data: {
              orderNumber,
              accessToken,
              customerId,
              status: OrderStatus.PENDING_APPROVAL,
              locale: input.locale,
              subtotalMmk,
              discountMmk,
              totalMmk,
              promoCodeId: appliedPromoId,
              promoCodeText: appliedPromoText,
              contactEmail: email ?? null,
              contactPhone: phone ?? null,
              telegramChatId: req.telegramUser ? BigInt(req.telegramUser.id) : null,
              expiresAt: reservationExpiresAt,
              items: {
                create: orderItemsCreateData,
              },
              paymentProofs: {
                create: {
                  provider: input.paymentMethod,
                  receiptPath,
                  receiptHash,
                  perceptualHash,
                  mimeType: sanitized.mimeType,
                  fileSizeBytes: sanitized.fileSizeBytes,
                  transactionLast6: resolvedTx6,
                  isDuplicateTxWarning,
                  duplicateTxOrderNumber,
                  isSimilarSlipWarning,
                  similarSlipOrderNumber,
                  similarSlipDistance,
                  verificationMode: VerificationMode.MANUAL_REVIEW,
                  ocrExtractedTxId: ocrResult.transactionId,
                  ocrExtractedAmount: ocrResult.amountMmk,
                  ocrConfidenceScore: ocrResult.confidenceScore,
                  ocrTamperingFlags: ocrResult.tamperingFlags,
                  ocrValidationNotes: ocrResult.validationNotes,
                  senderName: input.senderName ?? null,
                  senderPhone: input.senderPhone ?? null,
                },
              },
            },
            include: {
              items: true,
              paymentProofs: {
                take: 1,
                select: {
                  isDuplicateTxWarning: true,
                  isSimilarSlipWarning: true,
                },
              },
            },
          });

          const allReservedIds: string[] = [];
          for (const createdItem of order.items) {
            const assetIds = reservationsByProduct.get(createdItem.productId) ?? [];
            if (assetIds.length === 0) continue;
            allReservedIds.push(...assetIds);
            await tx.digitalAsset.updateMany({
              where: { id: { in: assetIds } },
              data: {
                status: AssetStatus.RESERVED,
                orderItemId: createdItem.id,
                reservedUntil: reservationExpiresAt,
              },
            });
          }

          await recordAuditLog(tx, {
            actorType: ActorType.CUSTOMER,
            actorId: customerId,
            actorIp,
            action: 'ORDER_CREATED_AND_RESERVED',
            entityType: 'Order',
            entityId: order.id,
            targetId: order.orderNumber,
            metadata: {
              orderNumber: order.orderNumber,
              items: lineItems,
              paymentMethod: input.paymentMethod,
              promoCode: appliedPromoText,
              discountMmk,
              totalMmk,
              receiptHash,
              perceptualHash,
              isDuplicateTxWarning,
              duplicateTxOrderNumber,
              isSimilarSlipWarning,
              similarSlipOrderNumber,
              similarSlipDistance,
              reservedAssetIds: allReservedIds,
            },
          });

          return order;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        }
      );

      // Layer 2 Bidirectional Auto-Match:
      // - If AI OCR passed cleanly + no duplicate Tx / similar slip warning -> try instant match
      // - If matched -> instant key unlock + passive Admin log
      // - If OCR passed cleanly and waiting for SMS -> schedule 60s fallback timer
      // - If OCR failed/flagged tampering or duplicate/similar slip -> immediate Admin Group alert
      let finalStatus: OrderStatus = createdOrder.status;
      let finalVerificationMode: VerificationMode = VerificationMode.MANUAL_REVIEW;
      let adminNotified = false;
      let autoVerified = false;

      const proofFlags = createdOrder.paymentProofs[0];
      if (
        ocrResult.passedAutoChecks &&
        !proofFlags?.isDuplicateTxWarning &&
        !proofFlags?.isSimilarSlipWarning
      ) {
        const ledgerMatch = await tryAutoMatchOrderWithLedger(createdOrder.id);
        if (ledgerMatch.matched) {
          finalStatus = OrderStatus.APPROVED;
          finalVerificationMode = VerificationMode.AUTO_VERIFIED;
          autoVerified = true;
          adminNotified = true;
        } else {
          scheduleAdminFallbackTimer(createdOrder.id, 60_000);
        }
      } else {
        const telegramNotification = await notifyAdminNewOrder(createdOrder.id);
        adminNotified = telegramNotification.sent;
      }

      res.status(201).json({
        orderNumber: createdOrder.orderNumber,
        accessToken: createdOrder.accessToken,
        status: finalStatus,
        verificationMode: finalVerificationMode,
        autoVerified,
        ocrSummary: {
          passedAutoChecks: ocrResult.passedAutoChecks,
          extractedTxId: ocrResult.transactionId,
          extractedAmountMmk: ocrResult.amountMmk,
          confidenceScore: ocrResult.confidenceScore,
          tamperingFlags: ocrResult.tamperingFlags,
          validationNotes: ocrResult.validationNotes,
        },
        subtotalMmk: createdOrder.subtotalMmk ?? createdOrder.totalMmk,
        discountMmk: createdOrder.discountMmk,
        promoCode: createdOrder.promoCodeText,
        totalMmk: createdOrder.totalMmk,
        paymentMethod: input.paymentMethod,
        receiptPath,
        adminNotified,
        createdAt: createdOrder.createdAt,
      });
    } catch (err) {
      await safeUnlinkFile(sanitizedAbsPath);

      if (err instanceof InvalidReceiptImageError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }

      console.error('[POST /api/orders] Error:', err);
      res.status(500).json({ error: 'Failed to create order and reserve stock' });
    }
  }
);

/**
 * Helper to mask buyer identity cleanly without leaking PII.
 */
function maskBuyerIdentifier(input: {
  firstName: string | null;
  telegramUsername: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}): string {
  const raw =
    input.firstName?.trim() ||
    input.telegramUsername?.trim() ||
    input.contactPhone?.trim() ||
    input.contactEmail?.split('@')[0]?.trim() ||
    'Customer';

  if (/^\d+$/.test(raw) && raw.length >= 6) {
    return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  }

  const prefix = raw.slice(0, 2);
  return `${prefix}***`;
}

/**
 * GET /api/orders/recent-activity
 * Public, rate-limited endpoint returning anonymized recent APPROVED orders
 * for the storefront social-proof ticker.
 */
ordersRouter.get('/orders/recent-activity', orderStatusLimiter, async (_req: Request, res: Response) => {
  try {
    const recentApproved = await prisma.order.findMany({
      where: { status: OrderStatus.APPROVED },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        contactEmail: true,
        contactPhone: true,
        reviewedAt: true,
        createdAt: true,
        customer: {
          select: {
            firstName: true,
            telegramUsername: true,
          },
        },
        items: {
          take: 1,
          select: {
            product: {
              select: {
                titleEn: true,
                titleMm: true,
                durationLabelEn: true,
                durationLabelMm: true,
              },
            },
          },
        },
      },
    });

    const nowMs = Date.now();
    const activities = recentApproved
      .filter((ord) => ord.items.length > 0)
      .map((ord) => {
        const timestamp = ord.reviewedAt ?? ord.createdAt;
        const minutesAgo = Math.max(1, Math.round((nowMs - timestamp.getTime()) / 60000));
        const prod = ord.items[0].product;
        return {
          id: ord.id,
          maskedBuyer: maskBuyerIdentifier({
            firstName: ord.customer.firstName,
            telegramUsername: ord.customer.telegramUsername,
            contactEmail: ord.contactEmail,
            contactPhone: ord.contactPhone,
          }),
          productTitleEn: prod.titleEn,
          productTitleMm: prod.titleMm,
          durationLabelEn: prod.durationLabelEn,
          durationLabelMm: prod.durationLabelMm,
          minutesAgo,
          approvedAt: timestamp.toISOString(),
        };
      });

    res.json({ activities });
  } catch (err) {
    console.error('[GET /api/orders/recent-activity] Error:', err);
    res.status(500).json({ error: 'Failed to load recent purchases' });
  }
});

/**
 * GET /api/orders/:orderNumber
 * Public endpoint to inspect order status.
 * Decrypts and returns assigned digital keys/accounts/VPN configs ONLY IF:
 * 1) Order status is APPROVED, AND
 * 2) Caller provides matching `accessToken` (?token=... or x-order-token) OR matching verified Telegram user.
 */
ordersRouter.get('/orders/:orderNumber', orderStatusLimiter, optionalTelegramAuth, async (req: Request, res: Response) => {
  try {
    const orderNumber = String(req.params.orderNumber ?? '').trim();
    const providedToken =
      (typeof req.query.token === 'string' ? req.query.token.trim() : '') ||
      (req.header('x-order-token')?.trim() ?? '');

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: {
          select: {
            telegramId: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                titleEn: true,
                titleMm: true,
                deliveryFormat: true,
                deliveryInstructionsEn: true,
                deliveryInstructionsMm: true,
              },
            },
            assets: {
              where: {
                status: { in: [AssetStatus.SOLD, AssetStatus.RESERVED] },
              },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                status: true,
                encryptedPayload: true,
                iv: true,
                authTag: true,
                regionLabel: true,
                expiresAt: true,
              },
            },
          },
        },
        paymentProofs: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: {
            provider: true,
            transactionLast6: true,
            verificationMode: true,
            ocrExtractedTxId: true,
            ocrExtractedAmount: true,
            ocrConfidenceScore: true,
            ocrTamperingFlags: true,
            ocrValidationNotes: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const tokenAuthorized =
      Boolean(providedToken) && safeTimingCompare(providedToken, order.accessToken);
    const telegramAuthorized =
      Boolean(req.telegramUser) &&
      order.customer.telegramId !== null &&
      BigInt(req.telegramUser!.id) === order.customer.telegramId;

    const isAuthorizedToReveal = tokenAuthorized || telegramAuthorized;
    const isApproved = order.status === OrderStatus.APPROVED;

    const items = order.items.map((item) => ({
      productId: item.product.id,
      slug: item.product.slug,
      titleEn: item.product.titleEn,
      titleMm: item.product.titleMm,
      deliveryFormat: item.product.deliveryFormat,
      deliveryInstructionsEn: item.product.deliveryInstructionsEn,
      deliveryInstructionsMm: item.product.deliveryInstructionsMm,
      quantity: item.quantity,
      unitPriceMmk: item.unitPriceMmk,
      subtotalMmk: item.subtotalMmk,
      deliveredSecrets:
        isApproved && isAuthorizedToReveal
          ? item.assets.map((asset) => ({
              assetId: asset.id,
              payload: decryptSecret({
                encryptedPayload: asset.encryptedPayload,
                iv: asset.iv,
                authTag: asset.authTag,
              }),
              regionLabel: asset.regionLabel,
              expiresAt: asset.expiresAt,
            }))
          : [],
    }));

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalMmk: order.subtotalMmk ?? order.totalMmk,
      discountMmk: order.discountMmk,
      promoCode: order.promoCodeText,
      totalMmk: order.totalMmk,
      locale: order.locale,
      paymentProof: order.paymentProofs[0] ?? null,
      rejectionReason: order.status === OrderStatus.REJECTED ? order.rejectionReason : null,
      requiresTokenToViewSecrets: isApproved && !isAuthorizedToReveal,
      createdAt: order.createdAt,
      reviewedAt: order.reviewedAt,
      items,
    });
  } catch (err) {
    console.error('[GET /api/orders/:orderNumber] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve order details' });
  }
});
