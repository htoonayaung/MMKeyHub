import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../lib/env.js';
import { safeTimingCompare } from './crypto.js';

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface TelegramVerifiedData {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
  rawParams: Record<string, string>;
}

export class TelegramAuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'TelegramAuthError';
    this.statusCode = statusCode;
  }
}

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramWebAppUser;
      telegramData?: TelegramVerifiedData;
    }
  }
}

/**
 * Verifies Telegram Mini App `initData` according to Telegram's official WebApp specification:
 * secret_key = HMAC_SHA256("WebAppData", TELEGRAM_BOT_TOKEN)
 * computed_hash = hex(HMAC_SHA256(secret_key, data_check_string))
 */
export function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string = env.TELEGRAM_BOT_TOKEN ?? '',
  ttlSeconds: number = env.TELEGRAM_INIT_DATA_TTL_SECONDS
): TelegramVerifiedData {
  if (!initDataRaw || !initDataRaw.trim()) {
    throw new TelegramAuthError('Missing Telegram initData payload');
  }
  if (!botToken) {
    throw new TelegramAuthError('TELEGRAM_BOT_TOKEN is not configured on the server', 500);
  }

  const params = new URLSearchParams(initDataRaw);
  const providedHash = params.get('hash');
  if (!providedHash || !/^[0-9a-fA-F]{64}$/.test(providedHash)) {
    throw new TelegramAuthError('Invalid or missing Telegram initData hash');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw);
  if (!authDateRaw || !Number.isFinite(authDate) || authDate <= 0) {
    throw new TelegramAuthError('Invalid Telegram initData auth_date');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > ttlSeconds) {
    throw new TelegramAuthError('Telegram initData signature has expired');
  }
  if (authDate - nowSeconds > 300) {
    throw new TelegramAuthError('Telegram initData auth_date is in the future');
  }

  // Build sorted key=value pairs excluding `hash`
  const pairs: string[] = [];
  const rawParams: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    rawParams[key] = value;
    if (key !== 'hash') {
      pairs.push(`${key}=${value}`);
    }
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const providedBuf = Buffer.from(providedHash.toLowerCase(), 'hex');

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new TelegramAuthError('Telegram initData HMAC signature mismatch');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new TelegramAuthError('Telegram initData is missing user metadata');
  }

  let parsedUser: TelegramWebAppUser;
  try {
    parsedUser = JSON.parse(userJson) as TelegramWebAppUser;
  } catch {
    throw new TelegramAuthError('Malformed Telegram user JSON in initData');
  }

  if (!parsedUser || typeof parsedUser.id !== 'number') {
    throw new TelegramAuthError('Telegram user ID is invalid');
  }

  return {
    user: parsedUser,
    authDate,
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
    rawParams,
  };
}

function extractInitDataFromRequest(req: Request): string | null {
  const headerVal = req.header('x-telegram-init-data');
  if (headerVal && headerVal.trim()) {
    return headerVal.trim();
  }

  const authHeader = req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('tma ')) {
    const token = authHeader.slice(4).trim();
    return token || null;
  }

  return null;
}

/**
 * Optional Telegram Mini App authentication middleware.
 * - If Telegram initData header is absent, allows the request to proceed as a Web guest.
 * - If Telegram initData header is present, strictly validates it and rejects tampering with 401.
 */
export function optionalTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const rawInitData = extractInitDataFromRequest(req);
  if (!rawInitData) {
    next();
    return;
  }

  try {
    const verified = verifyTelegramInitData(rawInitData);
    req.telegramData = verified;
    req.telegramUser = verified.user;
    next();
  } catch (err) {
    const status = err instanceof TelegramAuthError ? err.statusCode : 401;
    const message = err instanceof Error ? err.message : 'Invalid Telegram authentication';
    res.status(status).json({ error: message });
  }
}

/**
 * Strict Telegram Mini App authentication middleware for Telegram-only routes.
 */
export function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const rawInitData = extractInitDataFromRequest(req);
  if (!rawInitData) {
    res.status(401).json({ error: 'Telegram Mini App initData is required' });
    return;
  }

  try {
    const verified = verifyTelegramInitData(rawInitData);
    req.telegramData = verified;
    req.telegramUser = verified.user;
    next();
  } catch (err) {
    const status = err instanceof TelegramAuthError ? err.statusCode : 401;
    const message = err instanceof Error ? err.message : 'Invalid Telegram authentication';
    res.status(status).json({ error: message });
  }
}

/**
 * Protects /api/admin/* endpoints via `x-admin-api-key` header (or Bearer token).
 */
export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = env.ADMIN_API_KEY;
  if (!configuredKey) {
    res.status(503).json({ error: 'ADMIN_API_KEY is not configured on the server' });
    return;
  }

  const headerKey = req.header('x-admin-api-key');
  const authHeader = req.header('authorization');
  const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const candidate = (headerKey ?? bearerKey ?? '').trim();

  if (!candidate || !safeTimingCompare(candidate, configuredKey)) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing ADMIN_API_KEY' });
    return;
  }

  next();
}
