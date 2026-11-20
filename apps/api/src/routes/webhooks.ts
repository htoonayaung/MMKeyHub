import crypto from 'node:crypto';
import { ActorType, PaymentProvider } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { tryAutoMatchIncomingSms } from '../services/autoVerification.js';
import { parsePaymentSmsText } from '../services/receiptVerifier.js';
import { extractClientIp, recordAuditLog } from '../utils/audit.js';
import { safeTimingCompare } from '../utils/crypto.js';

export const webhooksRouter = Router();

const MAX_REPLAY_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const MAX_FUTURE_SKEW_MS = 60 * 1000; // 1 minute clock skew allowance
const recentHmacSignatures = new Map<string, number>();

function pruneReplayCache(nowMs: number): void {
  if (recentHmacSignatures.size < 500) return;
  for (const [sig, expiresAt] of recentHmacSignatures.entries()) {
    if (expiresAt <= nowMs) {
      recentHmacSignatures.delete(sig);
    }
  }
}

const paymentWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many incoming payment webhook events.' },
});

const incomingSmsPayloadSchema = z.object({
  rawMessage: z.string().trim().max(2000).optional(),
  message: z.string().trim().max(2000).optional(),
  text: z.string().trim().max(2000).optional(),
  body: z.string().trim().max(2000).optional(),
  sender: z.string().trim().max(120).optional(),
  title: z.string().trim().max(160).optional(),
  provider: z.nativeEnum(PaymentProvider).optional(),
  transactionId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,24}$/, 'transactionId must be 6-24 alphanumeric characters')
    .optional(),
  amountMmk: z.coerce.number().int().min(100).max(100_000_000).optional(),
  senderInfo: z.string().trim().max(160).optional(),
});

