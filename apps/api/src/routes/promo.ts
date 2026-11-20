import { DiscountType } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const promoRouter = Router();

const promoValidateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many promo code validation requests. Please slow down.' },
});

const promoCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10).optional().default(1),
});

const validatePromoSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    productId: z.string().min(1).optional(),
    quantity: z.coerce.number().int().min(1).max(10).optional().default(1),
    items: z.array(promoCartItemSchema).min(1).max(10).optional(),
  })
  .refine((data) => Boolean(data.items?.length || data.productId), {
    message: 'Provide productId or non-empty items array',
  });

export interface PromoSnapshot {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export function validatePromoEligibility(
  promo: PromoSnapshot | null,
  now = new Date()
): { valid: true; promo: PromoSnapshot } | { valid: false; reason: string } {
  if (!promo) {
    return { valid: false, reason: 'Promo code not found.' };
  }
  if (!promo.isActive) {
    return { valid: false, reason: 'This promo code is currently inactive.' };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: 'This promo code has expired.' };
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { valid: false, reason: 'This promo code has reached its maximum usage limit.' };
  }
  return { valid: true, promo };
}

export function computePromoTotals(
  promo: Pick<PromoSnapshot, 'discountType' | 'discountValue'>,
  subtotalMmk: number
): { discountMmk: number; totalMmk: number } {
  if (subtotalMmk <= 0) {
    return { discountMmk: 0, totalMmk: 0 };
  }

  let rawDiscount = 0;
  if (promo.discountType === DiscountType.PERCENTAGE) {
    const pct = Math.max(0, Math.min(100, promo.discountValue));
    rawDiscount = Math.floor((subtotalMmk * pct) / 100);
  } else {
    rawDiscount = Math.max(0, promo.discountValue);
  }

  const discountMmk = Math.min(subtotalMmk, rawDiscount);
  const totalMmk = Math.max(0, subtotalMmk - discountMmk);

  return { discountMmk, totalMmk };
}

/**
 * POST /api/promo/validate
 * Validates a promo code against a single product or multi-item cart without consuming uses.
 */
promoRouter.post('/promo/validate', promoValidateLimiter, async (req: Request, res: Response) => {
  const parsed = validatePromoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid promo validation request',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const normalizedCode = parsed.data.code.trim().toUpperCase();
  const lineItems = parsed.data.items?.length
    ? parsed.data.items
    : [{ productId: parsed.data.productId!, quantity: parsed.data.quantity }];

  const productIds = Array.from(new Set(lineItems.map((i) => i.productId)));

  try {
    const [products, promo] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, priceMmk: true },
      }),
      prisma.promoCode.findUnique({
        where: { code: normalizedCode },
      }),
    ]);

    const productPriceMap = new Map(products.map((p) => [p.id, p.priceMmk]));
    let subtotalMmk = 0;
    for (const item of lineItems) {
      const unitPrice = productPriceMap.get(item.productId);
      if (unitPrice === undefined) {
        res.status(404).json({ error: 'One or more selected products are unavailable' });
        return;
      }
      subtotalMmk += unitPrice * item.quantity;
    }

    const eligibility = validatePromoEligibility(promo);
    if (!eligibility.valid) {
      res.status(400).json({ valid: false, error: eligibility.reason });
      return;
    }

    const { discountMmk, totalMmk } = computePromoTotals(eligibility.promo, subtotalMmk);

    res.json({
      valid: true,
      code: eligibility.promo.code,
      discountType: eligibility.promo.discountType,
      discountValue: eligibility.promo.discountValue,
      subtotalMmk,
      discountMmk,
      totalMmk,
    });
  } catch (err) {
    console.error('[POST /api/promo/validate] Error:', err);
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
});
