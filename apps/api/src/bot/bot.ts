import crypto from 'node:crypto';
import fs from 'node:fs';
import { AssetStatus, OrderStatus } from '@prisma/client';
import type { Express } from 'express';
import { Bot, GrammyError, InlineKeyboard, InputFile, webhookCallback } from 'grammy';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { resolveReceiptAbsolutePath } from '../middleware/upload.js';
import { sendOrderApprovedEmail } from '../services/emailNotifier.js';
import {
  approveOrderById,
  type ApprovedOrderResult,
  OrderActionError,
  type RejectedOrderResult,
  rejectOrderById,
} from '../services/orderFulfillment.js';
import { decryptSecret } from '../utils/crypto.js';

export interface AdminNotificationResult {
  sent: boolean;
  messageId?: number;
  reason?: string;
}

export interface BroadcastSendResult {
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
}

const REJECT_REASONS: Record<string, { label: string; text: string }> = {
  amount: {
    label: '💰 Wrong Amount',
    text: 'Transfer amount does not match the order total.',
  },
  blurry: {
    label: '🖼️ Blurry / Unclear Slip',
    text: 'Receipt screenshot is blurry or missing transaction details.',
  },
  duplicate: {
    label: '♻️ Duplicate Tx ID',
    text: 'This receipt or transaction ID has already been used.',
  },
  unverified: {
    label: '🚫 Payment Not Received',
    text: 'Payment could not be found in merchant KPay/WavePay history.',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatAdminActor(from?: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): string {
  if (!from) return 'Admin';
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || `ID ${from.id}`;
}

function generateTicketNumber(): string {
  return `SUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function upsertBotSubscriber(
  from?: {
    id: number;
    is_bot?: boolean;
    username?: string;
    first_name?: string;
    last_name?: string;
  },
  source = 'BOT'
): Promise<void> {
  if (!from || from.is_bot) return;
  try {
    const tgId = BigInt(from.id);
    await prisma.botSubscriber.upsert({
      where: { telegramUserId: tgId },
      update: {
        telegramUsername: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        isBlocked: false,
        lastActiveAt: new Date(),
      },
      create: {
        telegramUserId: tgId,
        telegramUsername: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        source,
      },
    });
  } catch (err) {
    console.warn('[TelegramBot] Failed to upsert BotSubscriber:', err);
  }
}

let botInstance: Bot | null = null;
let botStarted = false;

export function getTelegramBot(): Bot | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return null;
  }

  if (botInstance) {
    return botInstance;
  }

  const bot = new Bot(token);

  bot.catch((err) => {
    console.error('[TelegramBot] Unhandled grammY error:', err.error);
  });

  // Track every private-chat user who interacts with the bot for broadcasts
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private' && ctx.from) {
      await upsertBotSubscriber(ctx.from, 'BOT');
    }
    await next();
  });

  async function sendSupportPrompt(replyFn: (text: string) => Promise<unknown>) {
    await replyFn(
      [
        `<b>🛟 Customer Support &amp; Warranty Claim</b>`,
        `<i>အကူအညီတောင်းခံရန်နှင့် Warranty စစ်ဆေးရန်</i>`,
        ``,
        `Send your issue using:`,
        `<code>/support Your issue or order details here</code>`,
        ``,
        `Or simply <b>reply directly</b> to any delivered key / order message from this bot with your issue.`,
        `<i>သို့မဟုတ် Key ပေးပို့ထားသော Message ကို Reply ပြန်၍ အကြောင်းအရာ ရေးပို့နိုင်ပါသည်။</i>`,
      ].join('\n')
    );
  }

  async function createAndForwardSupportTicket(params: {
    telegramUserId: number;
    telegramUsername?: string;
    firstName?: string;
    messageText: string;
    referencedOrderNumber?: string | null;
  }): Promise<{ ticketNumber: string; orderNumber: string | null }> {
    const tgId = BigInt(params.telegramUserId);

    const lastOrder = params.referencedOrderNumber
      ? await prisma.order.findUnique({
          where: { orderNumber: params.referencedOrderNumber },
          include: {
            items: {
              include: {
                product: { select: { titleEn: true } },
              },
            },
          },
        })
      : await prisma.order.findFirst({
          where: {
            OR: [{ telegramChatId: tgId }, { customer: { telegramId: tgId } }],
          },
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                product: { select: { titleEn: true } },
              },
            },
          },
        });

    const ticketNumber = generateTicketNumber();
    const orderNumber = lastOrder?.orderNumber ?? params.referencedOrderNumber ?? null;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        telegramUserId: tgId,
        telegramUsername: params.telegramUsername ?? null,
        orderNumber,
        message: params.messageText.trim(),
        status: 'OPEN',
      },
    });

    const adminGroupId = env.adminGroupId;
    if (adminGroupId) {
      const userLabel = params.telegramUsername
        ? `@${escapeHtml(params.telegramUsername)} (ID <code>${params.telegramUserId}</code>)`
        : `${escapeHtml(params.firstName ?? 'Customer')} (ID <code>${params.telegramUserId}</code>)`;

      const productSummary = lastOrder?.items.length
        ? lastOrder.items.map((i) => `${escapeHtml(i.product.titleEn)} × ${i.quantity}`).join(', ')
        : 'N/A';

      const forwardText = [
        `<b>🛟 New Support / Warranty Ticket</b>`,
        `Ticket: <code>${escapeHtml(ticketNumber)}</code>`,
        `Customer: ${userLabel}`,
        `Last Order: <code>${escapeHtml(orderNumber ?? 'None found')}</code>${lastOrder ? ` (${escapeHtml(lastOrder.status)})` : ''}`,
        lastOrder ? `Product: ${productSummary}` : null,
        ``,
        `<b>Customer Message:</b>`,
        escapeHtml(params.messageText.trim()),
        ``,
        `<i>Quick Reply: Reply directly to this message in this group, or run:</i>`,
        `<code>/reply ${escapeHtml(ticketNumber)} Your reply message</code>`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');

      try {
        const sent = await bot.api.sendMessage(adminGroupId, forwardText, {
          parse_mode: 'HTML',
        });
        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: {
            adminGroupChatId: BigInt(adminGroupId),
            adminGroupMessageId: sent.message_id,
          },
        });
      } catch (err) {
        console.error(`[TelegramBot] Failed to forward support ticket ${ticketNumber}:`, err);
      }
    }

    return { ticketNumber, orderNumber };
  }

  // ---------------------------------------------------------------------------
  // 1. Customer Command: /start
  // ---------------------------------------------------------------------------
  bot.command('start', async (ctx) => {
    const startParam = ctx.match?.trim().toLowerCase();
    if (startParam === 'support') {
      await sendSupportPrompt((text) => ctx.reply(text, { parse_mode: 'HTML' }));
      return;
    }

    const miniAppUrl = (env.TELEGRAM_MINI_APP_URL || env.APP_URL || '').trim();
    const isHttpsMiniApp = miniAppUrl.startsWith('https://');

    const welcomeText = [
      `<b>Welcome to MMKeyHub</b> 🇲🇲`,
      ``,
      `Instant digital delivery for <b>Software License Keys</b>, <b>Premium Accounts</b>, and <b>VPN Configs</b> in MMK via <b>KPay & WavePay</b>.`,
      ``,
      `<i>MMKeyHub မှ ကြိုဆိုပါတယ်။ Software License Key များ၊ Premium Account များနှင့် VPN Config များကို KPay / WavePay ဖြင့် မြန်ဆန်စိတ်ချစွာ ဝယ်ယူနိုင်ပါပြီ။</i>`,
      ``,
      `• /myorders — View purchased keys`,
      `• /support — Contact admin or claim warranty`,
      `• ဝယ်ယူပြီးသား Key များကြည့်ရန် /myorders · အကူအညီတောင်းရန် /support`,
      !isHttpsMiniApp && miniAppUrl ? `\nStorefront URL: ${escapeHtml(miniAppUrl)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const keyboard = new InlineKeyboard();
    if (isHttpsMiniApp) {
      keyboard.webApp('🛍️ Open Storefront / ဆိုင်ဖွင့်ရန်', miniAppUrl).row();
    }
    keyboard
      .text('📦 My Orders / ဝယ်ယူမှုများ', 'customer_myorders')
      .row()
      .text('🛟 Support / Warranty Claim', 'customer_support');

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Customer Command & Button: /myorders
  // ---------------------------------------------------------------------------
  async function sendCustomerOrders(
    telegramUserId: number,
    replyFn: (text: string) => Promise<unknown>
  ) {
    const customer = await prisma.customer.findUnique({
      where: { telegramId: BigInt(telegramUserId) },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            items: {
              include: {
                product: true,
                assets: {
                  where: { status: AssetStatus.SOLD },
                },
              },
            },
          },
        },
      },
    });

    if (!customer || customer.orders.length === 0) {
      await replyFn(
        [
          `You have no orders yet.`,
          `<i>သင့်တွင် ဝယ်ယူထားသော အော်ဒါ မရှိသေးပါ။</i>`,
          ``,
          `Open the storefront via /start to place an order.`,
        ].join('\n')
      );
      return;
    }

    const blocks: string[] = [`<b>Your Recent Orders / သင့်အော်ဒါများ</b>\n`];

    for (const order of customer.orders) {
      const statusBadge =
        order.status === OrderStatus.APPROVED
          ? '✅ APPROVED'
          : order.status === OrderStatus.REJECTED
            ? '❌ REJECTED'
            : order.status === OrderStatus.EXPIRED
              ? '⌛ EXPIRED'
              : '⏳ PENDING APPROVAL';

      const productSummary = order.items
        .map((item) => `${escapeHtml(item.product.titleEn)} × ${item.quantity}`)
        .join(', ');

      const lines = [
        `<b>${escapeHtml(order.orderNumber)}</b> — ${statusBadge}`,
        `Product: ${productSummary}`,
        `Total: <b>${order.totalMmk.toLocaleString('en-US')} MMK</b>`,
      ];

      if (order.status === OrderStatus.APPROVED) {
        for (const item of order.items) {
          for (const asset of item.assets) {
            try {
              const secret = decryptSecret({
                encryptedPayload: asset.encryptedPayload,
                iv: asset.iv,
                authTag: asset.authTag,
              });
              const regionTag = asset.regionLabel ? ` (${escapeHtml(asset.regionLabel)})` : '';
              lines.push(
                `🔑 <b>${escapeHtml(item.product.titleEn)}${regionTag}:</b>\n<code>${escapeHtml(secret)}</code>`
              );
            } catch (err) {
              console.error(`[TelegramBot] Failed to decrypt asset ${asset.id}:`, err);
              lines.push(
                `🔑 <i>Error decrypting asset — please contact support with order ${escapeHtml(order.orderNumber)}.</i>`
              );
            }
          }
        }
      } else if (order.status === OrderStatus.REJECTED && order.rejectionReason) {
        lines.push(`Reason: <i>${escapeHtml(order.rejectionReason)}</i>`);
      }

      blocks.push(lines.join('\n'));
    }

    let buffer = '';
    for (const block of blocks) {
      const candidate = buffer ? `${buffer}\n\n${block}` : block;
      if (candidate.length > 3800) {
        await replyFn(buffer);
        buffer = block;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) {
      await replyFn(buffer);
    }
  }

  bot.command('myorders', async (ctx) => {
    if (!ctx.from) return;
    await sendCustomerOrders(ctx.from.id, (text) =>
      ctx.reply(text, { parse_mode: 'HTML' })
    );
  });

  bot.callbackQuery('customer_myorders', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    await sendCustomerOrders(ctx.from.id, (text) =>
      ctx.reply(text, { parse_mode: 'HTML' })
    );
  });

  bot.callbackQuery('customer_support', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendSupportPrompt((text) => ctx.reply(text, { parse_mode: 'HTML' }));
  });

  bot.callbackQuery(/^promo_info:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const code = ctx.match[1]?.trim().toUpperCase();
    await ctx.answerCallbackQuery({
      text: `Use promo code ${code} at checkout!`,
      show_alert: true,
    });
  });

  // ---------------------------------------------------------------------------
  // 2b. Customer Support & Warranty Claim (/support & reply-to-key handler)
  // ---------------------------------------------------------------------------
  bot.command('support', async (ctx) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    const messageText = ctx.match?.trim() ?? '';
    if (!messageText) {
      await sendSupportPrompt((text) => ctx.reply(text, { parse_mode: 'HTML' }));
      return;
    }

    const repliedText =
      ctx.message?.reply_to_message?.text ?? ctx.message?.reply_to_message?.caption ?? '';
    const orderMatch = repliedText.match(/(?:MMK|KV)-\d{8}-[A-Z0-9]+/);

    const { ticketNumber, orderNumber } = await createAndForwardSupportTicket({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username,
      firstName: ctx.from.first_name,
      messageText,
      referencedOrderNumber: orderMatch?.[0] ?? null,
    });

    await ctx.reply(
      [
        `✅ <b>Support Ticket Created — ${escapeHtml(ticketNumber)}</b>`,
        orderNumber ? `Linked Order: <code>${escapeHtml(orderNumber)}</code>` : null,
        `Our admin team has received your message and will reply directly here shortly.`,
        `<i>သင့်တောင်းဆိုမှုကို Admin အဖွဲ့ထံ ပေးပို့ပြီးပါပြီ။ မကြာမီ ဤနေရာတွင် ပြန်လည်ဖြေကြားပေးပါမည်။</i>`,
      ]
        .filter(Boolean)
        .join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  // Admin Group /reply <ticketNumber> <message> command
  bot.command('reply', async (ctx) => {
    if (!isAuthorizedAdminChat(ctx.chat?.id) || !ctx.from) return;
    const rawArgs = ctx.match?.trim() ?? '';
    const spaceIdx = rawArgs.indexOf(' ');
    if (spaceIdx <= 0) {
      await ctx.reply('Usage: /reply SUP-XXXXXX Your reply message to customer');
      return;
    }

    const ticketNumber = rawArgs.slice(0, spaceIdx).trim().toUpperCase();
    const replyText = rawArgs.slice(spaceIdx + 1).trim();
    if (!replyText) {
      await ctx.reply('Please provide a reply message.');
      return;
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { ticketNumber },
    });
    if (!ticket) {
      await ctx.reply(`Support ticket ${ticketNumber} not found.`);
      return;
    }

    const adminActor = formatAdminActor(ctx.from);
    try {
      await bot.api.sendMessage(
        ticket.telegramUserId.toString(),
        [
          `<b>🛟 Support Reply — ${escapeHtml(ticket.ticketNumber)}</b>`,
          ticket.orderNumber ? `Order: <code>${escapeHtml(ticket.orderNumber)}</code>` : null,
          ``,
          escapeHtml(replyText),
          ``,
          `<i>Reply to this message if you need further assistance.</i>`,
        ]
          .filter(Boolean)
          .join('\n'),
        { parse_mode: 'HTML' }
      );

      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: 'REPLIED',
          adminReply: replyText,
          repliedBy: adminActor,
          repliedAt: new Date(),
        },
      });

      await ctx.reply(`✅ Reply sent to customer DM for ticket ${ticket.ticketNumber}.`, {
        reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
      });
    } catch (err) {
      console.error(`[TelegramBot] Failed to send /reply for ${ticketNumber}:`, err);
      await ctx.reply(`⚠️ Could not DM customer for ${ticketNumber} (bot may be blocked).`);
    }
  });

  // Handle direct replies:
  // - Customer in private chat replying to a delivered key / order message -> open Support Ticket
  // - Admin in ADMIN_GROUP_ID replying to a forwarded Support Ticket -> relay DM to customer
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) return;

    // Case A: Admin replying inside Admin Group to a forwarded support ticket
    if (isAuthorizedAdminChat(ctx.chat?.id) && ctx.from) {
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          adminGroupChatId: BigInt(ctx.chat.id),
          adminGroupMessageId: replyTo.message_id,
        },
      });

      if (!ticket) return;

      const adminActor = formatAdminActor(ctx.from);
      try {
        await bot.api.sendMessage(
          ticket.telegramUserId.toString(),
          [
            `<b>🛟 Support Reply — ${escapeHtml(ticket.ticketNumber)}</b>`,
            ticket.orderNumber ? `Order: <code>${escapeHtml(ticket.orderNumber)}</code>` : null,
            ``,
            escapeHtml(text),
            ``,
            `<i>Reply to this message if you need further assistance.</i>`,
          ]
            .filter(Boolean)
            .join('\n'),
          { parse_mode: 'HTML' }
        );

        await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'REPLIED',
            adminReply: text,
            repliedBy: adminActor,
            repliedAt: new Date(),
          },
        });

        await ctx.reply(`✅ Reply delivered to customer DM (${ticket.ticketNumber}).`, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      } catch (err) {
        console.error(`[TelegramBot] Failed to relay admin reply for ${ticket.ticketNumber}:`, err);
        await ctx.reply(`⚠️ Could not deliver DM to customer (${ticket.ticketNumber}).`, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
      }
      return;
    }

    // Case B: Customer in private chat replying to a bot key/order message
    if (ctx.chat?.type === 'private' && ctx.from && replyTo.from?.is_bot) {
      const repliedContent = replyTo.text ?? replyTo.caption ?? '';
      const orderMatch = repliedContent.match(/(?:MMK|KV)-\d{8}-[A-Z0-9]+/);
      if (!orderMatch && !repliedContent.includes('Support Reply')) {
        return;
      }

      const { ticketNumber, orderNumber } = await createAndForwardSupportTicket({
        telegramUserId: ctx.from.id,
        telegramUsername: ctx.from.username,
        firstName: ctx.from.first_name,
        messageText: text,
        referencedOrderNumber: orderMatch?.[0] ?? null,
      });

      await ctx.reply(
        [
          `✅ <b>Support Ticket Created — ${escapeHtml(ticketNumber)}</b>`,
          orderNumber ? `Linked Order: <code>${escapeHtml(orderNumber)}</code>` : null,
          `Forwarded to our admin team. You will receive a reply directly here.`,
          `<i>Admin အဖွဲ့ထံ ပေးပို့ပြီးပါပြီ။ မကြာမီ ဤနေရာတွင် ပြန်လည်ဖြေကြားပေးပါမည်။</i>`,
        ]
          .filter(Boolean)
          .join('\n'),
        { parse_mode: 'HTML' }
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Admin Group Callback Handlers (Approve, Reject Reason Picker, Back)
  // ---------------------------------------------------------------------------
  function isAuthorizedAdminChat(chatId: number | undefined): string | null {
    const configuredGroupId = env.adminGroupId;
    if (!configuredGroupId) return null;
    if (String(chatId ?? '') !== configuredGroupId) return null;
    return configuredGroupId;
  }

  bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1]?.trim();
    const configuredGroupId = isAuthorizedAdminChat(ctx.chat?.id);
    if (!configuredGroupId) {
      await ctx.answerCallbackQuery({
        text: 'Unauthorized: admin actions are restricted to the configured Admin Group.',
        show_alert: true,
      });
      return;
    }
    if (!orderId || !ctx.from) {
      await ctx.answerCallbackQuery({ text: 'Invalid order action payload.', show_alert: true });
      return;
    }

    const adminDisplay = formatAdminActor(ctx.from);
    const adminTelegramId = BigInt(ctx.from.id);

    try {
      const result = await approveOrderById(orderId, {
        actorType: 'ADMIN',
        actorId: adminTelegramId.toString(),
        actorName: adminDisplay,
        telegramId: adminTelegramId,
      });

      const dmNote = await deliverApprovedOrderToTelegram(result);
      await sendOrderApprovedEmail(result);
      await editAdminContextMessage(
        ctx,
        `✅ <b>Approved</b> by ${escapeHtml(adminDisplay)}${escapeHtml(dmNote)}`
      );
      await sendLowStockAlertsToGroup(result.lowStockAlerts);
      await ctx.answerCallbackQuery({ text: `Order ${result.orderNumber} approved!` });
    } catch (err) {
      if (err instanceof OrderActionError) {
        await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
        return;
      }
      console.error(`[TelegramBot] Error approving order ${orderId}:`, err);
      await ctx.answerCallbackQuery({
        text: 'Failed to approve order. Check server logs.',
        show_alert: true,
      });
    }
  });

  // Clicking "❌ Reject" opens inline rejection reason buttons
  bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1]?.trim();
    const configuredGroupId = isAuthorizedAdminChat(ctx.chat?.id);
    if (!configuredGroupId) {
      await ctx.answerCallbackQuery({
        text: 'Unauthorized: admin actions are restricted to the configured Admin Group.',
        show_alert: true,
      });
      return;
    }
    if (!orderId) return;

    const reasonKeyboard = new InlineKeyboard()
      .text(REJECT_REASONS.amount.label, `reject_confirm:${orderId}:amount`)
      .text(REJECT_REASONS.blurry.label, `reject_confirm:${orderId}:blurry`)
      .row()
      .text(REJECT_REASONS.duplicate.label, `reject_confirm:${orderId}:duplicate`)
      .text(REJECT_REASONS.unverified.label, `reject_confirm:${orderId}:unverified`)
      .row()
      .text('⬅️ Back', `reject_cancel:${orderId}`);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: reasonKeyboard });
      await ctx.answerCallbackQuery({ text: 'Select a rejection reason' });
    } catch (err) {
      console.warn('[TelegramBot] Failed to display reject reason keyboard:', err);
      await ctx.answerCallbackQuery({ text: 'Could not open reason options.' });
    }
  });

  // Back button restores original Approve / Reject buttons
  bot.callbackQuery(/^reject_cancel:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1]?.trim();
    if (!isAuthorizedAdminChat(ctx.chat?.id) || !orderId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const originalKeyboard = new InlineKeyboard()
      .text('✅ Approve & Send Key', `approve:${orderId}`)
      .text('❌ Reject', `reject:${orderId}`);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: originalKeyboard });
    } catch {
      // ignore
    }
    await ctx.answerCallbackQuery();
  });

  // Confirm rejection with selected reason
  bot.callbackQuery(/^reject_confirm:([^:]+):([a-z]+)$/, async (ctx) => {
    const orderId = ctx.match[1]?.trim();
    const reasonCode = ctx.match[2]?.trim();
    const configuredGroupId = isAuthorizedAdminChat(ctx.chat?.id);

    if (!configuredGroupId) {
      await ctx.answerCallbackQuery({
        text: 'Unauthorized: admin actions are restricted to the configured Admin Group.',
        show_alert: true,
      });
      return;
    }
    if (!orderId || !ctx.from) return;

    const reasonText =
      REJECT_REASONS[reasonCode]?.text ?? 'Payment could not be verified by administrator.';
    const adminDisplay = formatAdminActor(ctx.from);
    const adminTelegramId = BigInt(ctx.from.id);

    try {
      const result = await rejectOrderById(orderId, reasonText, {
        actorType: 'ADMIN',
        actorId: adminTelegramId.toString(),
        actorName: adminDisplay,
        telegramId: adminTelegramId,
      });

      await notifyRejectedOrderToTelegram(result);
      await editAdminContextMessage(
        ctx,
        `❌ <b>Rejected</b> by ${escapeHtml(adminDisplay)} · Reason: <i>${escapeHtml(result.rejectionReason)}</i> · Released ${result.releasedCount} item(s)`
      );
      await ctx.answerCallbackQuery({
        text: `Order ${result.orderNumber} rejected (${result.releasedCount} item(s) released).`,
      });
    } catch (err) {
      if (err instanceof OrderActionError) {
        await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
        return;
      }
      console.error(`[TelegramBot] Error rejecting order ${orderId}:`, err);
      await ctx.answerCallbackQuery({
        text: 'Failed to reject order. Check server logs.',
        show_alert: true,
      });
    }
  });

  botInstance = bot;
  return botInstance;
}

