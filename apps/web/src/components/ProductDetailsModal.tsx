'use client';

import { ArrowRight, BookOpenCheck, ShieldCheck, ShoppingCart, X } from 'lucide-react';
import { useEffect } from 'react';
import { computeFlashSalePercent, formatMmk } from '@/lib/api';
import type { ProductItem } from '@/lib/types';
import { buildActivationSteps, detectProductVendor } from '@/lib/vendorUtils';
import { useCart } from '@/providers/CartProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram, useTelegramBackButton } from '@/providers/TelegramProvider';
import { resolveCoverSrc, resolveDefaultProductCover } from './ProductVisual';

interface ProductDetailsModalProps {
  product: ProductItem | null;
  onClose: () => void;
  onProceedToBuy: (product: ProductItem) => void;
}

export function ProductDetailsModal({
  product,
  onClose,
  onProceedToBuy,
}: ProductDetailsModalProps) {
  const { locale, t } = useLocale();
  const { addToCart, setDrawerOpen } = useCart();
  const { hapticImpact, hapticNotification } = useTelegram();

  useTelegramBackButton(Boolean(product), onClose);

  useEffect(() => {
    if (!product) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [product, onClose]);

  if (!product) return null;

  const isMm = locale === 'mm';
  const title = isMm ? product.titleMm : product.titleEn;
  const description = isMm ? product.descriptionMm : product.descriptionEn;
  const duration = isMm ? product.durationLabelMm : product.durationLabelEn;
  const rawInstructions = isMm
    ? product.deliveryInstructionsMm || product.deliveryInstructionsEn
    : product.deliveryInstructionsEn || product.deliveryInstructionsMm;

  const vendor = detectProductVendor(`${product.slug} ${product.titleEn}`, product.deliveryFormat);
  const steps = buildActivationSteps(rawInstructions, product.deliveryFormat, locale);
  const inStock = product.availableStockCount > 0;
  const discountPct = computeFlashSalePercent(product.priceMmk, product.originalPriceMmk);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-details-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className={`font-medium ${vendor.accentTextClass}`}>{vendor.name}</span>
                <span aria-hidden="true">·</span>
                <span>{t.formatLabels[product.deliveryFormat]}</span>
                {duration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{duration}</span>
                  </>
                )}
              </div>
              <h2
                id="product-details-title"
                className={`mt-1.5 text-lg font-semibold text-slate-900 dark:text-slate-50 ${
                  isMm ? 'font-myanmar-safe' : ''
                }`}
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-[#182133] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {(product.imageUrl || resolveDefaultProductCover(`${product.slug} ${product.titleEn}`)) && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08] bg-[#0B0F17]">
                <img
                  src={
                    resolveCoverSrc(
                      product.imageUrl ||
                        resolveDefaultProductCover(`${product.slug} ${product.titleEn}`)
                    ) || ''
                  }
                  alt={title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
              </div>
            )}
            <p
              className={`text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {description}
            </p>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] px-4 py-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isMm ? 'စျေးနှုန်း' : 'Unit Price'}
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono-tabular text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatMmk(product.priceMmk)}
                  </span>
                  {discountPct !== null && product.originalPriceMmk && (
                    <>
                      <span className="font-mono-tabular text-xs text-slate-400 line-through">
                        {formatMmk(product.originalPriceMmk)}
                      </span>
                      <span className="font-mono-tabular text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {discountPct}% {t.flashSaleOff}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isMm ? 'လက်ကျန်အခြေအနေ' : 'Availability'}
                </p>
                <p
                  className={`font-mono-tabular mt-0.5 text-sm font-semibold ${
                    inStock
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {inStock ? `${t.inStock}: ${product.availableStockCount}` : t.outOfStock}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                <span>{t.activationGuideTitle}</span>
              </div>
              <ol className="mt-3 space-y-2.5">
                {steps.map((step, idx) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <span className="font-mono-tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {idx + 1}
                    </span>
                    <span className={isMm ? 'font-myanmar-safe text-[13px]' : 'leading-relaxed'}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                {isMm
                  ? 'AES-256 စနစ်ဖြင့် လုံခြုံစွာသိမ်းဆည်းထားပြီး KPay / WavePay ဖြင့် ဝယ်ယူနိုင်ပါသည်။'
                  : 'AES-256-GCM encrypted vault stock · Verified KPay & WavePay checkout.'}
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Mobile Quick Buy & Add to Cart Action Bar */}
        <div className="sticky bottom-0 border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#121826]/95 px-5 py-3.5 backdrop-blur-md sm:px-6">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!inStock}
              onClick={() => {
                hapticNotification('success');
                addToCart(product, 1);
                onClose();
                setDrawerOpen(true);
              }}
              className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-white/[0.14] bg-slate-100 dark:bg-[#0B0F17] px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-emerald-500/50 disabled:opacity-50 transition-colors cursor-pointer sm:text-sm"
            >
              <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{t.addToCart}</span>
            </button>

            <button
              type="button"
              disabled={!inStock}
              onClick={() => {
                hapticImpact('light');
                onClose();
                onProceedToBuy(product);
              }}
              className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 transition-colors cursor-pointer sm:text-sm"
            >
              <span>{inStock ? `${t.quickBuy} · ${formatMmk(product.priceMmk)}` : t.outOfStock}</span>
              {inStock && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
