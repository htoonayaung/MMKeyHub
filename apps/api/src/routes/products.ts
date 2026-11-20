import fs from 'node:fs';
import path from 'node:path';
import { ActorType, AssetStatus, DeliveryFormat } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getProductImagesUploadDir } from '../middleware/upload.js';
import { extractClientIp, recordAuditLog } from '../utils/audit.js';
import { encryptSecret } from '../utils/crypto.js';
import { requireAdminApiKey } from '../utils/telegramAuth.js';

export const productsRouter = Router();

function isValidProductImageUrl(val: string): boolean {
  if (val === '') return true;
  if (/^https?:\/\//i.test(val)) return true;
  if (/^\/(api\/products\/images|images)\/[A-Za-z0-9._-]+$/.test(val)) return true;
  return false;
}

const createProductSchema = z.object({
  categoryId: z.string().min(1).optional(),
  categorySlug: z.string().min(1).optional(),
  categoryNameEn: z.string().min(1).optional(),
  categoryNameMm: z.string().min(1).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must contain lowercase letters, numbers, and hyphens only'),
  titleEn: z.string().min(2).max(160),
  titleMm: z.string().min(1).max(200),
  descriptionEn: z.string().min(2),
  descriptionMm: z.string().min(1),
  deliveryInstructionsEn: z.string().optional(),
  deliveryInstructionsMm: z.string().optional(),
  priceMmk: z.coerce.number().int().positive(),
  originalPriceMmk: z.coerce.number().int().positive().nullable().optional(),
  deliveryFormat: z.nativeEnum(DeliveryFormat),
  durationLabelEn: z.string().max(60).optional(),
  durationLabelMm: z.string().max(80).optional(),
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
  isFeatured: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const bulkStockSchema = z.object({
  items: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  delimiter: z.enum(['newline', 'block']).optional().default('newline'),
  regionLabel: z.string().max(64).optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * GET /api/products
 * Public catalog endpoint returning active products with available stock counts.
 * Never exposes encrypted or decrypted DigitalAsset payloads.
 */
productsRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
    const formatQuery = typeof req.query.format === 'string' ? req.query.format.trim() : undefined;

    const deliveryFormat =
      formatQuery && Object.values(DeliveryFormat).includes(formatQuery as DeliveryFormat)
        ? (formatQuery as DeliveryFormat)
        : undefined;

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        category: {
          isActive: true,
          ...(categorySlug ? { slug: categorySlug } : {}),
        },
        ...(deliveryFormat ? { deliveryFormat } : {}),
      },
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
    });

    const productIds = products.map((p) => p.id);
    const stockCounts =
      productIds.length > 0
        ? await prisma.digitalAsset.groupBy({
            by: ['productId'],
            where: {
              productId: { in: productIds },
              status: AssetStatus.AVAILABLE,
            },
            _count: { _all: true },
          })
        : [];

    const countMap = new Map<string, number>();
    for (const row of stockCounts) {
      countMap.set(row.productId, row._count._all);
    }

    const data = products.map((product) => ({
      id: product.id,
      slug: product.slug,
      titleEn: product.titleEn,
      titleMm: product.titleMm,
      descriptionEn: product.descriptionEn,
      descriptionMm: product.descriptionMm,
      deliveryInstructionsEn: product.deliveryInstructionsEn,
      deliveryInstructionsMm: product.deliveryInstructionsMm,
      priceMmk: product.priceMmk,
      originalPriceMmk: product.originalPriceMmk,
      deliveryFormat: product.deliveryFormat,
      durationLabelEn: product.durationLabelEn,
      durationLabelMm: product.durationLabelMm,
      imageUrl: product.imageUrl,
      isFeatured: product.isFeatured,
      category: product.category,
      availableStockCount: countMap.get(product.id) ?? 0,
    }));

    res.json({ products: data });
  } catch (err) {
    console.error('[GET /api/products] Error:', err);
    res.status(500).json({ error: 'Failed to load products catalog' });
  }
});

/**
 * GET /api/products/images/:filename
 * Serves sanitized admin-uploaded product cover images publicly for the storefront.
 */
productsRouter.get('/products/images/:filename', (req: Request, res: Response) => {
  const rawName = String(req.params.filename ?? '');
  const safeName = path.basename(rawName);
  if (!safeName || safeName !== rawName || !/^[A-Za-z0-9._-]+$/.test(safeName)) {
    res.status(400).json({ error: 'Invalid product image filename' });
    return;
  }

  const uploadDir = getProductImagesUploadDir();
  const absPath = path.resolve(uploadDir, safeName);
  if (!absPath.startsWith(uploadDir + path.sep)) {
    res.status(403).json({ error: 'Forbidden path' });
    return;
  }

  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Product image not found' });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(absPath);
});

/**
 * GET /api/products/:slugOrId
 * Public product detail endpoint with available stock count.
 */
productsRouter.get('/products/:slugOrId', async (req: Request, res: Response) => {
  try {
    const slugOrId = String(req.params.slugOrId ?? '').trim();
    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
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
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const availableStockCount = await prisma.digitalAsset.count({
      where: {
        productId: product.id,
        status: AssetStatus.AVAILABLE,
      },
    });

    res.json({
      product: {
        id: product.id,
        slug: product.slug,
        titleEn: product.titleEn,
        titleMm: product.titleMm,
        descriptionEn: product.descriptionEn,
        descriptionMm: product.descriptionMm,
        deliveryInstructionsEn: product.deliveryInstructionsEn,
        deliveryInstructionsMm: product.deliveryInstructionsMm,
        priceMmk: product.priceMmk,
        originalPriceMmk: product.originalPriceMmk,
        deliveryFormat: product.deliveryFormat,
        durationLabelEn: product.durationLabelEn,
        durationLabelMm: product.durationLabelMm,
        imageUrl: product.imageUrl,
        isFeatured: product.isFeatured,
        category: product.category,
        availableStockCount,
      },
    });
  } catch (err) {
    console.error('[GET /api/products/:slugOrId] Error:', err);
    res.status(500).json({ error: 'Failed to load product details' });
  }
});