async function editAdminContextMessage(
  ctx: {
    callbackQuery?: { message?: { caption?: string; text?: string } };
    editMessageCaption: (other?: Record<string, unknown>) => Promise<unknown>;
    editMessageText: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
  },
  statusFooterHtml: string
): Promise<void> {
  const msg = ctx.callbackQuery?.message;
  try {
    if (msg && typeof msg.caption === 'string') {
      const updatedCaption = `${msg.caption}\n\n${statusFooterHtml}`;
      await ctx.editMessageCaption({
        caption: updatedCaption.slice(0, 1024),
        parse_mode: 'HTML',
        reply_markup: undefined,
      });
    } else if (msg && typeof msg.text === 'string') {
      const updatedText = `${msg.text}\n\n${statusFooterHtml}`;
      await ctx.editMessageText(updatedText.slice(0, 4096), {
        parse_mode: 'HTML',
        reply_markup: undefined,
      });
    }
  } catch (err) {
    console.warn('[TelegramBot] Could not edit admin group message:', err);
  }
}

export async function deliverApprovedOrderToTelegram(
  result: ApprovedOrderResult
): Promise<string> {
  const bot = getTelegramBot();
  if (!bot) return ' · Telegram bot offline';
  if (!result.customerTelegramId) return ' · Web guest order (key unlocked on status page)';

  try {
    const dmLines: string[] = [
      `<b>✅ Order Approved — ${escapeHtml(result.orderNumber)}</b>`,
      `<i>သင့်အော်ဒါကို အတည်ပြုပြီး Key များ ပေးပို့လိုက်ပါပြီ။</i>`,
      ``,
    ];

    for (const item of result.decryptedDeliverables) {
      dmLines.push(
        `<b>${escapeHtml(item.productTitleEn)}</b> (${escapeHtml(item.productTitleMm)})`
      );
      item.secrets.forEach((secret, idx) => {
        const label = item.secrets.length > 1 ? `#${idx + 1}` : '';
        const region = secret.regionLabel ? ` [${escapeHtml(secret.regionLabel)}]` : '';
        dmLines.push(`${label}${region}\n<code>${escapeHtml(secret.payload)}</code>`);
      });
      if (item.instructionsEn || item.instructionsMm) {
        dmLines.push(
          `<i>${escapeHtml(item.instructionsEn ?? '')}${item.instructionsMm ? `\n${escapeHtml(item.instructionsMm)}` : ''}</i>`
        );
      }
      dmLines.push('');
    }

    await bot.api.sendMessage(result.customerTelegramId.toString(), dmLines.join('\n'), {
      parse_mode: 'HTML',
    });
    return ' · Customer DM sent';
  } catch (dmErr) {
    console.error(`[TelegramBot] Failed to DM customer for order ${result.orderNumber}:`, dmErr);
    return ' · ⚠️ Customer DM failed (key available in /myorders & web)';
  }
}

