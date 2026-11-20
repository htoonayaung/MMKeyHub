'use client';

import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { VpnKeyQrCode, isVpnUriPayload } from '@/components/VpnKeyQrCode';
import { fetchOrderStatus, formatMmk, getSavedTokenForOrder } from '@/lib/api';
import type { OrderStatusResponse } from '@/lib/types';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram } from '@/providers/TelegramProvider';

function OrderStatusContent() {
  const params = useParams<{ orderNumber: string }>();
  const searchParams = useSearchParams();
  const { locale, t } = useLocale();
  const { initDataRaw, isReady: tgReady, hapticNotification } = useTelegram();

  const orderNumber = useMemo(
    () => decodeURIComponent(String(params?.orderNumber ?? '')).trim(),
    [params]
  );

  const queryToken = searchParams.get('token')?.trim() ?? '';

  const [accessToken, setAccessToken] = useState<string>('');
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (queryToken) {
      setAccessToken(queryToken);
      return;
    }
    if (orderNumber) {
      const saved = getSavedTokenForOrder(orderNumber);
      if (saved) setAccessToken(saved);
    }
  }, [queryToken, orderNumber]);

  const loadOrder = useCallback(
    async (isBackgroundPoll = false) => {
      if (!orderNumber) return;
      if (!isBackgroundPoll) setRefreshing(true);

      try {
        const data = await fetchOrderStatus(orderNumber, {
          token: accessToken || null,
          initDataRaw,
        });
        setOrder(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to fetch order status');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderNumber, accessToken, initDataRaw]
  );

  useEffect(() => {
    if (!tgReady) return;
    void loadOrder(false);
  }, [tgReady, loadOrder]);

  const isPending =
    order?.status === 'PENDING_PAYMENT' || order?.status === 'PENDING_APPROVAL';

  // Auto-poll every 2 seconds while pending verification so SMS matches unlock instantaneously
  useEffect(() => {
    if (!isPending) return;
    const timer = window.setInterval(() => {
      void loadOrder(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [isPending, loadOrder]);

  async function handleCopySecret(assetId: string, secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      hapticNotification('success');
      setCopiedId(assetId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTokenInput.trim()) return;
    setAccessToken(manualTokenInput.trim());
  }

  function handleDownloadReceiptTxt() {
    if (!order) return;
    const lines: string[] = [
      '============================================================',
      'MMKEYHUB DIGITAL COMMERCE — ORDER RECEIPT & CREDENTIALS',
      '============================================================',
      `Order Number   : ${order.orderNumber}`,
      `Status         : ${order.status}`,
      `Submitted At   : ${new Date(order.createdAt).toISOString()}`,
      order.reviewedAt ? `Reviewed At    : ${new Date(order.reviewedAt).toISOString()}` : '',
      `Payment Method : ${order.paymentProof?.provider ?? 'N/A'}${order.paymentProof?.transactionLast6 ? ` (Tx #${order.paymentProof.transactionLast6})` : ''}`,
      `Subtotal       : ${formatMmk(order.subtotalMmk)}`,
      order.discountMmk > 0
        ? `Promo Discount : -${formatMmk(order.discountMmk)}${order.promoCode ? ` (${order.promoCode})` : ''}`
        : '',
      `Total Paid     : ${formatMmk(order.totalMmk)}`,
      '------------------------------------------------------------',
    ].filter(Boolean);

    for (const item of order.items) {
      lines.push(`Product        : ${item.titleEn} (${item.titleMm})`);
      lines.push(`Format / Qty   : ${item.deliveryFormat} x ${item.quantity}`);
      if (order.status === 'APPROVED' && item.deliveredSecrets.length > 0) {
        lines.push('Delivered Keys / Credentials:');
        item.deliveredSecrets.forEach((secret, idx) => {
          const region = secret.regionLabel ? ` [${secret.regionLabel}]` : '';
          lines.push(`  #${idx + 1}${region}: ${secret.payload}`);
        });
      }
      if (item.deliveryInstructionsEn) {
        lines.push(`Instructions   : ${item.deliveryInstructionsEn}`);
      }
      lines.push('------------------------------------------------------------');
    }

    lines.push('Keep this file in a safe place. For warranty/support, send /support in our Telegram bot.');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MMKeyHub-Receipt-${order.orderNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    hapticNotification('success');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12 md:pb-12">
      <Link
        href="/"
        className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{t.orderPageBack}</span>
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-5">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t.orderStatusTitle}
            </p>
            <h1 className="font-mono-tabular mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50 sm:text-2xl">
              {orderNumber}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {order && (
              <button
                type="button"
                onClick={handleDownloadReceiptTxt}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.downloadReceiptTxt}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadOrder(false)}
              disabled={refreshing}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-[#182133] px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/25 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{t.refreshNow}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Checking order status...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-600 dark:text-rose-300">
            {error}
          </div>
        ) : order ? (
          <div className="mt-6 space-y-6">
            {/* 24/7 Automated Verification Pipeline */}
            {order.paymentProof && (
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t.verifyPipelineTitle}
                  </span>
                  <span
                    className={`font-mono-tabular text-[11px] font-semibold ${
                      order.paymentProof.verificationMode === 'AUTO_VERIFIED'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : order.paymentProof.verificationMode === 'ADMIN_APPROVED'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-amber-600 dark:text-amber-300'
                    }`}
                  >
                    {order.paymentProof.verificationMode === 'AUTO_VERIFIED'
                      ? '24/7 AUTO-VERIFIED'
                      : order.paymentProof.verificationMode === 'ADMIN_APPROVED'
                        ? 'ADMIN APPROVED'
                        : order.paymentProof.ocrTamperingFlags?.length
                          ? 'MANUAL REVIEW (FLAGGED)'
                          : 'AWAITING BANK SMS'}
                  </span>
                </div>

                {(() => {
                  const hasFlags = Boolean(order.paymentProof?.ocrTamperingFlags?.length);
                  const step1Passed = Boolean(order.paymentProof?.ocrExtractedTxId) && !hasFlags;
                  const step2Done = order.status === 'APPROVED';
                  const step3Done = order.status === 'APPROVED';
                  const scorePct =
                    order.paymentProof?.ocrConfidenceScore != null
                      ? `${Math.round(order.paymentProof.ocrConfidenceScore * 100)}%`
                      : null;

                  return (
                    <div className="space-y-2.5">
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826] p-3 text-xs">
                          <p
                            className={`font-semibold ${
                              step1Passed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : hasFlags
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {step1Passed ? '✓ ' : hasFlags ? '⚠ ' : '• '}
                            {t.verifyStep1Done}
                          </p>
                          <p className="font-mono-tabular mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {order.paymentProof?.ocrExtractedTxId
                              ? `Tx ${order.paymentProof.ocrExtractedTxId}${scorePct ? ` · ${scorePct}` : ''}`
                              : hasFlags
                                ? 'Routed to admin inspection'
                                : 'Receipt scanned'}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826] p-3 text-xs">
                          <p
                            className={`font-semibold ${
                              step2Done
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isPending && !hasFlags
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {step2Done ? '✓ ' : isPending && !hasFlags ? '⏳ ' : '• '}
                            {t.verifyStep2Done}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {order.paymentProof?.verificationMode === 'AUTO_VERIFIED'
                              ? 'Matched incoming KPay/WavePay SMS'
                              : order.paymentProof?.verificationMode === 'ADMIN_APPROVED'
                                ? 'Verified manually by admin'
                                : hasFlags
                                  ? 'Escalated to Admin Group'
                                  : 'Matching incoming SMS (60s window)'}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826] p-3 text-xs">
                          <p
                            className={`font-semibold ${
                              step3Done
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {step3Done ? '✓ ' : '🔒 '}
                            {t.verifyStep3Done}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {step3Done
                              ? 'Unlocked below & sent via DM'
                              : 'Reserved & ready to unlock'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Order Status Banner */}
            {isPending && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t.statusLabels[order.status]}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">
                  {t.pendingNote}
                </p>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-200/80">
                  {t.pollingActive}
                </p>
              </div>
            )}

            {order.status === 'APPROVED' && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {t.statusLabels.APPROVED}
                    {order.paymentProof?.verificationMode === 'AUTO_VERIFIED'
                      ? ' · 24/7 Instant Auto-Verify'
                      : ''}
                  </span>
                </div>
              </div>
            )}

            {(order.status === 'REJECTED' || order.status === 'EXPIRED') && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t.statusLabels[order.status]}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">
                  {order.rejectionReason || t.rejectedFallback}
                </p>
                <Link
                  href="/"
                  className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-rose-500/20 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-200 hover:bg-rose-500/30"
                >
                  {t.placeAnotherOrder}
                </Link>
              </div>
            )}

            {/* Order Summary Metadata */}
            <div className="grid gap-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                <p className="font-mono-tabular mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMmk(order.totalMmk)}
                </p>
                {order.discountMmk > 0 && (
                  <p className="font-mono-tabular text-xs text-emerald-600 dark:text-emerald-400">
                    -{formatMmk(order.discountMmk)}
                    {order.promoCode ? ` (${order.promoCode})` : ''}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Payment Method</p>
                <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  {order.paymentProof?.provider ?? 'N/A'}
                  {order.paymentProof?.transactionLast6
                    ? ` · #${order.paymentProof.transactionLast6}`
                    : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Submitted</p>
                <p className="font-mono-tabular mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Guest Token Prompt if Approved on a New Device */}
            {order.status === 'APPROVED' && order.requiresTokenToViewSecrets && (
              <form
                onSubmit={handleUnlockSubmit}
                className="rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17] p-5 space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{t.tokenRequiredTitle}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.tokenRequiredDesc}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                    placeholder={t.tokenPlaceholder}
                    className="font-mono-tabular min-h-[44px] flex-1 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#121826] px-3 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    {t.unlockButton}
                  </button>
                </div>
              </form>
            )}

            {/* Itemized Summary + Unlocked Credentials */}
            <div className="space-y-4">
              {order.items.map((item) => {
                const title = locale === 'mm' ? item.titleMm : item.titleEn;
                const instructions =
                  locale === 'mm'
                    ? item.deliveryInstructionsMm || item.deliveryInstructionsEn
                    : item.deliveryInstructionsEn || item.deliveryInstructionsMm;

                return (
                  <div
                    key={item.productId}
                    className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                          {title}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {t.formatLabels[item.deliveryFormat]} · Qty {item.quantity}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {formatMmk(item.subtotalMmk)}
                      </span>
                    </div>

                    {order.status === 'APPROVED' && item.deliveredSecrets.length > 0 && (
                      <div className="mt-4 space-y-3 border-t border-slate-200 dark:border-white/[0.08] pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.deliveredKeysTitle}</span>
                          </div>
                          {item.deliveredSecrets.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopySecret(
                                  `all-${item.productId}`,
                                  item.deliveredSecrets.map((s) => s.payload).join('\n')
                                )
                              }
                              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                            >
                              {copiedId === `all-${item.productId}` ? (
                                <>
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t.copied}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>
                                    {t.copyAllKeys} ({item.deliveredSecrets.length})
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {item.deliveredSecrets.map((secret, idx) => {
                          const hasVpnQr = isVpnUriPayload(secret.payload);
                          return (
                            <div
                              key={secret.assetId}
                              className="rounded-xl border border-emerald-500/30 bg-white dark:bg-[#121826] p-3.5"
                            >
                              <div className="flex items-center justify-between gap-2 pb-2">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  #{idx + 1}
                                  {secret.regionLabel ? ` · ${secret.regionLabel}` : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleCopySecret(secret.assetId, secret.payload)}
                                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-[#182133] px-3 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-emerald-500/60 transition-colors cursor-pointer"
                                >
                                  {copiedId === secret.assetId ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        {t.copied}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" aria-hidden="true" />
                                      <span>{t.copyKey}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <div
                                className={
                                  hasVpnQr ? 'flex flex-col gap-3 sm:flex-row sm:items-center' : ''
                                }
                              >
                                <pre className="font-mono-tabular flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 dark:bg-[#0B0F17] p-3 text-sm text-emerald-300 select-all">
                                  {secret.payload}
                                </pre>
                                {hasVpnQr && <VpnKeyQrCode value={secret.payload} size={112} />}
                              </div>
                            </div>
                          );
                        })}

                        {instructions && (
                          <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826] p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              {t.instructionsLabel}
                            </p>
                            <p className="mt-1 whitespace-pre-line">{instructions}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading order status...
        </div>
      }
    >
      <OrderStatusContent />
    </Suspense>
  );
}
