import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ShieldCheck,
  ShoppingCart,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import type { PreviewLocale, PreviewProduct } from '../previewData';
import { buildPreviewActivationSteps, detectPreviewVendor } from '../utils/previewUtils';

interface PreviewDetailsModalProps {
  product: PreviewProduct | null;
  locale: PreviewLocale;
  isTelegramMode?: boolean;
  onHaptic?: (kind: 'light' | 'selection' | 'success' | 'error') => void;
  onClose: () => void;
  onAddToCart?: (product: PreviewProduct) => void;
  onProceedToBuy: (product: PreviewProduct) => void;
}

export function PreviewDetailsModal({
  product,
  locale,
  isTelegramMode = false,
  onHaptic,
  onClose,
  onAddToCart,
  onProceedToBuy,
}: PreviewDetailsModalProps) {
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
  const duration = isMm ? product.durationMm : product.durationEn;
  const instructions = isMm ? product.instructionsMm : product.instructionsEn;

  const vendor = detectPreviewVendor(product.titleEn, product.deliveryFormat);
  const steps = buildPreviewActivationSteps(instructions, locale);
  const inStock = product.availableKeys.length > 0;
  const discountPct =
    product.originalPriceMmk && product.originalPriceMmk > product.priceMmk
      ? Math.round(((product.originalPriceMmk - product.priceMmk) / product.originalPriceMmk) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-[#121826] sm:max-w-lg sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {isTelegramMode && (
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  onHaptic?.('light');
                  onClose();
                }}
                className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isMm ? 'နောက်သို့' : 'Back'}</span>
              </button>
              <span className="font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500">
                Telegram BackButton
              </span>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/[0.08]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className={`font-medium ${vendor.accentTextClass}`}>{vendor.name}</span>
                <span aria-hidden="true">·</span>
                <span>{isMm ? product.categoryNameMm : product.categoryNameEn}</span>
                <span aria-hidden="true">·</span>
                <span>{duration}</span>
              </div>
              <h2
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
              aria-label="Close modal"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#182133] dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {product.imageUrl && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 bg-[#0B0F17] dark:border-white/[0.08]">
                <img
                  src={product.imageUrl}
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

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/[0.08] dark:bg-[#0B0F17]">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isMm ? 'စျေးနှုန်း' : 'Unit Price'}
                </p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono-tabular text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {product.priceMmk.toLocaleString('en-US')} MMK
                  </span>
                  {discountPct !== null && product.originalPriceMmk && (
                    <>
                      <span className="font-mono-tabular text-xs text-slate-400 line-through dark:text-slate-500">
                        {product.originalPriceMmk.toLocaleString('en-US')} MMK
                      </span>
                      <span className="font-mono-tabular text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {discountPct}% {isMm ? 'လျှော့ဈေး' : 'OFF'}
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
                  {inStock
                    ? `${isMm ? 'လက်ကျန်' : 'In Stock'}: ${product.availableKeys.length}`
                    : isMm
                      ? 'ကုန်နေပါသည်'
                      : 'Out of Stock'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-[#0B0F17]">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isMm ? 'အသုံးပြုပုံ အဆင့်ဆင့်' : 'Step-by-Step Activation Guide'}
                </span>
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
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {isMm
                  ? 'AES-256 စနစ်ဖြင့် လုံခြုံစွာသိမ်းဆည်းထားပြီး KPay / WavePay ဖြင့် ဝယ်ယူနိုင်ပါသည်။'
                  : 'AES-256-GCM encrypted vault stock · Verified KPay & WavePay checkout.'}
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Quick Buy + Add to Cart Bar */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-5 py-3.5 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#121826]/95 sm:px-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {onAddToCart && (
              <button
                type="button"
                disabled={!inStock}
                onClick={() => {
                  onHaptic?.('light');
                  onAddToCart(product);
                  onClose();
                }}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300 cursor-pointer"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                <span>{isMm ? 'ခြင်းထဲထည့်မည်' : 'Add to Cart'}</span>
              </button>
            )}
            <button
              type="button"
              disabled={!inStock}
              onClick={() => {
                onHaptic?.('light');
                onClose();
                onProceedToBuy(product);
              }}
              className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 cursor-pointer ${
                !onAddToCart ? 'sm:col-span-2' : ''
              }`}
            >
              <span>
                {inStock
                  ? `${isMm ? 'ချက်ချင်းဝယ်မည်' : 'Quick Buy'} · ${product.priceMmk.toLocaleString('en-US')} MMK`
                  : isMm
                    ? 'ကုန်နေပါသည်'
                    : 'Out of Stock'}
              </span>
              {inStock && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
