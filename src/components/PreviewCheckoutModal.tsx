import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  Loader2,
  Lock,
  Minus,
  Moon,
  Plus,
  ScanSearch,
  ShieldCheck,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type {
  PaymentProvider,
  PreviewLocale,
  PreviewMerchantSettings,
  PreviewOrder,
  PreviewPaymentMethod,
  PreviewProduct,
  PreviewPromoCode,
} from '../previewData';
import { compressPreviewImage } from '../utils/previewUtils';
import { PreviewQrDisplay } from './PreviewQrDisplay';

export type ReceiptScanScenario = 'WAIT_FOR_SMS' | 'PREMATCHED_SMS' | 'TAMPERED_SLIP';

export interface PreviewCartCheckoutLine {
  product: PreviewProduct;
  quantity: number;
}

interface PreviewCheckoutModalProps {
  product: PreviewProduct | null;
  cartItems?: PreviewCartCheckoutLine[] | null;
  locale: PreviewLocale;
  isTelegramMode: boolean;
  merchantSettings: PreviewMerchantSettings;
  paymentMethods: Record<PaymentProvider, PreviewPaymentMethod>;
  promoCodes: PreviewPromoCode[];
  existingOrders: PreviewOrder[];
  initialPromoCode?: string | null;
  onHaptic?: (kind: 'light' | 'selection' | 'success' | 'error') => void;
  onClose: () => void;
  onSubmitOrder: (payload: {
    productId: string;
    quantity: number;
    items: Array<{ productId: string; quantity: number }>;
    paymentProvider: PaymentProvider;
    customerContact: string;
    transactionLast6: string;
    receiptDataUrl: string;
    receiptHash: string;
    promoCode: string | null;
    subtotalMmk: number;
    discountMmk: number;
    totalMmk: number;
    ocrExtractedTxId: string;
    ocrExtractedAmount: number;
    ocrConfidenceScore: number;
    ocrTamperingFlags: string[];
    ocrValidationNotes: string;
    forcePreMatchedSms?: boolean;
  }) => void;
}