/**
 * POST /api/admin/products
 * Admin endpoint protected by ADMIN_API_KEY to create a product (and optionally upsert its category).
 */
productsRouter.post('/admin/products', requireAdminApiKey, async (req: Request, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid product payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const input = parsed.data;

  if (
    input.originalPriceMmk !== undefined &&
    input.originalPriceMmk !== null &&
    input.originalPriceMmk <= input.priceMmk
  ) {
    res.status(400).json({
      error: 'Original price must be higher than the discounted price (or leave blank)',
    });
    return;
  }

  try {
    let resolvedCategoryId = input.categoryId;

    if (!resolvedCategoryId) {
      const slug = input.categorySlug ?? 'general';
      const existingCategory = await prisma.category.findUnique({ where: { slug } });

      if (existingCategory) {
        resolvedCategoryId = existingCategory.id;
      } else {
        const createdCategory = await prisma.category.create({
          data: {
            slug,
            nameEn: input.categoryNameEn ?? slug,
            nameMm: input.categoryNameMm ?? input.categoryNameEn ?? slug,
          },
        });
        resolvedCategoryId = createdCategory.id;
      }
    }

    const product = await prisma.product.create({
      data: {
        categoryId: resolvedCategoryId,
        slug: input.slug,
        titleEn: input.titleEn,
        titleMm: input.titleMm,
        descriptionEn: input.descriptionEn,
        descriptionMm: input.descriptionMm,
        deliveryInstructionsEn: input.deliveryInstructionsEn,
        deliveryInstructionsMm: input.deliveryInstructionsMm,
        priceMmk: input.priceMmk,
        originalPriceMmk: input.originalPriceMmk ?? null,
        deliveryFormat: input.deliveryFormat,
        durationLabelEn: input.durationLabelEn,
        durationLabelMm: input.durationLabelMm,
        imageUrl: input.imageUrl,
        isFeatured: input.isFeatured,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
      include: {
        category: true,
      },
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      targetId: product.id,
      metadata: { slug: product.slug, priceMmk: product.priceMmk },
    });

    res.status(201).json({ product });
  } catch (err: unknown) {
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === 'P2002') {
      res.status(409).json({ error: 'A product with this slug already exists' });
      return;
    }
    if (prismaCode === 'P2003') {
      res.status(400).json({ error: 'Specified categoryId does not exist' });
      return;
    }
    console.error('[POST /api/admin/products] Error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * POST /api/admin/products/:id/stock
 * Admin endpoint protected by ADMIN_API_KEY to bulk-upload encrypted license keys,
 * account credentials, or VPN configs (newline-separated text or array).
 */
productsRouter.post('/admin/products/:id/stock', requireAdminApiKey, async (req: Request, res: Response) => {
  const productId = String(req.params.id ?? '').trim();
  const parsed = bulkStockSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid stock upload payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const { items, delimiter, regionLabel, expiresAt } = parsed.data;
    const rawEntries = Array.isArray(items)
      ? items
      : delimiter === 'block'
        ? items.split(/\r?\n---\r?\n/)
        : items.split(/\r?\n/);

    const cleanedEntries = rawEntries
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (cleanedEntries.length === 0) {
      res.status(400).json({ error: 'No non-empty stock items provided' });
      return;
    }

    // Deduplicate within the incoming batch before hitting PostgreSQL
    const uniqueByFingerprint = new Map<string, ReturnType<typeof encryptSecret>>();
    for (const secret of cleanedEntries) {
      const envelope = encryptSecret(secret);
      if (!uniqueByFingerprint.has(envelope.keyFingerprint)) {
        uniqueByFingerprint.set(envelope.keyFingerprint, envelope);
      }
    }

    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
    const recordsToInsert = Array.from(uniqueByFingerprint.values()).map((envelope) => ({
      productId: product.id,
      status: AssetStatus.AVAILABLE,
      encryptedPayload: envelope.encryptedPayload,
      iv: envelope.iv,
      authTag: envelope.authTag,
      keyFingerprint: envelope.keyFingerprint,
      regionLabel: regionLabel ?? null,
      expiresAt: parsedExpiresAt,
    }));

    const insertResult = await prisma.digitalAsset.createMany({
      data: recordsToInsert,
      skipDuplicates: true,
    });

    const availableStockCount = await prisma.digitalAsset.count({
      where: {
        productId: product.id,
        status: AssetStatus.AVAILABLE,
      },
    });

    await recordAuditLog(prisma, {
      actorType: ActorType.ADMIN,
      actorId: 'web-admin',
      actorIp: extractClientIp(req),
      action: 'STOCK_UPLOADED',
      entityType: 'Product',
      entityId: product.id,
      targetId: product.id,
      metadata: {
        productTitle: product.titleEn,
        submittedCount: cleanedEntries.length,
        insertedCount: insertResult.count,
        skippedDuplicates: cleanedEntries.length - insertResult.count,
      },
    });

    res.status(201).json({
      productId: product.id,
      submittedCount: cleanedEntries.length,
      insertedCount: insertResult.count,
      skippedDuplicates: cleanedEntries.length - insertResult.count,
      availableStockCount,
    });
  } catch (err) {
    console.error('[POST /api/admin/products/:id/stock] Error:', err);
    res.status(500).json({ error: 'Failed to encrypt and store stock items' });
  }
});
