import { AssetStatus, OrderStatus, VerificationMode } from '@prisma/client';
import { getTelegramBot } from '../bot/bot.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export interface DailySummaryReport {
  dateKey: string;
  timezone: string;
  totalRevenueMmk: number;
  approvedOrdersCount: number;
  autoVerifiedCount: number;
  autoVerifyRatePct: number;
  pendingOrdersCount: number;
  lowStockProducts: Array<{
    id: string;
    titleEn: string;
    availableCount: number;
  }>;
  telegramSent: boolean;
  telegramStatus: string;
  messagePreview: string;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Returns local date string (YYYY-MM-DD), hour (0-23), minute (0-59), and UTC boundaries
 * for today in `timeZone` (default Asia/Yangon = UTC+06:30).
 */
export function getLocalDayContext(
  now = new Date(),
  timeZone = env.DAILY_SUMMARY_TIMEZONE || 'Asia/Yangon'
): {
  dateKey: string;
  hour: number;
  minute: number;
  dayStartUtc: Date;
  dayEndUtc: Date;
  timezone: string;
} {
  let effectiveTz = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: effectiveTz }).format(now);
  } catch {
    effectiveTz = 'Asia/Yangon';
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const y = getPart('year');
  const m = getPart('month');
  const d = getPart('day');
  const hour = getPart('hour') % 24;
  const minute = getPart('minute');
  const sec = getPart('second');

  const dateKey = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // Calculate exact offset between UTC and target timezone at `now`
  const localAsUtcMs = Date.UTC(y, m - 1, d, hour, minute, sec);
  const offsetMs = localAsUtcMs - now.getTime();
  const dayStartUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    dateKey,
    hour,
    minute,
    dayStartUtc,
    dayEndUtc,
    timezone: effectiveTz,
  };
}

export async function computeAndSendDailySummary(options?: {
  now?: Date;
}): Promise<DailySummaryReport> {
  const ctx = getLocalDayContext(options?.now);

  const [approvedOrdersToday, pendingOrdersCount, activeProducts, stockCounts] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: OrderStatus.APPROVED,
        OR: [
          {
            reviewedAt: {
              gte: ctx.dayStartUtc,
              lt: ctx.dayEndUtc,
            },
          },
          {
            reviewedAt: null,
            createdAt: {
              gte: ctx.dayStartUtc,
              lt: ctx.dayEndUtc,
            },
          },
        ],
      },
      select: {
        id: true,
        totalMmk: true,
        paymentProofs: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { verificationMode: true },
        },
      },
    }),
    prisma.order.count({
      where: {
        status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.PENDING_PAYMENT] },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, titleEn: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.digitalAsset.groupBy({
      by: ['productId'],
      where: { status: AssetStatus.AVAILABLE },
      _count: { _all: true },
    }),
  ]);

  const approvedOrdersCount = approvedOrdersToday.length;
  const totalRevenueMmk = approvedOrdersToday.reduce((sum, o) => sum + o.totalMmk, 0);
  const autoVerifiedCount = approvedOrdersToday.filter(
    (o) => o.paymentProofs[0]?.verificationMode === VerificationMode.AUTO_VERIFIED
  ).length;
  const autoVerifyRatePct =
    approvedOrdersCount > 0 ? Math.round((autoVerifiedCount / approvedOrdersCount) * 100) : 0;

  const stockMap = new Map<string, number>();
  for (const row of stockCounts) {
    stockMap.set(row.productId, row._count._all);
  }

  const lowStockProducts = activeProducts
    .map((p) => ({
      id: p.id,
      titleEn: p.titleEn,
      availableCount: stockMap.get(p.id) ?? 0,
    }))
    .filter((p) => p.availableCount < 5);

  const lowStockTextLines =
    lowStockProducts.length > 0
      ? lowStockProducts.map((p) => `• ${p.titleEn}: ${p.availableCount} left`)
      : ['• All active products are stocked (>= 5 keys)'];

  const plainLines = [
    `MMKeyHub — Daily Sales & Auto-Verify Summary (${ctx.dateKey} · ${ctx.timezone})`,
    `Total Revenue: ${totalRevenueMmk.toLocaleString('en-US')} MMK`,
    `Approved Orders: ${approvedOrdersCount}`,
    `Auto-Verified Rate: ${autoVerifyRatePct}% (${autoVerifiedCount}/${approvedOrdersCount})`,
    `Pending Orders: ${pendingOrdersCount}`,
    `Low-Stock Alerts (<5): ${lowStockProducts.length}`,
    ...lowStockTextLines,
  ];

  const htmlLines = [
    `📊 <b>MMKeyHub — Daily Sales &amp; Auto-Verify Summary</b>`,
    `Date: <code>${escapeHtml(ctx.dateKey)}</code> (${escapeHtml(ctx.timezone)})`,
    ``,
    `💰 Total Revenue: <b>${totalRevenueMmk.toLocaleString('en-US')} MMK</b>`,
    `✅ Approved Orders: <b>${approvedOrdersCount}</b>`,
    `🤖 Auto-Verified Rate: <b>${autoVerifyRatePct}%</b> (${autoVerifiedCount}/${approvedOrdersCount})`,
    `⏳ Pending Orders: <b>${pendingOrdersCount}</b>`,
    ``,
    lowStockProducts.length > 0
      ? `⚠️ <b>Low-Stock Alerts (&lt; 5):</b>\n${lowStockProducts
          .map((p) => `• ${escapeHtml(p.titleEn)}: <b>${p.availableCount}</b> left`)
          .join('\n')}`
      : `🟢 <b>Inventory Health:</b> All active products have 5+ keys available.`,
  ];

  let telegramSent = false;
  let telegramStatus = 'Telegram bot or admin group not configured; computed summary only.';

  const bot = getTelegramBot();
  const adminGroupId = env.adminGroupId;

  if (bot && adminGroupId) {
    try {
      await bot.api.sendMessage(adminGroupId, htmlLines.join('\n'), { parse_mode: 'HTML' });
      telegramSent = true;
      telegramStatus = `Sent daily summary to Telegram Admin Group (${adminGroupId}).`;
    } catch (err) {
      console.warn('[DailySummary] Failed to send daily summary to Telegram Admin Group:', err);
      telegramStatus =
        err instanceof Error ? `Telegram error: ${err.message}` : 'Failed to send to Telegram';
    }
  }

  return {
    dateKey: ctx.dateKey,
    timezone: ctx.timezone,
    totalRevenueMmk,
    approvedOrdersCount,
    autoVerifiedCount,
    autoVerifyRatePct,
    pendingOrdersCount,
    lowStockProducts,
    telegramSent,
    telegramStatus,
    messagePreview: plainLines.join('\n'),
  };
}