function formatKb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function computeDataUrlSha256(dataUrl: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(dataUrl);
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback deterministic hash if SubtleCrypto is unavailable
  }
  let hash = 2166136261;
  for (let i = 0; i < dataUrl.length; i++) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function createSampleReceiptDataUrl(
  provider: PaymentProvider,
  totalMmk: number,
  sampleTx6: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560">
    <rect width="420" height="560" fill="#0f172a"/>
    <rect x="24" y="24" width="372" height="512" rx="18" fill="#ffffff"/>
    <rect x="24" y="24" width="372" height="88" rx="18" fill="${provider === 'KPAY' ? '#1d4ed8' : '#eab308'}"/>
    <text x="210" y="76" font-family="sans-serif" font-size="22" font-weight="bold" fill="${provider === 'KPAY' ? '#ffffff' : '#0f172a'}" text-anchor="middle">${provider === 'KPAY' ? 'KBZPay Transfer Slip' : 'WavePay Receipt'}</text>
    <text x="210" y="165" font-family="monospace" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">-${totalMmk.toLocaleString('en-US')} MMK</text>
    <text x="210" y="198" font-family="sans-serif" font-size="14" fill="#16a34a" text-anchor="middle">Transaction Successful</text>
    <line x1="52" y1="228" x2="368" y2="228" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="56" y="272" font-family="sans-serif" font-size="13" fill="#64748b">Transfer To</text>
    <text x="364" y="272" font-family="sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">MMKeyHub Merchant</text>
    <text x="56" y="312" font-family="sans-serif" font-size="13" fill="#64748b">Transaction ID</text>
    <text x="364" y="312" font-family="monospace" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">010099${sampleTx6}</text>
    <text x="56" y="352" font-family="sans-serif" font-size="13" fill="#64748b">Date</text>
    <text x="364" y="352" font-family="monospace" font-size="13" fill="#0f172a" text-anchor="end">${new Date().toISOString().slice(0, 19).replace('T', ' ')}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function PreviewCheckoutModal({
  product,
  cartItems,
  locale,
  isTelegramMode,
  merchantSettings,
  paymentMethods,
  promoCodes,
  existingOrders,
  initialPromoCode,
  onHaptic,
  onClose,
  onSubmitOrder,
}: PreviewCheckoutModalProps) {
  const isMm = locale === 'mm';
  const [step, setStep] = useState<1 | 2>(1);
  const [provider, setProvider] = useState<PaymentProvider>('KPAY');
  const [quantity, setQuantity] = useState(1);
  const [customerContact, setCustomerContact] = useState('');
  const [txLast6, setTxLast6] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState<string>('');
  const [receiptHash, setReceiptHash] = useState<string>('');
  const [receiptFilename, setReceiptFilename] = useState<string>('');
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [scanScenario, setScanScenario] = useState<ReceiptScanScenario>('WAIT_FOR_SMS');
  const [verifyStage, setVerifyStage] = useState<0 | 1 | 2 | 3>(0);

  const isCartMode = Boolean(cartItems && cartItems.length > 0);
  const isOpen = isCartMode || Boolean(product);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setQuantity(1);
    setCustomerContact('');
    setTxLast6('');
    setReceiptDataUrl('');
    setReceiptHash('');
    setReceiptFilename('');
    setCompressionNote(null);
    setErrorMsg(null);
    setCopiedPhone(false);
    setToastMsg(null);
    setScanScenario('WAIT_FOR_SMS');
    setVerifyStage(0);
    const prefill = initialPromoCode?.trim().toUpperCase() || null;
    setPromoInput(prefill ?? '');
    setAppliedPromoCode(prefill);
    setPromoError(null);
  }, [isOpen, product?.id, cartItems?.length, initialPromoCode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const appliedPromo = useMemo(() => {
    if (!appliedPromoCode) return null;
    return promoCodes.find((p) => p.code === appliedPromoCode) ?? null;
  }, [appliedPromoCode, promoCodes]);

  const normalizedItems = useMemo(() => {
    if (cartItems && cartItems.length > 0) return cartItems;
    if (product) return [{ product, quantity }];
    return [];
  }, [cartItems, product, quantity]);

  if (!isOpen || normalizedItems.length === 0) return null;

  const activeMethod = paymentMethods[provider];
  const primaryProduct = normalizedItems[0].product;
  const maxQty = product ? Math.max(1, Math.min(10, product.availableKeys.length)) : 10;
  const totalUnitQty = normalizedItems.reduce((sum, l) => sum + l.quantity, 0);
  const subtotalMmk = normalizedItems.reduce(
    (sum, line) => sum + line.product.priceMmk * line.quantity,
    0
  );
  const discountMmk = appliedPromo
    ? Math.min(
        subtotalMmk,
        appliedPromo.discountType === 'PERCENTAGE'
          ? Math.floor((subtotalMmk * appliedPromo.discountValue) / 100)
          : appliedPromo.discountValue
      )
    : 0;
  const totalMmk = Math.max(0, subtotalMmk - discountMmk);

  const headerTitle = isCartMode
    ? isMm
      ? `စျေးခြင်း (${normalizedItems.length} မျိုး · ${totalUnitQty} ခု)`
      : `Cart Checkout (${normalizedItems.length} items · ${totalUnitQty} qty)`
    : isMm
      ? primaryProduct.titleMm
      : primaryProduct.titleEn;

  function showTransientToast(msg: string) {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2200);
  }

  function handleApplyPromo(candidate?: string) {
    const raw = (candidate ?? promoInput).trim().toUpperCase();
    if (!raw) {
      setPromoError(isMm ? 'Promo ကုဒ်ထည့်ပါ။' : 'Enter a promo code.');
      return;
    }
    const found = promoCodes.find((p) => p.code === raw);
    if (!found) {
      setAppliedPromoCode(null);
      setPromoError('Promo code not found.');
      return;
    }
    if (!found.isActive) {
      setAppliedPromoCode(null);
      setPromoError('This promo code is currently paused.');
      return;
    }
    if (found.expiresAt && Date.parse(found.expiresAt) <= Date.now()) {
      setAppliedPromoCode(null);
      setPromoError('This promo code has expired.');
      return;
    }
    if (found.maxUses !== null && found.usedCount >= found.maxUses) {
      setAppliedPromoCode(null);
      setPromoError('This promo code has reached its usage limit.');
      return;
    }
    setPromoError(null);
    setPromoInput(found.code);
    setAppliedPromoCode(found.code);
    onHaptic?.('success');
  }

  async function handleCopyPhone() {
    const cleanPhone = activeMethod.accountPhone.replace(/\s+/g, '');
    try {
      await navigator.clipboard.writeText(cleanPhone);
      onHaptic?.('success');
      setCopiedPhone(true);
      showTransientToast(
        isMm
          ? `ဖုန်းနံပါတ်ကူးယူပြီးပါပြီ (${cleanPhone})`
          : `Copied! ${cleanPhone} saved to clipboard`
      );
      window.setTimeout(() => setCopiedPhone(false), 2200);
    } catch {
      onHaptic?.('error');
      setErrorMsg('Clipboard blocked — copy phone number manually.');
    }
  }

  function hasDuplicateReceiptHash(hash: string): PreviewOrder | undefined {
    return existingOrders.find(
      (o) => o.receiptHash && o.receiptHash === hash && o.status !== 'REJECTED'
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErrorMsg(null);
    setCompressionNote(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onHaptic?.('error');
      setErrorMsg('Please select a JPG, PNG, or WEBP screenshot.');
      return;
    }

    setCompressing(true);
    try {
      const res = await compressPreviewImage(file, { maxDimension: 1280, quality: 0.82 });
      const hash = await computeDataUrlSha256(res.dataUrl);
      const duplicate = hasDuplicateReceiptHash(hash);
      if (duplicate) {
        onHaptic?.('error');
        setReceiptDataUrl('');
        setReceiptHash('');
        setReceiptFilename('');
        setErrorMsg(
          isMm
            ? `ဤငွေလွှဲပြေစာဓာတ်ပုံကို အော်ဒါ ${duplicate.orderNumber} တွင် အသုံးပြုပြီးဖြစ်ပါသည်။ ပြေစာအသစ်တင်ပေးပါ။`
            : `Duplicate receipt image rejected (HTTP 409): This screenshot matches order ${duplicate.orderNumber}.`
        );
        return;
      }

      setReceiptDataUrl(res.dataUrl);
      setReceiptHash(hash);
      setReceiptFilename(res.filename);
      setCompressionNote(
        res.wasCompressed
          ? `${formatKb(res.originalBytes)} → ${formatKb(res.compressedBytes)}`
          : formatKb(res.compressedBytes)
      );
    } finally {
      setCompressing(false);
    }
  }

  async function handleUseSampleSlip(targetScenario: ReceiptScanScenario = scanScenario) {
    setErrorMsg(null);
    const tx6 =
      targetScenario === 'PREMATCHED_SMS' && provider === 'KPAY' && totalMmk === 25000
        ? '771122'
        : String(Math.floor(100000 + Math.random() * 900000));
    const displayedAmount =
      targetScenario === 'TAMPERED_SLIP' ? Math.max(1000, totalMmk - 5000) : totalMmk;
    const sampleUrl = createSampleReceiptDataUrl(provider, displayedAmount, tx6);
    const hash = await computeDataUrlSha256(sampleUrl);
    setReceiptDataUrl(sampleUrl);
    setReceiptHash(hash);
    setReceiptFilename(`${provider.toLowerCase()}-${targetScenario.toLowerCase()}.svg`);
    setCompressionNote(
      targetScenario === 'TAMPERED_SLIP' ? 'Simulated Tampered Slip · 2 KB' : 'Sample SVG · 2 KB'
    );
    setTxLast6(tx6);
    onHaptic?.('light');
  }

  async function handleSelectScenario(next: ReceiptScanScenario) {
    setScanScenario(next);
    if (next === 'PREMATCHED_SMS') {
      setProvider('KPAY');
    }
    if (receiptDataUrl) {
      await handleUseSampleSlip(next);
    }
  }

  function handleContinueToStep2() {
    setErrorMsg(null);
    if (!isTelegramMode && !customerContact.trim()) {
      onHaptic?.('error');
      setErrorMsg(
        isMm
          ? 'Email သို့မဟုတ် ဖုန်းနံပါတ် ထည့်သွင်းပါ။'
          : 'Please enter your Email, Phone, or Telegram @username.'
      );
      return;
    }
    onHaptic?.('selection');
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (verifyStage > 0) return;

    if (step === 1) {
      handleContinueToStep2();
      return;
    }

    if (!isTelegramMode && !customerContact.trim()) {
      onHaptic?.('error');
      setStep(1);
      setErrorMsg(
        isMm
          ? 'Email သို့မဟုတ် ဖုန်းနံပါတ် ထည့်သွင်းပါ။'
          : 'Please enter your Email, Phone, or Telegram @username.'
      );
      return;
    }
    if (!receiptDataUrl) {
      onHaptic?.('error');
      setErrorMsg(
        isMm
          ? 'ငွေလွှဲပြေစာ ဓာတ်ပုံတင်ပေးပါ (သို့မဟုတ် Sample Slip သုံးစမ်းနိုင်ပါသည်)။'
          : 'Upload a payment receipt screenshot (or click "Use Sample Slip" to test).'
      );
      return;
    }

    const dup = receiptHash ? hasDuplicateReceiptHash(receiptHash) : undefined;
    if (dup) {
      onHaptic?.('error');
      setErrorMsg(
        `Duplicate receipt image rejected (HTTP 409): Matches order ${dup.orderNumber}.`
      );
      return;
    }

    setErrorMsg(null);
    setVerifyStage(1);
    await new Promise((r) => setTimeout(r, 420));
    setVerifyStage(2);
    await new Promise((r) => setTimeout(r, 450));
    setVerifyStage(3);
    await new Promise((r) => setTimeout(r, 280));

    const cleanTx6 = txLast6.trim() || String(Math.floor(100000 + Math.random() * 900000));
    const fullTxId = `010099${cleanTx6}`;
    const isTampered = scanScenario === 'TAMPERED_SLIP';

    onHaptic?.('success');
    onSubmitOrder({
      productId: primaryProduct.id,
      quantity: totalUnitQty,
      items: normalizedItems.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
      })),
      paymentProvider: provider,
      customerContact: isTelegramMode ? '@kyaw_dev (TG: 704118290)' : customerContact.trim(),
      transactionLast6: cleanTx6,
      receiptDataUrl,
      receiptHash,
      promoCode: appliedPromo?.code ?? null,
      subtotalMmk,
      discountMmk,
      totalMmk,
      ocrExtractedTxId: fullTxId,
      ocrExtractedAmount: isTampered ? Math.max(1000, totalMmk - 5000) : totalMmk,
      ocrConfidenceScore: isTampered ? 0.42 : 0.99,
      ocrTamperingFlags: isTampered
        ? [
            `Amount mismatch: receipt shows ${Math.max(1000, totalMmk - 5000).toLocaleString('en-US')} MMK vs ${totalMmk.toLocaleString('en-US')} MMK`,
            'Edited digit font anomaly detected around amount area',
          ]
        : [],
      ocrValidationNotes: isTampered
        ? 'Flagged by AI Vision OCR — escalated to @MMKeyHubAdmins for manual review.'
        : 'AI Vision OCR passed all checks (provider, receiver account, SUCCESS status, exact MMK).',
      forcePreMatchedSms: scanScenario === 'PREMATCHED_SMS',
    });
    setVerifyStage(0);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-500/40 bg-white px-4 py-2.5 text-xs font-medium text-emerald-700 shadow-2xl dark:bg-[#121826] dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <span className="whitespace-nowrap">{toastMsg}</span>
        </div>
      )}

      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/[0.1] dark:bg-[#121826] sm:max-w-xl sm:rounded-2xl sm:p-6">
        {isTelegramMode && (
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                onHaptic?.('light');
                if (step === 2) {
                  setStep(1);
                  return;
                }
                onClose();
              }}
              className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isMm ? 'နောက်သို့' : 'Back'}</span>
            </button>
            <span className="font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500">
              Telegram BackButton + Haptics
            </span>
          </div>
        )}

        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/[0.08]">
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {isMm ? 'ငွေပေးချေမှု အတည်ပြုရန်' : 'Complete Purchase'}
            </p>
            <h2
              className={`mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {headerTitle}
            </h2>
            <p className="font-mono-tabular mt-0.5 flex items-baseline gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <span>{totalMmk.toLocaleString('en-US')} MMK</span>
              {discountMmk > 0 && (
                <span className="text-xs text-slate-400 line-through">
                  {subtotalMmk.toLocaleString('en-US')} MMK
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#182133] dark:text-slate-300 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* 2-Step Wizard Indicator */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/[0.08] dark:bg-[#0B0F17]">
          <button
            type="button"
            disabled={verifyStage > 0}
            onClick={() => {
              setStep(1);
              setErrorMsg(null);
            }}
            className={`min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              step === 1
                ? 'bg-emerald-500 text-slate-950'
                : 'text-emerald-700 hover:bg-white dark:text-emerald-300 dark:hover:bg-[#121826]'
            }`}
          >
            {isMm ? '၁။ အရေအတွက်နှင့် ဆက်သွယ်ရန်' : '1. Order & Contact'}
          </button>
          <button
            type="button"
            disabled={verifyStage > 0}
            onClick={() => {
              if (step === 1) handleContinueToStep2();
            }}
            className={`min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              step === 2
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#121826] dark:hover:text-slate-200'
            }`}
          >
            {isMm ? '၂။ ငွေလွှဲပြီး ပြေစာတင်ရန်' : '2. Pay & Upload Receipt'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!merchantSettings.isShopOpen && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/35 bg-amber-50 p-3.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
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
                {isMm ? merchantSettings.offlineNoticeMm : merchantSettings.offlineNoticeEn}
              </p>
            </div>
          )}

          {step === 1 ? (
            <>
              {isCartMode ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {isMm ? 'စျေးခြင်းထဲမှ ပစ္စည်းများ' : 'Order Items Breakdown'}
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                    {normalizedItems.map((line) => (
                      <div
                        key={line.product.id}
                        className="flex items-center justify-between gap-2 py-2 text-xs"
                      >
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {isMm ? line.product.titleMm : line.product.titleEn} × {line.quantity}
                        </span>
                        <span className="font-mono-tabular shrink-0 font-semibold text-slate-900 dark:text-slate-100">
                          {(line.product.priceMmk * line.quantity).toLocaleString('en-US')} MMK
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <div>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {isMm ? 'အရေအတွက် (၁၀ ခုအထိ)' : 'Quantity (Up to 10)'}
                    </span>
                    <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                      {primaryProduct.priceMmk.toLocaleString('en-US')} MMK × {quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onHaptic?.('selection');
                        setQuantity((q) => Math.max(1, q - 1));
                      }}
                      disabled={quantity <= 1}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="font-mono-tabular w-6 text-center text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onHaptic?.('selection');
                        setQuantity((q) => Math.min(maxQty, q + 1));
                      }}
                      disabled={quantity >= maxQty}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Promo Code Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="preview-promo-input"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Tag className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    <span>{isMm ? 'Promo ကုဒ် ထည့်ရန် (ရှိလျှင်)' : 'Promo Code (Optional)'}</span>
                  </label>
                  {!appliedPromo && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Try:</span>
                      {promoCodes
                        .filter((p) => p.isActive)
                        .slice(0, 2)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleApplyPromo(p.code)}
                            className="font-mono-tabular text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                          >
                            {p.code}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    id="preview-promo-input"
                    type="text"
                    value={promoInput}
                    disabled={Boolean(appliedPromo)}
                    onChange={(e) => {
                      setPromoInput(e.target.value.toUpperCase());
                      setPromoError(null);
                    }}
                    placeholder="e.g. KYAT10"
                    className="font-mono-tabular min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs uppercase text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-70 dark:border-white/[0.12] dark:bg-[#121826] dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  {appliedPromo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedPromoCode(null);
                        setPromoInput('');
                        setPromoError(null);
                      }}
                      className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:text-rose-600 dark:border-white/[0.12] dark:bg-[#182133] dark:text-slate-200 dark:hover:text-rose-300 cursor-pointer"
                    >
                      {isMm ? 'ဖယ်ရှားမည်' : 'Remove'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApplyPromo()}
                      className="min-h-[40px] rounded-lg border border-emerald-500/40 bg-white px-4 text-xs font-semibold text-emerald-700 hover:bg-emerald-500 hover:text-slate-950 dark:bg-[#182133] dark:text-emerald-300 transition-colors cursor-pointer"
                    >
                      {isMm ? 'အသုံးပြုမည်' : 'Apply'}
                    </button>
                  )}
                </div>

                {promoError && <p className="text-xs text-rose-500">{promoError}</p>}
                {appliedPromo && (
                  <div className="space-y-1 border-t border-slate-200 pt-2 text-xs dark:border-white/[0.06]">
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>{isMm ? 'မူရင်းစုစုပေါင်း' : 'Subtotal'}</span>
                      <span className="font-mono-tabular">
                        {subtotalMmk.toLocaleString('en-US')} MMK
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>
                        {isMm ? 'Promo လျှော့ဈေး' : 'Promo Discount'} ({appliedPromo.code})
                      </span>
                      <span className="font-mono-tabular">
                        -{discountMmk.toLocaleString('en-US')} MMK
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-50">
                      <span>{isMm ? 'ပေးချေရမည့်ပမာဏ' : 'Final Total'}</span>
                      <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400">
                        {totalMmk.toLocaleString('en-US')} MMK
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {isTelegramMode ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {isMm
                        ? 'Telegram Mini App အကောင့် (အလိုအလျောက်ချိတ်ဆက်ပြီး)'
                        : 'Telegram Mini App Identity (Verified & Locked)'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-sm text-slate-900 dark:text-slate-100">
                    <span className="font-medium">Kyaw Zin (@kyaw_dev)</span>
                    <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-300">
                      ID: 704118290
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="preview-guest-contact"
                    className="block text-sm font-medium text-slate-800 dark:text-slate-200"
                  >
                    {isMm
                      ? 'ဆက်သွယ်ရန် (Email၊ ဖုန်းနံပါတ် သို့မဟုတ် @username)'
                      : 'Delivery Contact (Email, Phone, or Telegram @username)'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="preview-guest-contact"
                    type="text"
                    required
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder="name@example.com or 09xxxxxxxxx"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-white/[0.12] dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <p
                    className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {isMm
                      ? 'Email ထည့်သွင်းပါက Key ကို Email မှပါ အလိုအလျောက် ပို့ပေးပါမည်။'
                      : 'Tip: Enter your Email address to also test automatic SMTP key delivery preview.'}
                  </p>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
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
                  {isMm
                    ? `ငွေပေးချေမှုသို့ ဆက်သွားမည် · ${totalMmk.toLocaleString('en-US')} MMK`
                    : `Continue to Payment · ${totalMmk.toLocaleString('en-US')} MMK`}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-white/[0.08] dark:bg-[#0B0F17]">
                <div className="min-w-0 text-slate-600 dark:text-slate-300">
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    Qty: {totalUnitQty}
                  </span>
                  {appliedPromo && (
                    <span className="ml-2 font-mono-tabular text-emerald-600 dark:text-emerald-400">
                      · {appliedPromo.code} (-{discountMmk.toLocaleString('en-US')} MMK)
                    </span>
                  )}
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {isTelegramMode ? '@kyaw_dev' : customerContact}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={verifyStage > 0}
                  onClick={() => {
                    setStep(1);
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  <span>{isMm ? 'ပြန်ပြင်မည်' : 'Edit Order'}</span>
                </button>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  {isMm ? 'ငွေပေးချေမည့် နည်းလမ်းရွေးပါ' : 'Select Payment Method'}
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  {(['KPAY', 'WAVEPAY'] as PaymentProvider[]).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => {
                        onHaptic?.('selection');
                        setProvider(prov);
                        setCopiedPhone(false);
                      }}
                      className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                        provider === prov
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#121826] dark:hover:text-white'
                      }`}
                    >
                      {prov === 'KPAY' ? 'KBZPay (KPay)' : 'WavePay'}
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="self-center shrink-0">
                      <PreviewQrDisplay
                        provider={provider}
                        accountName={activeMethod.accountName}
                        accountPhone={activeMethod.accountPhone}
                        qrImageUrl={activeMethod.qrImageUrl}
                        amountMmk={totalMmk}
                        size={112}
                        saveLabel={isMm ? 'QR ပုံသိမ်းဆည်းမည်' : 'Save QR Image'}
                        onSaved={() => {
                          onHaptic?.('success');
                          showTransientToast(
                            isMm
                              ? 'QR ပုံကို PNG အဖြစ် သိမ်းဆည်းပြီးပါပြီ'
                              : 'QR code saved as PNG image'
                          );
                        }}
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {isMm ? 'အကောင့်အမည်' : 'Account Name'}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {activeMethod.accountName}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {isMm ? 'ဖုန်းနံပါတ်' : 'Account Number'}
                        </p>
                        <p className="font-mono-tabular text-base font-semibold text-emerald-600 dark:text-emerald-400">
                          {activeMethod.accountPhone}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyPhone()}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#121826] dark:text-slate-100 cursor-pointer"
                      >
                        {copiedPhone ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {isMm ? 'ကူးယူပြီး!' : 'Copied!'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" aria-hidden="true" />
                            <span>{isMm ? 'ဖုန်းနံပါတ်ကူးယူရန်' : 'Copy Phone Number'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p
                    className={`mt-3 border-t border-slate-200 pt-2.5 text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {isMm ? activeMethod.instructionsMm : activeMethod.instructionsEn}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="preview-tx6"
                  className="block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {isMm
                    ? 'လုပ်ငန်းစဉ်နံပါတ် နောက်ဆုံး ၆ လုံး (ရှိလျှင်)'
                    : 'Last 6 Digits of Transaction ID (Optional)'}
                </label>
                <input
                  id="preview-tx6"
                  type="text"
                  maxLength={12}
                  value={txLast6}
                  onChange={(e) => setTxLast6(e.target.value)}
                  placeholder="e.g. 482910"
                  className="font-mono-tabular mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-white/[0.12] dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <p
                  className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${
                    isMm ? 'font-myanmar-safe' : ''
                  }`}
                >
                  {isMm
                    ? 'ပြေစာအတုနှင့် ထပ်နေသောပြေစာများကို စစ်ဆေးနိုင်ရန် ကူညီပေးပါသည်။ (482910 ရိုက်၍ Duplicate Tx ID သတိပေးချက်ကို စမ်းနိုင်သည်)'
                    : 'Prevents duplicate slip fraud. Tip: enter 482910 to test the Admin Duplicate Tx ID alert.'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {isMm ? 'ငွေလွှဲပြေစာ ဓာတ်ပုံတင်ရန်' : 'Upload Payment Receipt'}{' '}
                    <span className="text-rose-500">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUseSampleSlip()}
                    className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                  >
                    {isMm ? 'Sample ပြေစာသုံးစမ်းမည်' : 'Use Sample Slip'}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    <ScanSearch className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    <span>
                      {isMm
                        ? '24/7 AI OCR စမ်းသပ်မှု ရွေးချယ်ရန်'
                        : 'AI Vision OCR & Ledger Test Scenario'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {(
                      [
                        {
                          id: 'WAIT_FOR_SMS',
                          label: isMm ? 'Valid Slip (SMS စောင့်)' : 'Valid Slip (Wait SMS)',
                        },
                        {
                          id: 'PREMATCHED_SMS',
                          label: isMm ? 'Pre-Matched SMS (ချက်ချင်း)' : 'Pre-Matched SMS (Instant)',
                        },
                        {
                          id: 'TAMPERED_SLIP',
                          label: isMm ? 'Tampered Slip (Admin စစ်)' : 'Tampered Slip (Fallback)',
                        },
                      ] as Array<{ id: ReceiptScanScenario; label: string }>
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleSelectScenario(item.id)}
                        className={`min-h-[34px] rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                          scanScenario === item.id
                            ? item.id === 'TAMPERED_SLIP'
                              ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#121826] dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {scanScenario === 'TAMPERED_SLIP' && (
                    <p className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        Simulates edited MMK amount — skips auto-verify and alerts @MMKeyHubAdmins.
                      </span>
                    </p>
                  )}
                  {scanScenario === 'PREMATCHED_SMS' && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Matches an incoming bank SMS in the ledger for zero-wait instant key unlock!
                    </p>
                  )}
                </div>

                <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-emerald-500/60 dark:border-white/20 dark:bg-[#0B0F17] transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handleFileChange(e)}
                    className="sr-only"
                  />
                  {compressing ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Compressing receipt screenshot...
                    </p>
                  ) : receiptDataUrl ? (
                    <div className="flex w-full items-center gap-4">
                      <img
                        src={receiptDataUrl}
                        alt="Receipt preview"
                        className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-white/[0.1]"
                      />
                      <div className="flex-1 text-left">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {receiptFilename}
                        </p>
                        {compressionNote && (
                          <p className="font-mono-tabular mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                            {compressionNote}
                          </p>
                        )}
                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                          {isMm ? 'ပုံအသစ်ပြောင်းရန်' : 'Change Image'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {isMm ? 'ပြေစာဓာတ်ပုံ ရွေးချယ်ရန်' : 'Choose Receipt Image'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {isMm
                          ? 'JPG, PNG, WEBP · အလိုအလျောက် size ချုံ့၍ တင်ပေးမည်'
                          : 'JPG, PNG, WEBP · Auto-compressed before upload'}
                      </span>
                    </div>
                  )}
                </label>
              </div>

              {verifyStage > 0 && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>
                      {verifyStage === 1
                        ? '1. Scanning Receipt with AI Vision...'
                        : verifyStage === 2
                          ? '2. Verifying Bank SMS Ledger...'
                          : scanScenario === 'PREMATCHED_SMS'
                            ? '3. Instant Key Unlocked!'
                            : scanScenario === 'TAMPERED_SLIP'
                              ? '3. Routing Suspicious Slip to Admin Group...'
                              : '3. Order Created — Listening for Bank SMS...'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <span
                      className={
                        verifyStage >= 1
                          ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                          : 'text-slate-500'
                      }
                    >
                      1. AI Vision Scan
                    </span>
                    <span
                      className={
                        verifyStage >= 2
                          ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                          : 'text-slate-500'
                      }
                    >
                      2. Bank Ledger Check
                    </span>
                    <span
                      className={
                        verifyStage >= 3
                          ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                          : 'text-slate-500'
                      }
                    >
                      3. Atomic Key Lock
                    </span>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={compressing || verifyStage > 0}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>
                  {verifyStage > 0
                    ? 'Running 24/7 Verification...'
                    : isMm
                      ? `ငွေလွှဲပြေစာ တင်သွင်းမည် · ${totalMmk.toLocaleString('en-US')} MMK`
                      : `Submit Payment Proof · ${totalMmk.toLocaleString('en-US')} MMK`}
                </span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
