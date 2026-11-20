'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  Lock,
  Minus,
  Moon,
  Plus,
  ShieldCheck,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { PaymentQrDisplay } from '@/components/PaymentQrDisplay';
import {
  fetchPaymentMethods,
  fetchShopStatus,
  formatMmk,
  saveLocalOrder,
  submitOrder,
  validatePromoCode,
} from '@/lib/api';
import { compressReceiptImage } from '@/lib/imageCompression';
import type {
  CartItem,
  PaymentMethodInfo,
  PaymentProvider,
  ProductItem,
  PromoValidationResponse,
  ShopStatusInfo,
} from '@/lib/types';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram, useTelegramBackButton } from '@/providers/TelegramProvider';

interface CheckoutModalProps {
  product?: ProductItem | null;
  cartItems?: CartItem[] | null;
  onClose: () => void;
  onCartSuccess?: () => void;
}

const FALLBACK_PAYMENT_METHODS: Record<PaymentProvider, PaymentMethodInfo> = {
  KPAY: {
    id: 'fallback-kpay',
    provider: 'KPAY',
    accountName: 'MMKeyHub Merchant (KBZPay)',
    accountPhone: '09777000111',
    qrImageUrl: '',
    instructionsEn: 'Transfer exact MMK total and upload the KPay slip screenshot.',
    instructionsMm: 'ကျသင့်ငွေအတိအကျ လွှဲပြီး KPay ပြေစာပုံကို တင်ပေးပါ။',
  },
  WAVEPAY: {
    id: 'fallback-wavepay',
    provider: 'WAVEPAY',
    accountName: 'MMKeyHub Merchant (WavePay)',
    accountPhone: '09777000222',
    qrImageUrl: '',
    instructionsEn: 'Transfer exact MMK total and upload the WavePay receipt screenshot.',
    instructionsMm: 'ကျသင့်ငွေအတိအကျ လွှဲပြီး WavePay ပြေစာပုံကို တင်ပေးပါ။',
  },
};

