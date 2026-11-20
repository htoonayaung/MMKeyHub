import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../lib/env.js';
import type { ApprovedOrderResult } from './orderFulfillment.js';

let cachedTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

function isValidEmailAddress(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null {
  const host = env.SMTP_HOST?.trim();
  const from = (env.SMTP_FROM || env.SMTP_USER || '').trim();
  if (!host || !from) {
    return null;
  }

  if (!cachedTransporter) {
    const authUser = env.SMTP_USER?.trim();
    const authPass = env.SMTP_PASS?.trim();

    cachedTransporter = nodemailer.createTransport({
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
      ...(authUser && authPass
        ? {
            auth: {
              user: authUser,
              pass: authPass,
            },
          }
        : {}),
    });
  }

  return cachedTransporter;
}

export async function sendOrderApprovedEmail(
  result: ApprovedOrderResult
): Promise<{ sent: boolean; skipped?: boolean; reason?: string }> {
  const recipient = result.customerEmail?.trim();
  if (!isValidEmailAddress(recipient)) {
    return { sent: false, skipped: true, reason: 'No valid guest email provided' };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, skipped: true, reason: 'SMTP_HOST not configured' };
  }

  const fromAddress = (env.SMTP_FROM || env.SMTP_USER || 'no-reply@mmkeyhub.local').trim();
  const appUrl = env.APP_URL.replace(/\/+$/, '');
  const trackerUrl = `${appUrl}/orders/${encodeURIComponent(result.orderNumber)}${
    result.accessToken ? `?token=${encodeURIComponent(result.accessToken)}` : ''
  }`;

  const textLines: string[] = [
    `MMKeyHub — Order Approved (${result.orderNumber})`,
    `Your payment has been verified and your digital credentials are unlocked.`,
    ``,
    ...result.decryptedDeliverables.flatMap((item) => [
      `${item.productTitleEn} (${item.productTitleMm})`,
      ...item.secrets.map(
        (s, idx) =>
          `  #${idx + 1}${s.regionLabel ? ` [${s.regionLabel}]` : ''}: ${s.payload}`
      ),
      item.instructionsEn ? `Instructions: ${item.instructionsEn}` : '',
      ``,
    ]),
    `View Online Tracker: ${trackerUrl}`,
  ].filter(Boolean);

  const htmlSections = result.decryptedDeliverables
    .map((item) => {
      const secretsHtml = item.secrets
        .map(
          (s, idx) =>
            `<div style="margin:8px 0;padding:10px 12px;border-radius:8px;background:#0B0F17;border:1px solid #1E293B;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#34D399;word-break:break-all;">` +
            `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">#${idx + 1}${
              s.regionLabel ? ` · ${escapeHtml(s.regionLabel)}` : ''
            }</div>` +
            `${escapeHtml(s.payload)}</div>`
        )
        .join('');

      const instructionsHtml =
        item.instructionsEn || item.instructionsMm
          ? `<p style="margin:8px 0 0;font-size:12px;color:#94A3B8;line-height:1.5;">` +
            `${escapeHtml(item.instructionsEn ?? '')}` +
            `${item.instructionsMm ? `<br/>${escapeHtml(item.instructionsMm)}` : ''}</p>`
          : '';

      return `<div style="margin-top:16px;padding:14px;border-radius:10px;background:#182133;border:1px solid #263248;">
        <div style="font-size:15px;font-weight:600;color:#F8FAFC;">${escapeHtml(item.productTitleEn)}</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:2px;">${escapeHtml(item.productTitleMm)}</div>
        ${secretsHtml}
        ${instructionsHtml}
      </div>`;
    })
    .join('');

  const html = `
  <div style="background:#0B0F17;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#F8FAFC;">
    <div style="max-width:560px;margin:0 auto;background:#121826;border:1px solid #1E293B;border-radius:14px;padding:24px;">
      <div style="font-size:12px;font-weight:600;color:#34D399;text-transform:uppercase;letter-spacing:0.06em;">MMKeyHub Digital Commerce</div>
      <h1 style="margin:6px 0 0;font-size:20px;color:#F8FAFC;">Order Approved — ${escapeHtml(result.orderNumber)}</h1>
      <p style="margin:8px 0 0;font-size:13px;color:#CBD5E1;line-height:1.5;">
        Your payment has been verified and your encrypted digital credentials are now unlocked.
      </p>
      ${htmlSections}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #1E293B;">
        <a href="${escapeHtml(trackerUrl)}" style="display:inline-block;background:#10B981;color:#020617;font-weight:600;font-size:13px;padding:10px 18px;border-radius:8px;text-decoration:none;">
          Open Order Tracker
        </a>
      </div>
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject: `MMKeyHub: Your Order ${result.orderNumber} is Unlocked`,
      text: textLines.join('\n'),
      html,
    });
    return { sent: true };
  } catch (err) {
    console.warn(`[EmailNotifier] Failed to send email for order ${result.orderNumber}:`, err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : 'SMTP delivery failed',
    };
  }
}
