import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENCRYPTION_KEY: z.string().optional(),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters').optional(),
  ORDER_TOKEN_SECRET: z.string().default('dev-order-token-secret-change-in-production'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().default('MMKeyHubBot'),
  TELEGRAM_ADMIN_GROUP_ID: z.string().optional(),
  ADMIN_GROUP_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_MINI_APP_URL: z.string().optional(),
  TELEGRAM_INIT_DATA_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  CORS_ORIGIN: z.string().default('http://localhost,http://localhost:3000'),
  UPLOAD_DIR: z.string().default(path.resolve(process.cwd(), 'uploads')),
  MAX_RECEIPT_SIZE_MB: z.coerce.number().positive().default(5),
  APP_URL: z.string().default('http://localhost'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  DAILY_SUMMARY_TIMEZONE: z.string().default('Asia/Yangon'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

const encryptionKey = parsed.data.ENCRYPTION_KEY ?? parsed.data.ENCRYPTION_MASTER_KEY ?? '';
const adminGroupId = (parsed.data.TELEGRAM_ADMIN_GROUP_ID ?? parsed.data.ADMIN_GROUP_ID ?? '').trim();

export const env = {
  ...parsed.data,
  encryptionKey,
  adminGroupId,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  maxReceiptSizeBytes: Math.floor(parsed.data.MAX_RECEIPT_SIZE_MB * 1024 * 1024),
};
