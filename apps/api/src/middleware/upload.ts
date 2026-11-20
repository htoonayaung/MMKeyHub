import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../lib/env.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function getReceiptsUploadDir(): string {
  return path.resolve(env.UPLOAD_DIR, 'receipts');
}

function ensureReceiptsDirSync(): string {
  const dir = getReceiptsUploadDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Buffers uploads in RAM instead of trusting raw client bytes directly onto disk.
 * Files are written to disk ONLY after Sharp validates binary image headers,
 * strips EXIF/metadata, and re-encodes cleanly to WebP.
 */
export const uploadReceiptMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxReceiptSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported receipt format. Allowed types: JPG, PNG, WEBP'));
      return;
    }
    cb(null, true);
  },
});

export async function writeSanitizedReceiptFile(
  sanitizedBuffer: Buffer,
  extension: '.webp' = '.webp'
): Promise<{
  filename: string;
  receiptPath: string;
  absPath: string;
}> {
  const dir = ensureReceiptsDirSync();
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const absPath = path.resolve(dir, filename);
  await fsp.writeFile(absPath, sanitizedBuffer, { mode: 0o640 });
  return {
    filename,
    receiptPath: `/uploads/receipts/${filename}`,
    absPath,
  };
}

/**
 * Resolves the absolute filesystem path for a stored relative receiptPath (`/uploads/receipts/...`).
 */
export function resolveReceiptAbsolutePath(receiptPath: string): string {
  const filename = path.basename(receiptPath);
  return path.join(getReceiptsUploadDir(), filename);
}

/**
 * Safely deletes a temporary or orphaned uploaded file without throwing if missing.
 */
export async function safeUnlinkFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    // Ignore ENOENT or cleanup errors
  }
}

export function getProductImagesUploadDir(): string {
  return path.resolve(env.UPLOAD_DIR, 'products');
}

function ensureProductImagesDirSync(): string {
  const dir = getProductImagesUploadDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Buffers admin product cover uploads in memory before Sharp validates and strips metadata.
 */
export const uploadProductImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxReceiptSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported product image format. Allowed types: JPG, PNG, WEBP'));
      return;
    }
    cb(null, true);
  },
});

export async function writeSanitizedProductImageFile(
  sanitizedBuffer: Buffer,
  extension: '.webp' = '.webp'
): Promise<{
  filename: string;
  imageUrl: string;
  absPath: string;
}> {
  const dir = ensureProductImagesDirSync();
  const filename = `prod-${Date.now()}-${crypto.randomUUID()}${extension}`;
  const absPath = path.resolve(dir, filename);
  await fsp.writeFile(absPath, sanitizedBuffer, { mode: 0o644 });
  return {
    filename,
    imageUrl: `/api/products/images/${filename}`,
    absPath,
  };
}