export async function notifyRejectedOrderToTelegram(result: RejectedOrderResult): Promise<void> {
  const bot = getTelegramBot();
  if (!bot || !result.customerTelegramId) return;

  const rejectNotice = [
    `<b>❌ Order Rejected — ${escapeHtml(result.orderNumber)}</b>`,
    `Reason: <i>${escapeHtml(result.rejectionReason)}</i>`,
    ``,
    `Please verify your KPay / WavePay transfer details and submit a new order, or contact support.`,
    `<i>သင်တင်ပြထားသော ငွေလွှဲပြေစာကို အတည်မပြုနိုင်ပါ (${escapeHtml(result.rejectionReason)})။ အချက်အလက်ကို ပြန်လည်စစ်ဆေးပြီး ထပ်မံဝယ်ယူပေးပါ။</i>`,
  ].join('\n');

  await bot.api
    .sendMessage(result.customerTelegramId.toString(), rejectNotice, { parse_mode: 'HTML' })
    .catch((err) =>
      console.warn(`[TelegramBot] Failed to send rejection DM for ${result.orderNumber}:`, err)
    );
}

export async function sendLowStockAlertsToGroup(
  alerts: ApprovedOrderResult['lowStockAlerts']
): Promise<void> {
  const bot = getTelegramBot();
  const adminGroupId = env.adminGroupId;
  if (!bot || !adminGroupId || alerts.length === 0) return;

  const alertLines = alerts.map(
    (alert) =>
      `⚠️ <b>Low Stock Alert:</b> ${escapeHtml(alert.titleEn)} has only <b>${alert.remaining}</b> item(s) left!`
  );

  await bot.api
    .sendMessage(adminGroupId, alertLines.join('\n'), { parse_mode: 'HTML' })
    .catch((err) => console.warn('[TelegramBot] Failed to send low-stock alert:', err));
}

