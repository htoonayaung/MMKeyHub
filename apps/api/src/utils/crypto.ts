import crypto from 'node:crypto';
import { env } from '../lib/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // Recommended 96-bit nonce for AES-GCM
const KEY_LENGTH_BYTES = 32; // 256 bits

export interface EncryptedEnvelope {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyFingerprint: string;
}

/**
 * Resolves and validates the 32-byte AES-256 master key from ENCRYPTION_KEY / ENCRYPTION_MASTER_KEY.
 * Supports 64-character hex strings (recommended), 44-character base64 strings, or exact 32-byte UTF-8 strings.
 */
function resolveMasterKey(rawKey?: string): Buffer {
  const source = (rawKey ?? env.encryptionKey).trim();
  if (!source) {
    throw new Error('ENCRYPTION_KEY (or ENCRYPTION_MASTER_KEY) is not configured');
  }

  if (/^[0-9a-fA-F]{64}$/.test(source)) {
    return Buffer.from(source, 'hex');
  }

  const base64Candidate = Buffer.from(source, 'base64');
  if (base64Candidate.length === KEY_LENGTH_BYTES && source.length >= 43) {
    return base64Candidate;
  }

  const utf8Candidate = Buffer.from(source, 'utf8');
  if (utf8Candidate.length === KEY_LENGTH_BYTES) {
    return utf8Candidate;
  }

  throw new Error(
    'ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 32-byte base64/UTF-8)'
  );
}

/**
 * Computes a deterministic SHA-256 fingerprint of a normalized digital secret
 * so duplicate keys/configs can be rejected without storing plaintext.
 */
export function computeKeyFingerprint(plaintext: string): string {
  const normalized = plaintext.trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Encrypts a digital asset payload (license key, account JSON/credentials, or VPN config)
 * using AES-256-GCM with a fresh random 12-byte IV per item.
 */
export function encryptSecret(plaintext: string, overrideKey?: string): EncryptedEnvelope {
  const trimmed = plaintext.trim();
  if (!trimmed) {
    throw new Error('Cannot encrypt an empty secret payload');
  }

  const key = resolveMasterKey(overrideKey);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyFingerprint: computeKeyFingerprint(trimmed),
  };
}

/**
 * Decrypts and authenticates an AES-256-GCM encrypted digital asset payload.
 * Throws if the ciphertext or authTag has been tampered with or the master key is invalid.
 */
export function decryptSecret(
  envelope: Pick<EncryptedEnvelope, 'encryptedPayload' | 'iv' | 'authTag'>,
  overrideKey?: string
): string {
  const key = resolveMasterKey(overrideKey);
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.encryptedPayload, 'base64');

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid AES-GCM initialization vector length');
  }
  if (authTag.length !== 16) {
    throw new Error('Invalid AES-GCM authentication tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generates an unguessable URL-safe access token for guest order status retrieval.
 */
export function generateOrderAccessToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Constant-time string comparison for API keys and tokens.
 */
export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
