import crypto from 'node:crypto';
import sharp from 'sharp';

const ALLOWED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class InvalidReceiptImageError extends Error {
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidReceiptImageError';
  }
}

export interface SanitizedReceiptResult {
  sanitizedBuffer: Buffer;
  mimeType: 'image/webp';
  extension: '.webp';
  fileSizeBytes: number;
  sha256Hash: string;
  perceptualHash: string;
  width: number;
  height: number;
}

/**
 * Computes a 64-bit difference hash (dHash) by converting to grayscale,
 * resizing cleanly to 9x8 (72 pixels), and comparing adjacent horizontal pixels.
 * Returns a 16-character zero-padded lowercase hexadecimal string.
 */
export async function computePerceptualDHash(imageBuffer: Buffer): Promise<string> {
  const rawPixels = await sharp(imageBuffer, { failOn: 'error', limitInputPixels: 25_000_000 })
    .grayscale()
    .resize(9, 8, { fit: 'fill', kernel: 'bilinear' })
    .raw()
    .toBuffer();

  if (rawPixels.length < 72) {
    throw new InvalidReceiptImageError('Failed to extract perceptual pixel grid from receipt image.');
  }

  let hashBits = 0n;
  for (let row = 0; row < 8; row += 1) {
    const rowOffset = row * 9;
    for (let col = 0; col < 8; col += 1) {
      const leftPixel = rawPixels[rowOffset + col] ?? 0;
      const rightPixel = rawPixels[rowOffset + col + 1] ?? 0;
      hashBits = (hashBits << 1n) | (leftPixel > rightPixel ? 1n : 0n);
    }
  }

  return hashBits.toString(16).padStart(16, '0');
}

/**
 * Computes bitwise Hamming distance (0..64) between two 16-char hex 64-bit hashes.
 */
export function computeHammingDistance(hexA: string, hexB: string): number {
  if (!/^[0-9a-fA-F]{16}$/.test(hexA) || !/^[0-9a-fA-F]{16}$/.test(hexB)) {
    return 64;
  }

  let xor = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

export function perceptualSimilarityPercent(distance: number): number {
  const clamped = Math.max(0, Math.min(64, distance));
  return Math.round(((64 - clamped) / 64) * 100);
}

/**
 * Polyglot & Metadata Defense:
 * 1. Validates true binary image headers via Sharp/libvips (`jpeg` / `png` / `webp`).
 * 2. Strips all EXIF, GPS, XMP, ICC, and trailing polyglot payloads.
 * 3. Normalizes orientation, caps max dimension to 1800px, and re-encodes to crisp WebP.
 * 4. Computes exact SHA-256 hash and 64-bit dHash perceptual fingerprint.
 */
export async function sanitizeAndHashReceipt(inputBuffer: Buffer): Promise<SanitizedReceiptResult> {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length < 32) {
    throw new InvalidReceiptImageError('Uploaded receipt file is empty or too small.');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer, {
      failOn: 'error',
      limitInputPixels: 25_000_000,
    }).metadata();
  } catch {
    throw new InvalidReceiptImageError(
      'Invalid or corrupted image file. Only genuine JPG, PNG, or WEBP screenshots are accepted.'
    );
  }

  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw new InvalidReceiptImageError(
      `Unsupported binary image header (${metadata.format ?? 'unknown'}). Allowed formats: JPG, PNG, WEBP.`
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 32 || height < 32 || width > 8000 || height > 8000) {
    throw new InvalidReceiptImageError(
      'Receipt image dimensions are invalid. Please upload a clear payment screenshot.'
    );
  }

  try {
    // Re-encode without .withMetadata() / .keepMetadata() to strip all EXIF/XMP/polyglot bytes.
    const { data: sanitizedBuffer, info } = await sharp(inputBuffer, {
      failOn: 'error',
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 86,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    const sha256Hash = crypto.createHash('sha256').update(sanitizedBuffer).digest('hex');
    const perceptualHash = await computePerceptualDHash(sanitizedBuffer);

    return {
      sanitizedBuffer,
      mimeType: 'image/webp',
      extension: '.webp',
      fileSizeBytes: sanitizedBuffer.length,
      sha256Hash,
      perceptualHash,
      width: info.width,
      height: info.height,
    };
  } catch (err) {
    if (err instanceof InvalidReceiptImageError) {
      throw err;
    }
    throw new InvalidReceiptImageError('Could not decode and sanitize receipt image.');
  }
}

export interface SanitizedProductImageResult {
  sanitizedBuffer: Buffer;
  mimeType: 'image/webp';
  extension: '.webp';
  fileSizeBytes: number;
  width: number;
  height: number;
}

/**
 * Validates and sanitizes an Admin-uploaded product cover image via Sharp/libvips:
 * - Verifies true binary headers (JPG, PNG, WEBP)
 * - Strips all EXIF/GPS/XMP/polyglot payloads
 * - Normalizes orientation and fits cleanly within 1200x1200 WebP
 */
export async function sanitizeProductImage(
  inputBuffer: Buffer
): Promise<SanitizedProductImageResult> {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length < 32) {
    throw new InvalidReceiptImageError('Uploaded product image is empty or too small.');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer, {
      failOn: 'error',
      limitInputPixels: 25_000_000,
    }).metadata();
  } catch {
    throw new InvalidReceiptImageError(
      'Invalid or corrupted image file. Only genuine JPG, PNG, or WEBP images are accepted.'
    );
  }

  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw new InvalidReceiptImageError(
      `Unsupported image format (${metadata.format ?? 'unknown'}). Allowed formats: JPG, PNG, WEBP.`
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 32 || height < 32 || width > 8000 || height > 8000) {
    throw new InvalidReceiptImageError(
      'Product image dimensions must be between 32x32 and 8000x8000 pixels.'
    );
  }

  try {
    const { data: sanitizedBuffer, info } = await sharp(inputBuffer, {
      failOn: 'error',
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 86,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      sanitizedBuffer,
      mimeType: 'image/webp',
      extension: '.webp',
      fileSizeBytes: sanitizedBuffer.length,
      width: info.width,
      height: info.height,
    };
  } catch (err) {
    if (err instanceof InvalidReceiptImageError) {
      throw err;
    }
    throw new InvalidReceiptImageError('Could not process uploaded product image.');
  }
}