export async function sendAdminAutoVerifiedLog(
  result: ApprovedOrderResult,
  details: {
    provider: string;
    amountMmk: number;
    transactionId: string;
    confidenceScore: number | null;
    dmStatusNote: string;
  }
): Promise<void> {
  const bot = getTelegramBot();
  const adminGroupId = env.adminGroupId;
  if (!bot || !adminGroupId) return;

  const productSummary = result.decryptedDeliverables
    .map((d) => `• ${escapeHtml(d.productTitleEn)} × ${d.secrets.length}`)
    .join('\n');

  const confidencePct =
    details.confidenceScore !== null ? `${Math.round(details.confidenceScore * 100)}%` : 'N/A';

  const messageHtml = [
    `✅ <b>Auto-Verified &amp; Delivered (24/7 Ledger)</b>`,
    `Order: <code>${escapeHtml(result.orderNumber)}</code>`,
    `Amount: <b>${details.amountMmk.toLocaleString('en-US')} MMK</b>`,
    `Payment: <b>${escapeHtml(details.provider)}</b> · Tx <code>${escapeHtml(details.transactionId)}</code>`,
    `AI Vision Confidence: <code>${confidencePct}</code> · SMS Match: <b>Confirmed</b>`,
    `Status: <i>Key unlocked${escapeHtml(details.dmStatusNote)}</i>`,
    ``,
    `<b>Delivered Items:</b>`,
    productSummary,
  ].join('\n');

  await bot.api
    .sendMessage(adminGroupId, messageHtml, { parse_mode: 'HTML' })
    .catch((err) =>
      console.warn(
        `[TelegramBot] Failed to send auto-verified passive log for ${result.orderNumber}:`,
        err
      )
    );
}