function extractWebhookSecret(req: Request): string {
  const directHeader =
    req.header('x-webhook-secret') || req.header('x-payment-webhook-secret') || '';
  if (directHeader.trim()) return directHeader.trim();

  const authHeader = req.header('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function parseWebhookTimestampMs(rawTimestamp: string): number | null {
  const trimmed = rawTimestamp.trim();
  if (!trimmed) return null;

  if (/^\d{10}$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  if (/^\d{13}$/.test(trimmed)) {
    return Number(trimmed);
  }
  const parsedDate = Date.parse(trimmed);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

async function logWebhookAttempt(
  req: Request,
  action: 'PAYMENT_WEBHOOK_REJECTED' | 'PAYMENT_WEBHOOK_INGESTED',
  metadata: Record<string, string | number | boolean | null>
): Promise<void> {
  const actorIp = extractClientIp(req);
  try {
    await recordAuditLog(prisma, {
      actorType: ActorType.WEBHOOK,
      actorId: actorIp ?? 'sms-webhook',
      actorIp,
      action,
      entityType: 'IncomingPayment',
      entityId: String(metadata.transactionId ?? 'payment-sms'),
      targetId: 'payment-sms',
      metadata,
    });
  } catch (err) {
    console.warn('[WebhookAudit] Failed to record audit log:', err);
  }
}

/**
 * POST /api/webhooks/payment-sms
 * Layer 2 — Protected endpoint called by Android SMS Forwarder / Notification Listener.
 * Supports:
 * 1) Replay-safe HMAC-SHA256 (`x-webhook-signature` + `x-webhook-timestamp` within 3 minutes)
 * 2) Backward-compatible `x-webhook-secret` header (also enforcing 3-minute freshness if timestamp sent)
 */
webhooksRouter.post(
  '/webhooks/payment-sms',
  paymentWebhookLimiter,
  async (req: Request, res: Response) => {
    const expectedSecret = (env.PAYMENT_WEBHOOK_SECRET || '').trim();
    if (!expectedSecret) {
      res.status(503).json({
        error: 'PAYMENT_WEBHOOK_SECRET is not configured on the server.',
      });
      return;
    }

    const signatureHeader = (req.header('x-webhook-signature') || '').trim();
    const timestampHeader = (req.header('x-webhook-timestamp') || '').trim();
    const nowMs = Date.now();

    if (signatureHeader) {
      if (!timestampHeader) {
        await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
          reason: 'MISSING_WEBHOOK_TIMESTAMP_FOR_HMAC',
          statusCode: 401,
        });
        res.status(401).json({
          error: 'x-webhook-timestamp header is required when using x-webhook-signature.',
        });
        return;
      }

      const timestampMs = parseWebhookTimestampMs(timestampHeader);
      if (
        timestampMs === null ||
        nowMs - timestampMs > MAX_REPLAY_WINDOW_MS ||
        timestampMs - nowMs > MAX_FUTURE_SKEW_MS
      ) {
        await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
          reason: 'WEBHOOK_TIMESTAMP_REPLAY_EXPIRED',
          timestampHeader,
          statusCode: 401,
        });
        res.status(401).json({
          error: 'Webhook timestamp expired or outside the 3-minute replay protection window.',
        });
        return;
      }

      const rawBody =
        typeof (req as Request & { rawBody?: string }).rawBody === 'string'
          ? (req as Request & { rawBody?: string }).rawBody!
          : JSON.stringify(req.body ?? {});

      const normalizedProvidedSig = signatureHeader.replace(/^sha256=/i, '').toLowerCase();
      const expectedDigest = crypto
        .createHmac('sha256', expectedSecret)
        .update(`${timestampHeader}.${rawBody}`, 'utf8')
        .digest('hex');

      if (!/^[0-9a-f]{64}$/.test(normalizedProvidedSig) || !safeTimingCompare(normalizedProvidedSig, expectedDigest)) {
        await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
          reason: 'INVALID_HMAC_SIGNATURE',
          statusCode: 401,
        });
        res.status(401).json({ error: 'Invalid HMAC webhook signature.' });
        return;
      }

      pruneReplayCache(nowMs);
      if (recentHmacSignatures.has(normalizedProvidedSig)) {
        await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
          reason: 'REPLAYED_HMAC_SIGNATURE',
          statusCode: 401,
        });
        res.status(401).json({ error: 'Replay attack detected: webhook signature already used.' });
        return;
      }
      recentHmacSignatures.set(normalizedProvidedSig, nowMs + MAX_REPLAY_WINDOW_MS + 60_000);
    } else {
      const providedSecret = extractWebhookSecret(req);
      if (!providedSecret || !safeTimingCompare(providedSecret, expectedSecret)) {
        await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
          reason: 'INVALID_OR_MISSING_WEBHOOK_SECRET',
          statusCode: 401,
        });
        res.status(401).json({ error: 'Invalid webhook secret.' });
        return;
      }

      if (timestampHeader) {
        const timestampMs = parseWebhookTimestampMs(timestampHeader);
        if (
          timestampMs === null ||
          nowMs - timestampMs > MAX_REPLAY_WINDOW_MS ||
          timestampMs - nowMs > MAX_FUTURE_SKEW_MS
        ) {
          await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
            reason: 'WEBHOOK_TIMESTAMP_REPLAY_EXPIRED',
            timestampHeader,
            statusCode: 401,
          });
          res.status(401).json({
            error: 'Webhook timestamp expired or outside the 3-minute replay protection window.',
          });
          return;
        }
      }
    }

    const parsedBody = incomingSmsPayloadSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
        reason: 'INVALID_PAYLOAD_SCHEMA',
        statusCode: 400,
      });
      res.status(400).json({
        error: 'Invalid payment SMS webhook payload.',
        details: parsedBody.error.flatten().fieldErrors,
      });
      return;
    }

    const data = parsedBody.data;
    const rawText = [data.title, data.rawMessage, data.message, data.text, data.body]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(' ')
      .trim();

    const parsedFromSms = rawText ? parsePaymentSmsText(rawText, data.provider) : null;

    if (rawText && !parsedFromSms && (!data.provider || !data.transactionId || !data.amountMmk)) {
      await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
        reason: 'FAILED_MYANMAR_SMS_REGEX_VALIDATION',
        rawSnippet: rawText.slice(0, 140),
        statusCode: 422,
      });
      res.status(422).json({
        error:
          'SMS text failed strict Myanmar KBZPay/WavePay incoming credit validation (outgoing or unrecognized SMS ignored).',
      });
      return;
    }

    const provider = data.provider ?? parsedFromSms?.provider;
    const transactionId = (data.transactionId ?? parsedFromSms?.transactionId ?? '')
      .replace(/\s+/g, '')
      .toUpperCase();
    const amountMmk = data.amountMmk ?? parsedFromSms?.amountMmk ?? 0;
    const senderInfo = data.senderInfo ?? parsedFromSms?.senderInfo ?? data.sender ?? null;
    const finalRawMessage =
      rawText ||
      `${provider ?? 'PAYMENT'} received ${amountMmk} MMK (Tx: ${transactionId})${senderInfo ? ` from ${senderInfo}` : ''}`;

    if (
      !provider ||
      !transactionId ||
      !/^[A-Z0-9]{6,24}$/.test(transactionId) ||
      /^09\d{7,9}$/.test(transactionId) ||
      amountMmk < 100
    ) {
      await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_REJECTED', {
        reason: 'MISSING_OR_MALFORMED_EXTRACTED_FIELDS',
        rawSnippet: rawText ? rawText.slice(0, 140) : null,
        statusCode: 422,
      });
      res.status(422).json({
        error:
          'Could not extract valid provider, transactionId (non-phone), and positive amountMmk from SMS payload.',
      });
      return;
    }

    const transactionLast6 = transactionId.length >= 4 ? transactionId.slice(-6) : null;

    try {
      const existing = await prisma.incomingPayment.findUnique({
        where: { transactionId },
      });

      if (existing) {
        const retryMatch = existing.isMatched
          ? { matched: true, orderNumber: existing.matchedOrderId ?? undefined }
          : await tryAutoMatchIncomingSms(existing.id);

        res.status(200).json({
          duplicate: true,
          incomingPayment: {
            id: existing.id,
            provider: existing.provider,
            transactionId: existing.transactionId,
            amountMmk: existing.amountMmk,
            isMatched: retryMatch.matched || existing.isMatched,
            receivedAt: existing.receivedAt,
          },
          autoMatched: retryMatch.matched,
          matchedOrderNumber: retryMatch.orderNumber ?? null,
        });
        return;
      }

      const incoming = await prisma.incomingPayment.create({
        data: {
          provider,
          transactionId,
          transactionLast6,
          amountMmk,
          senderInfo,
          rawMessage: finalRawMessage,
        },
      });

      const matchResult = await tryAutoMatchIncomingSms(incoming.id);

      await logWebhookAttempt(req, 'PAYMENT_WEBHOOK_INGESTED', {
        provider,
        transactionId,
        amountMmk,
        autoMatched: matchResult.matched,
        matchedOrderNumber: matchResult.orderNumber ?? null,
        authMode: signatureHeader ? 'HMAC_SHA256' : 'STATIC_SECRET',
      });

      res.status(201).json({
        duplicate: false,
        incomingPayment: {
          id: incoming.id,
          provider: incoming.provider,
          transactionId: incoming.transactionId,
          amountMmk: incoming.amountMmk,
          senderInfo: incoming.senderInfo,
          isMatched: matchResult.matched,
          receivedAt: incoming.receivedAt,
        },
        autoMatched: matchResult.matched,
        matchedOrderNumber: matchResult.orderNumber ?? null,
      });
    } catch (err) {
      console.error('[POST /api/webhooks/payment-sms] Error:', err);
      res.status(500).json({ error: 'Failed to ingest incoming payment SMS.' });
    }
  }
);