function formatKb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CheckoutModal({ product, cartItems, onClose, onCartSuccess }: CheckoutModalProps) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { isTelegram, user, initDataRaw, hapticImpact, hapticNotification, hapticSelection } =
    useTelegram();
  const isMm = locale === 'mm';

  const isCartMode = Boolean(cartItems && cartItems.length > 0);
  const isOpen = Boolean(product || isCartMode);

  const [step, setStep] = useState<1 | 2>(1);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[]>([]);
  const [shopStatus, setShopStatus] = useState<ShopStatusInfo | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('KPAY');
  const [quantity, setQuantity] = useState(1);
  const [customerContact, setCustomerContact] = useState('');
  const [transactionLast6, setTransactionLast6] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [compressionSummary, setCompressionSummary] = useState<string | null>(null);
  const [compressingImage, setCompressingImage] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyStage, setVerifyStage] = useState<0 | 1 | 2 | 3>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoValidationResponse | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  useTelegramBackButton(isOpen && !submitting, () => {
    if (step === 2) {
      setStep(1);
      setErrorMsg(null);
      return;
    }
    onClose();
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setQuantity(1);
    setErrorMsg(null);
    setTransactionLast6('');
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setCompressionSummary(null);
    setCopiedPhone(false);
    setToastMsg(null);
    setPromoInput('');
    setAppliedPromo(null);
    setPromoError(null);
    setVerifyStage(0);

    const controller = new AbortController();
    fetchPaymentMethods(controller.signal)
      .then((methods) => {
        if (methods.length > 0) {
          setPaymentMethods(methods);
          setSelectedProvider(methods[0].provider);
        }
      })
      .catch(() => {
        // Fallback placeholders remain active
      });

    fetchShopStatus(controller.signal)
      .then((status) => setShopStatus(status))
      .catch(() => {
        // Keep default open state
      });

    return () => controller.abort();
  }, [isOpen, product?.id, isCartMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  const activeMethod = useMemo(() => {
    return (
      paymentMethods.find((m) => m.provider === selectedProvider) ??
      FALLBACK_PAYMENT_METHODS[selectedProvider]
    );
  }, [paymentMethods, selectedProvider]);

  const lineItems = useMemo(() => {
    if (isCartMode && cartItems) return cartItems;
    if (product) return [{ product, quantity }];
    return [];
  }, [isCartMode, cartItems, product, quantity]);

  const subtotalMmk = useMemo(
    () => lineItems.reduce((sum, entry) => sum + entry.product.priceMmk * entry.quantity, 0),
    [lineItems]
  );

  const totalUnits = useMemo(
    () => lineItems.reduce((sum, entry) => sum + entry.quantity, 0),
    [lineItems]
  );

  const discountMmk = useMemo(() => {
    if (!appliedPromo) return 0;
    const raw =
      appliedPromo.discountType === 'PERCENTAGE'
        ? Math.floor((subtotalMmk * appliedPromo.discountValue) / 100)
        : appliedPromo.discountValue;
    return Math.min(subtotalMmk, Math.max(0, raw));
  }, [appliedPromo, subtotalMmk]);

  if (!isOpen) return null;

  const maxQuantity = product ? Math.max(1, Math.min(10, product.availableStockCount)) : 10;
  const totalMmk = Math.max(0, subtotalMmk - discountMmk);
  const checkoutTitleText = isCartMode
    ? `${t.cartTitle} (${totalUnits} ${t.cartItemsLabel})`
    : product
      ? isMm
        ? product.titleMm
        : product.titleEn
      : '';
  const telegramLocked = Boolean(isTelegram && user && initDataRaw);

  function showTransientToast(message: string) {
    setToastMsg(message);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === message ? null : prev));
    }, 2300);
  }

  async function handleApplyPromo() {
    if (lineItems.length === 0) return;
    const trimmed = promoInput.trim().toUpperCase();
    if (!trimmed) {
      setPromoError(isMm ? 'Promo ကုဒ်ထည့်ပါ။' : 'Enter a promo code.');
      return;
    }
    setPromoLoading(true);
    setPromoError(null);
    try {
      const result = isCartMode
        ? await validatePromoCode({
            code: trimmed,
            items: lineItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          })
        : await validatePromoCode({
            code: trimmed,
            productId: product!.id,
            quantity,
          });
      setAppliedPromo(result);
      setPromoInput(result.code);
      hapticNotification('success');
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(err instanceof Error ? err.message : 'Invalid promo code');
      hapticNotification('error');
    } finally {
      setPromoLoading(false);
    }
  }

  async function handleCopyPhone() {
    const cleanPhone = activeMethod.accountPhone.replace(/\s+/g, '');
    try {
      await navigator.clipboard.writeText(cleanPhone);
      hapticNotification('success');
      setCopiedPhone(true);
      showTransientToast(`${t.copiedToast} (${cleanPhone})`);
      window.setTimeout(() => setCopiedPhone(false), 2200);
    } catch {
      hapticNotification('error');
      setErrorMsg('Clipboard access denied. Please copy the phone number manually.');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErrorMsg(null);
    setCompressionSummary(null);
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPG, PNG, or WEBP screenshot.');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setErrorMsg('Receipt image must be smaller than 12 MB.');
      return;
    }

    setCompressingImage(true);
    try {
      const result = await compressReceiptImage(file, {
        maxDimension: 1280,
        quality: 0.82,
      });

      if (result.file.size > 5 * 1024 * 1024) {
        setErrorMsg('Compressed receipt still exceeds 5 MB. Please upload a smaller screenshot.');
        return;
      }

      setReceiptFile(result.file);
      setReceiptPreviewUrl(result.dataUrl);
      if (result.wasCompressed) {
        setCompressionSummary(
          `${formatKb(result.originalBytes)} → ${formatKb(result.compressedBytes)}`
        );
      } else {
        setCompressionSummary(formatKb(result.compressedBytes));
      }
    } finally {
      setCompressingImage(false);
    }
  }

  function handleContinueToStep2() {
    setErrorMsg(null);
    if (!telegramLocked && !customerContact.trim()) {
      hapticNotification('error');
      setErrorMsg(
        isMm
          ? 'ဆက်သွယ်ရန် Email၊ ဖုန်းနံပါတ် သို့မဟုတ် Telegram @username ထည့်ပါ။'
          : 'Please enter your Email, Phone number, or Telegram @username.'
      );
      return;
    }
    hapticSelection();
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lineItems.length === 0) return;

    if (step === 1) {
      handleContinueToStep2();
      return;
    }

    setErrorMsg(null);

    if (!telegramLocked && !customerContact.trim()) {
      hapticNotification('error');
      setStep(1);
      setErrorMsg(
        isMm
          ? 'ဆက်သွယ်ရန် Email၊ ဖုန်းနံပါတ် သို့မဟုတ် Telegram @username ထည့်ပါ။'
          : 'Please enter your Email, Phone number, or Telegram @username.'
      );
      return;
    }

    if (!receiptFile) {
      hapticNotification('error');
      setErrorMsg(
        isMm
          ? 'ငွေလွှဲပြေစာ ဓာတ်ပုံတင်ပေးပါ။'
          : 'Please upload your KPay or WavePay payment receipt screenshot.'
      );
      return;
    }

    hapticImpact('medium');
    setSubmitting(true);
    setVerifyStage(1);
    const stageTimer = window.setTimeout(() => {
      setVerifyStage((prev) => (prev === 1 ? 2 : prev));
    }, 950);

    try {
      const formData = new FormData();
      if (isCartMode) {
        formData.append(
          'items',
          JSON.stringify(lineItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })))
        );
      } else if (product) {
        formData.append('productId', product.id);
        formData.append('quantity', String(quantity));
      }
      formData.append('paymentMethod', selectedProvider);
      formData.append('locale', isMm ? 'MM' : 'EN');
      formData.append('receipt', receiptFile);

      if (!telegramLocked && customerContact.trim()) {
        formData.append('customerContact', customerContact.trim());
      }
      if (transactionLast6.trim()) {
        formData.append('transactionLast6', transactionLast6.trim());
      }
      if (appliedPromo?.code) {
        formData.append('promoCode', appliedPromo.code);
      }

      const result = await submitOrder(formData, initDataRaw);
      window.clearTimeout(stageTimer);
      setVerifyStage(result.autoVerified ? 3 : 2);
      hapticNotification('success');

      saveLocalOrder({
        orderNumber: result.orderNumber,
        accessToken: result.accessToken,
        productTitle: checkoutTitleText,
        totalMmk: result.totalMmk,
        createdAt: result.createdAt,
      });

      if (isCartMode) {
        onCartSuccess?.();
      }

      if (result.autoVerified) {
        await new Promise((r) => window.setTimeout(r, 450));
      }

      onClose();
      router.push(
        `/orders/${encodeURIComponent(result.orderNumber)}?token=${encodeURIComponent(result.accessToken)}`
      );
    } catch (err) {
      window.clearTimeout(stageTimer);
      setVerifyStage(0);
      hapticNotification('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      {/* Floating Copied / QR Saved Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-500/40 bg-white dark:bg-[#121826] px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 shadow-2xl"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span className="whitespace-nowrap">{toastMsg}</span>
        </div>
      )}

      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-4">
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {t.checkoutTitle}
            </p>
            <h2
              id="checkout-modal-title"
              className={`mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {checkoutTitleText}
            </h2>
            <p className="font-mono-tabular mt-0.5 flex items-baseline gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <span>{formatMmk(totalMmk)}</span>
              {discountMmk > 0 && (
                <span className="text-xs text-slate-400 line-through">
                  {formatMmk(subtotalMmk)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t.close}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-[#182133] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile-First 2-Step Wizard Indicator */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-[#0B0F17] p-1">
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setStep(1);
              setErrorMsg(null);
            }}
            className={`min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              step === 1
                ? 'bg-emerald-500 text-slate-950'
                : 'text-emerald-700 dark:text-emerald-300 hover:bg-white dark:hover:bg-[#121826]'
            }`}
          >
            {t.checkoutStep1Label}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (step === 1) handleContinueToStep2();
            }}
            className={`min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              step === 2
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#121826] hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t.checkoutStep2Label}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Night Mode / Delayed Delivery Banner */}
          {shopStatus && !shopStatus.isShopOpen && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200"
            >
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {isMm
                    ? 'ညပိုင်းအချိန် (ပေးပို့မှု အနည်းငယ်ကြာနိုင်ပါသည်)'
                    : 'Night Mode Active · Delayed Delivery'}
                </span>
              </div>
              <p className={`mt-1 leading-relaxed ${isMm ? 'font-myanmar-safe' : ''}`}>
                {shopStatus.offlineNotice}
              </p>
            </div>
          )}

          {step === 1 ? (
            <>
              {/* Single Item Quantity Stepper OR Multi-Item Cart Summary */}
              {isCartMode ? (
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {t.cartTitle} ({lineItems.length}{' '}
                    {isMm ? 'မျိုး' : lineItems.length === 1 ? 'item' : 'items'})
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                    {lineItems.map((entry) => (
                      <div
                        key={entry.product.id}
                        className="flex items-center justify-between gap-2 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {isMm ? entry.product.titleMm : entry.product.titleEn}
                          </p>
                          <p className="font-mono-tabular text-slate-500 dark:text-slate-400">
                            {formatMmk(entry.product.priceMmk)} × {entry.quantity}
                          </p>
                        </div>
                        <span className="font-mono-tabular shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatMmk(entry.product.priceMmk * entry.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : product ? (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {t.quantityLabel}
                    </span>
                    <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                      {formatMmk(product.priceMmk)} × {quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        hapticSelection();
                        setQuantity((q) => Math.max(1, q - 1));
                      }}
                      disabled={quantity <= 1 || submitting}
                      aria-label="Decrease quantity"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#121826] text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="font-mono-tabular w-6 text-center text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        hapticSelection();
                        setQuantity((q) => Math.min(maxQuantity, q + 1));
                      }}
                      disabled={quantity >= maxQuantity || submitting}
                      aria-label="Increase quantity"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#121826] text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Promo Code Discount Input */}
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-3.5 space-y-2.5">
                <label
                  htmlFor="promo-code-input"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  <Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{t.promoLabel}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="promo-code-input"
                    type="text"
                    value={promoInput}
                    disabled={Boolean(appliedPromo) || submitting}
                    onChange={(e) => {
                      setPromoInput(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    placeholder={t.promoPlaceholder}
                    className="font-mono-tabular min-h-[40px] flex-1 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#121826] px-3 text-xs uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-70"
                  />
                  {appliedPromo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedPromo(null);
                        setPromoInput('');
                        setPromoError(null);
                      }}
                      className="min-h-[40px] rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#182133] px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-rose-500 cursor-pointer"
                    >
                      {t.promoRemove}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={promoLoading || submitting}
                      onClick={() => void handleApplyPromo()}
                      className="min-h-[40px] rounded-lg bg-white dark:bg-[#182133] border border-emerald-500/40 px-4 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {promoLoading ? '...' : t.promoApply}
                    </button>
                  )}
                </div>
                {promoError && <p className="text-xs text-rose-500 dark:text-rose-400">{promoError}</p>}
                {appliedPromo && (
                  <div className="space-y-1 border-t border-slate-200 dark:border-white/[0.06] pt-2 text-xs">
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>{t.promoSubtotal}</span>
                      <span className="font-mono-tabular">{formatMmk(subtotalMmk)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>
                        {t.promoDiscount} ({appliedPromo.code})
                      </span>
                      <span className="font-mono-tabular">-{formatMmk(discountMmk)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-50">
                      <span>{t.promoTotal}</span>
                      <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400">
                        {formatMmk(totalMmk)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Identity Section */}
              {telegramLocked && user ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.telegramVerifiedIdentity}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-sm text-slate-900 dark:text-slate-100">
                    <span className="font-medium">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                      {user.username ? ` (@${user.username})` : ''}
                    </span>
                    <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-300">
                      ID: {user.id}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="guest-contact-input"
                    className="block text-sm font-medium text-slate-800 dark:text-slate-200"
                  >
                    {t.guestIdentityLabel} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="guest-contact-input"
                    type="text"
                    required
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder={t.guestIdentityPlaceholder}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <p
                    className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {t.guestIdentityHint}
                  </p>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-600 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleContinueToStep2}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <span>
                  {t.continueToPayment} · {formatMmk(totalMmk)}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              {/* Compact Step 1 Summary Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 text-xs">
                <div className="min-w-0 text-slate-600 dark:text-slate-300">
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    {totalUnits} {isMm ? 'ခု' : totalUnits === 1 ? 'unit' : 'units'}
                  </span>
                  {appliedPromo && (
                    <span className="ml-2 font-mono-tabular text-emerald-600 dark:text-emerald-400">
                      · {appliedPromo.code} (-{formatMmk(discountMmk)})
                    </span>
                  )}
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {telegramLocked && user
                      ? user.username
                        ? `@${user.username}`
                        : `TG:${user.id}`
                      : customerContact}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStep(1);
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  <span>{t.backToDetails}</span>
                </button>
              </div>

              {/* KPay & WavePay Toggle Tabs */}
              <div>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t.paymentMethodLabel}
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-[#0B0F17] p-1">
                  {(['KPAY', 'WAVEPAY'] as PaymentProvider[]).map((provider) => {
                    const active = selectedProvider === provider;
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => {
                          hapticSelection();
                          setSelectedProvider(provider);
                          setCopiedPhone(false);
                        }}
                        className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#121826]'
                        }`}
                      >
                        {provider === 'KPAY' ? 'KBZPay (KPay)' : 'WavePay'}
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic QR + Save QR Image + Copy Phone Number Box */}
                <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="self-center shrink-0">
                      <PaymentQrDisplay
                        provider={selectedProvider}
                        accountName={activeMethod.accountName}
                        accountPhone={activeMethod.accountPhone}
                        qrImageUrl={activeMethod.qrImageUrl}
                        amountMmk={totalMmk}
                        size={112}
                        saveLabel={t.saveQrImage}
                        onSaved={() => {
                          hapticNotification('success');
                          showTransientToast(t.qrSavedToast);
                        }}
                      />
                    </div>

                    <div className="flex-1 space-y-2.5">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t.accountNameLabel}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {activeMethod.accountName}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t.accountPhoneLabel}
                        </p>
                        <p className="font-mono-tabular text-base font-semibold text-emerald-600 dark:text-emerald-400">
                          {activeMethod.accountPhone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyPhone()}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:border-emerald-500/50 transition-colors cursor-pointer"
                      >
                        {copiedPhone ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span className="text-emerald-600 dark:text-emerald-400">{t.copied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" aria-hidden="true" />
                            <span>{t.copyPhone}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {(activeMethod.instructionsEn || activeMethod.instructionsMm) && (
                    <p
                      className={`mt-3 border-t border-slate-200 dark:border-white/[0.06] pt-2.5 text-xs text-slate-500 dark:text-slate-400 ${
                        isMm ? 'font-myanmar-safe' : ''
                      }`}
                    >
                      {isMm
                        ? activeMethod.instructionsMm || activeMethod.instructionsEn
                        : activeMethod.instructionsEn || activeMethod.instructionsMm}
                    </p>
                  )}
                </div>
              </div>

              {/* Optional Transaction Last 6 */}
              <div>
                <label
                  htmlFor="tx-last6-input"
                  className="block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.txLast6Label}
                </label>
                <input
                  id="tx-last6-input"
                  type="text"
                  maxLength={12}
                  value={transactionLast6}
                  onChange={(e) => setTransactionLast6(e.target.value)}
                  placeholder={t.txLast6Placeholder}
                  className="font-mono-tabular mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <p
                  className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${
                    isMm ? 'font-myanmar-safe' : ''
                  }`}
                >
                  {t.txLast6Hint}
                </p>
              </div>

              {/* Receipt Screenshot Uploader with Client-Side Compression */}
              <div>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t.receiptLabel} <span className="text-rose-500">*</span>
                </span>

                <label className="mt-1.5 flex min-h-[116px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-[#0B0F17] p-4 text-center hover:border-emerald-500/60 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handleFileChange(e)}
                    className="sr-only"
                  />
                  {compressingImage ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Optimizing receipt screenshot...
                    </p>
                  ) : receiptPreviewUrl ? (
                    <div className="flex w-full items-center gap-4">
                      <img
                        src={receiptPreviewUrl}
                        alt="Receipt preview"
                        className="h-20 w-20 rounded-lg border border-slate-200 dark:border-white/[0.1] object-cover"
                      />
                      <div className="flex-1 text-left">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {receiptFile?.name}
                        </p>
                        {compressionSummary && (
                          <p className="font-mono-tabular mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                            {compressionSummary}
                          </p>
                        )}
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                          {t.replaceFile}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {t.chooseFile}
                      </span>
                      <span className="text-xs text-slate-500">{t.receiptHint}</span>
                    </div>
                  )}
                </label>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-600 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              )}

              {submitting && verifyStage > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-emerald-500/30 bg-slate-50 dark:bg-[#0B0F17] p-4 space-y-2.5"
                >
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {t.verifyPipelineTitle}
                  </p>
                  {[
                    { step: 1, label: t.verifyStep1 },
                    { step: 2, label: t.verifyStep2 },
                    { step: 3, label: t.verifyStep3 },
                  ].map((item) => {
                    const done = verifyStage > item.step || (verifyStage === 3 && item.step === 3);
                    const active = verifyStage === item.step && !done;
                    return (
                      <div key={item.step} className="flex items-center gap-2.5 text-xs">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                            done
                              ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                              : active
                                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 animate-pulse'
                                : 'border-slate-300 dark:border-white/[0.12] text-slate-500'
                          }`}
                        >
                          {done ? '✓' : item.step}
                        </span>
                        <span
                          className={
                            done
                              ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                              : active
                                ? 'text-slate-900 dark:text-slate-100 font-medium'
                                : 'text-slate-500'
                          }
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || compressingImage}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>
                  {submitting ? t.submittingOrder : `${t.submitOrder} · ${formatMmk(totalMmk)}`}
                </span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