export async function clearAdminGroupButtonsAfterWebAction(
  adminGroupChatId: bigint | null,
  adminMessageId: number | null,
  statusLine: string
): Promise<void> {
  const bot = getTelegramBot();
  if (!bot || !adminGroupChatId || !adminMessageId) return;

  try {
    await bot.api.editMessageReplyMarkup(adminGroupChatId.toString(), adminMessageId, {
      reply_markup: undefined,
    });
    await bot.api.sendMessage(adminGroupChatId.toString(), statusLine, {
      reply_parameters: { message_id: adminMessageId },
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.warn('[TelegramBot] Could not sync Admin Group message after web action:', err);
  }
}

export async function notifyAdminNewOrder(orderId: string): Promise<AdminNotificationResult> {
  const bot = getTelegramBot();
  const adminGroupId = env.adminGroupId;

  if (!bot || !adminGroupId) {
    console.warn(
      `[TelegramBot] Skipping Admin Group alert for order ${orderId}: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_GROUP_ID missing.`
    );
    return { sent: false, reason: 'Telegram bot or admin group not configured' };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
      paymentProofs: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!order) {
    return { sent: false, reason: 'Order not found' };
  }

  const latestProof = order.paymentProofs[0];
  const productSummary = order.items
    .map((item) => `• ${escapeHtml(item.product.titleEn)} × ${item.quantity}`)
    .join('\n');

  const customerLabel = order.customer.telegramId
    ? `Telegram: ${
        order.customer.telegramUsername
          ? `@${escapeHtml(order.customer.telegramUsername)}`
          : `ID ${order.customer.telegramId.toString()}`
      }`
    : `Guest: ${escapeHtml(order.contactPhone ?? order.contactEmail ?? 'N/A')}`;

  const duplicateWarningLines = latestProof?.isDuplicateTxWarning
    ? [
        `⚠️ <b>DUPLICATE TX ID WARNING</b>`,
        `Tx ID <code>${escapeHtml(latestProof.transactionLast6 ?? '')}</code> matches approved order <code>${escapeHtml(latestProof.duplicateTxOrderNumber ?? 'Unknown')}</code>. Verify carefully!`,
        '',
      ]
    : [];

  const similarSlipWarningLines = latestProof?.isSimilarSlipWarning
    ? [
        `⚠️ <b>SIMILAR SLIP DETECTED</b>`,
        `Perceptual similarity &ge;92% with approved order <code>${escapeHtml(latestProof.similarSlipOrderNumber ?? 'Unknown')}</code>${latestProof.similarSlipDistance !== null && latestProof.similarSlipDistance !== undefined ? ` (Hamming dist ${latestProof.similarSlipDistance}/64)` : ''}. Inspect carefully!`,
        '',
      ]
    : [];

  const hasTamperingFlags = Boolean(latestProof?.ocrTamperingFlags?.length);
  const ocrDiagnosticLines: string[] = [];
  if (latestProof) {
    const scorePct =
      latestProof.ocrConfidenceScore !== null
        ? `${Math.round(latestProof.ocrConfidenceScore * 100)}%`
        : 'N/A';
    if (hasTamperingFlags) {
      ocrDiagnosticLines.push(
        `🛡️ <b>AI Vision Flagged Manual Review</b> (Conf: ${scorePct})`,
        `Flags: <code>${escapeHtml(latestProof.ocrTamperingFlags.join(', '))}</code>`
      );
    } else if (latestProof.ocrExtractedTxId) {
      ocrDiagnosticLines.push(
        `🤖 <b>AI Vision Clean (${scorePct})</b> · <i>60s SMS Timeout Fallback</i>`,
        `OCR Tx: <code>${escapeHtml(latestProof.ocrExtractedTxId)}</code> · OCR Amt: <b>${(latestProof.ocrExtractedAmount ?? 0).toLocaleString('en-US')} MMK</b>`
      );
    }
  }

  const captionLines = [
    ...duplicateWarningLines,
    ...similarSlipWarningLines,
    ...ocrDiagnosticLines,
    ocrDiagnosticLines.length > 0 ? '' : null,
    `<b>New Order Pending Approval</b>`,
    `Order: <code>${escapeHtml(order.orderNumber)}</code>`,
    order.promoCodeText && order.discountMmk > 0
      ? `Amount: <b>${order.totalMmk.toLocaleString('en-US')} MMK</b> (<s>${(order.subtotalMmk ?? order.totalMmk + order.discountMmk).toLocaleString('en-US')}</s> · Promo <code>${escapeHtml(order.promoCodeText)}</code> -${order.discountMmk.toLocaleString('en-US')} MMK)`
      : `Amount: <b>${order.totalMmk.toLocaleString('en-US')} MMK</b>`,
    `Payment: <b>${latestProof ? escapeHtml(latestProof.provider) : 'N/A'}</b>`,
    latestProof?.transactionLast6 ? `Tx Last 6: <code>${escapeHtml(latestProof.transactionLast6)}</code>` : null,
    latestProof?.senderPhone ? `Sender Phone: <code>${escapeHtml(latestProof.senderPhone)}</code>` : null,
    customerLabel,
    '',
    `<b>Product:</b>`,
    productSummary,
  ].filter((line): line is string => line !== null);

  const caption = captionLines.join('\n').slice(0, 1024);

  const keyboard = new InlineKeyboard()
    .text('✅ Approve & Send Key', `approve:${order.id}`)
    .text('❌ Reject', `reject:${order.id}`);

  try {
    const receiptAbsPath = latestProof ? resolveReceiptAbsolutePath(latestProof.receiptPath) : '';
    const sentMessage =
      receiptAbsPath && fs.existsSync(receiptAbsPath)
        ? await bot.api.sendPhoto(adminGroupId, new InputFile(receiptAbsPath), {
            caption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          })
        : await bot.api.sendMessage(adminGroupId, caption, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        adminGroupChatId: BigInt(adminGroupId),
        adminMessageId: sentMessage.message_id,
      },
    });

    return { sent: true, messageId: sentMessage.message_id };
  } catch (err) {
    console.error(`[TelegramBot] Failed to notify Admin Group for order ${order.orderNumber}:`, err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : 'Telegram API error',
    };
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramBroadcast(params: {
  message: string;
  photoUrl?: string | null;
  promoCode?: string | null;
}): Promise<BroadcastSendResult> {
  const bot = getTelegramBot();
  if (!bot) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const subscribers = await prisma.botSubscriber.findMany({
    where: { isBlocked: false },
    select: { id: true, telegramUserId: true },
    orderBy: { lastActiveAt: 'desc' },
  });

  if (subscribers.length === 0) {
    return { totalTargets: 0, sentCount: 0, failedCount: 0, blockedCount: 0 };
  }

  const cleanPhoto = params.photoUrl?.trim() || null;
  const cleanPromo = params.promoCode?.trim().toUpperCase() || null;
  const miniAppUrl = (env.TELEGRAM_MINI_APP_URL || env.APP_URL || '').trim();
  const isHttpsMiniApp = miniAppUrl.startsWith('https://');

  let replyMarkup: InlineKeyboard | undefined;
  if (cleanPromo) {
    const kb = new InlineKeyboard();
    if (isHttpsMiniApp) {
      const targetUrl = `${miniAppUrl.replace(/\/+$/, '')}/?promo=${encodeURIComponent(cleanPromo)}`;
      kb.webApp(`🎁 Claim Promo: ${cleanPromo}`, targetUrl);
    } else {
      kb.text(`🎁 Use Promo: ${cleanPromo}`, `promo_info:${cleanPromo}`);
    }
    replyMarkup = kb;
  } else if (isHttpsMiniApp) {
    replyMarkup = new InlineKeyboard().webApp('🛍️ Open Storefront', miniAppUrl);
  }

  const messageHtml = escapeHtml(params.message.trim());
  const captionHtml = messageHtml.slice(0, 1024);

  let sentCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  const blockedSubscriberIds: string[] = [];

  // Rate-limited batching: 25 messages per batch with 1100ms pause (safely < 30 msg/sec)
  const BATCH_SIZE = 25;
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (sub) => {
        const chatId = sub.telegramUserId.toString();
        try {
          if (cleanPhoto) {
            await bot.api.sendPhoto(chatId, cleanPhoto, {
              caption: captionHtml,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
          } else {
            await bot.api.sendMessage(chatId, messageHtml.slice(0, 4096), {
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
          }
          sentCount += 1;
        } catch (err) {
          failedCount += 1;
          if (err instanceof GrammyError && (err.error_code === 403 || err.error_code === 400)) {
            const desc = err.description.toLowerCase();
            if (
              desc.includes('blocked') ||
              desc.includes('deactivated') ||
              desc.includes('chat not found')
            ) {
              blockedCount += 1;
              blockedSubscriberIds.push(sub.id);
            }
          }
        }
      })
    );

    if (i + BATCH_SIZE < subscribers.length) {
      await sleepMs(1100);
    }
  }

  if (blockedSubscriberIds.length > 0) {
    await prisma.botSubscriber.updateMany({
      where: { id: { in: blockedSubscriberIds } },
      data: { isBlocked: true },
    });
  }

  return {
    totalTargets: subscribers.length,
    sentCount,
    failedCount,
    blockedCount,
  };
}

export async function sendWarrantyExpiryReminder(params: {
  telegramUserId: bigint;
  orderNumber: string;
  productTitleEn: string;
  productTitleMm: string;
  expiresAt: Date;
}): Promise<boolean> {
  const bot = getTelegramBot();
  if (!bot) return false;

  const miniAppUrl = (env.TELEGRAM_MINI_APP_URL || env.APP_URL || '').trim();
  const isHttpsMiniApp = miniAppUrl.startsWith('https://');
  const keyboard = isHttpsMiniApp
    ? new InlineKeyboard().webApp('🔄 Renew Now / သက်တမ်းတိုးရန်', miniAppUrl)
    : undefined;

  const expiryStr = params.expiresAt.toISOString().slice(0, 10);
  const text = [
    `<b>⏰ Subscription / Warranty Expiry Reminder</b>`,
    ``,
    `Your order <code>${escapeHtml(params.orderNumber)}</code> (<b>${escapeHtml(params.productTitleEn)}</b>) is scheduled to expire on <b>${expiryStr}</b>.`,
    ``,
    `<i>သင်ဝယ်ယူထားသော ${escapeHtml(params.productTitleMm)} (${escapeHtml(params.orderNumber)}) သည် ${expiryStr} တွင် သက်တမ်းကုန်ဆုံးပါမည်။ ဆက်လက်အသုံးပြုလိုပါက Storefront တွင် အလွယ်တကူ ပြန်လည်ဝယ်ယူနိုင်ပါသည်။</i>`,
  ].join('\n');

  try {
    await bot.api.sendMessage(params.telegramUserId.toString(), text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return true;
  } catch (err) {
    console.warn(`[TelegramBot] Failed to send expiry reminder for ${params.orderNumber}:`, err);
    return false;
  }
}

export async function sendCriticalSecurityAlertToGroup(params: {
  title: string;
  details: string[];
  actorIp?: string | null;
}): Promise<boolean> {
  const bot = getTelegramBot();
  const adminGroupId = env.adminGroupId;
  if (!bot || !adminGroupId) return false;

  const lines = [
    `🚨 <b>CRITICAL SECURITY ALERT</b>`,
    `<b>${escapeHtml(params.title)}</b>`,
    '',
    ...params.details.map((line) => escapeHtml(line)),
    '',
    params.actorIp ? `Actor IP: <code>${escapeHtml(params.actorIp)}</code>` : null,
    `Time (UTC): <code>${new Date().toISOString()}</code>`,
    `<i>If you did not authorize this change, rotate ADMIN_API_KEY and revert receiving details immediately.</i>`,
  ].filter((l): l is string => l !== null);

  try {
    await bot.api.sendMessage(adminGroupId, lines.join('\n'), { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    console.error('[TelegramBot] Failed to send CRITICAL SECURITY ALERT:', err);
    return false;
  }
}

export async function startTelegramBot(app: Express): Promise<void> {
  const bot = getTelegramBot();
  if (!bot) {
    console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN not set; bot listener disabled.');
    return;
  }

  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim();

  if (webhookUrl) {
    const secretToken = env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
    app.post('/api/telegram/webhook', webhookCallback(bot, 'express', { secretToken }));

    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query'],
      });
      botStarted = true;
      console.log(`[TelegramBot] Webhook registered at ${webhookUrl}`);
    } catch (err) {
      console.error('[TelegramBot] Failed to set webhook:', err);
    }
    return;
  }

  if (botStarted) return;
  botStarted = true;

  void bot
    .start({
      allowed_updates: ['message', 'callback_query'],
      onStart: (botInfo) => {
        console.log(`[TelegramBot] Long polling active as @${botInfo.username}`);
      },
    })
    .catch((err) => {
      botStarted = false;
      console.error('[TelegramBot] Polling stopped with error:', err);
    });
}

export async function stopTelegramBot(): Promise<void> {
  if (botInstance && botStarted && !env.TELEGRAM_WEBHOOK_URL?.trim()) {
    await botInstance.stop();
    botStarted = false;
  }
}
