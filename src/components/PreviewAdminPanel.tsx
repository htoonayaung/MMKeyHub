import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  ImagePlus,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Megaphone,
  Moon,
  Package,
  PackagePlus,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tag,
  Timer,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  type DeliveryFormat,
  type DiscountType,
  INITIAL_HERO_SLIDES,
  type PaymentProvider,
  type PreviewAuditLogEntry,
  type PreviewBotSubscriber,
  type PreviewIncomingSms,
  type PreviewMerchantSettings,
  type PreviewOrder,
  type PreviewPaymentMethod,
  type PreviewProduct,
  type PreviewPromoCode,
} from '../previewData';
import { compressPreviewImage } from '../utils/previewUtils';
import { PreviewQrDisplay } from './PreviewQrDisplay';

export interface PreviewDailySummaryReport {
  dateKey: string;
  totalRevenueMmk: number;
  approvedOrdersCount: number;
  autoVerifiedCount: number;
  autoVerifyRatePct: number;
  pendingOrdersCount: number;
  lowStockCount: number;
  telegramDelivered: boolean;
}

interface PreviewAdminPanelProps {
  products: PreviewProduct[];
  orders: PreviewOrder[];
  incomingSmsList: PreviewIncomingSms[];
  merchantSettings: PreviewMerchantSettings;
  paymentMethods: Record<PaymentProvider, PreviewPaymentMethod>;
  promoCodes: PreviewPromoCode[];
  subscribers: PreviewBotSubscriber[];
  auditLogs: PreviewAuditLogEntry[];
  onUpdateMerchantSettings: (next: PreviewMerchantSettings) => void;
  onAddProduct: (prod: Omit<PreviewProduct, 'id' | 'availableKeys' | 'reservedCount' | 'soldCount'>) => void;
  onUpdateProduct: (
    productId: string,
    patch: {
      titleEn?: string;
      priceMmk?: number;
      originalPriceMmk?: number | null;
      durationEn?: string;
      imageUrl?: string | null;
    }
  ) => void;
  onToggleProductActive: (productId: string) => void;
  onBulkUploadStock: (productId: string, lines: string[]) => { inserted: number; skipped: number };
  onApproveOrder: (orderId: string, actorName: string) => void;
  onRejectOrder: (orderId: string, reason: string, actorName: string) => void;
  onSimulateIncomingSms: (input: {
    rawMessage?: string;
    provider?: PaymentProvider;
    transactionId?: string;
    amountMmk?: number;
    senderInfo?: string;
  }) => { matchedOrderNumber: string | null; sms: PreviewIncomingSms };
  onLinkSmsToOrder: (
    smsId: string,
    orderId: string
  ) => { ok: boolean; orderNumber?: string; error?: string };
  onSendDailySummary: () => PreviewDailySummaryReport;
  onUpdatePaymentMethod: (provider: PaymentProvider, next: PreviewPaymentMethod) => void;
  onCreatePromoCode: (
    promo: Omit<PreviewPromoCode, 'id' | 'usedCount'>
  ) => { ok: boolean; error?: string };
  onTogglePromoActive: (promoId: string) => void;
  onSendBroadcast: (payload: {
    message: string;
    photoUrl?: string;
    promoCode?: string;
  }) => {
    totalTargets: number;
    sentCount: number;
    failedCount: number;
    blockedCount: number;
  };
  onRunExpiryReminderSweep: () => number;
}

type AdminTab = 'orders' | 'products' | 'promos' | 'settings';
type OrderStatusFilter =
  | 'ALL'
  | 'PENDING_APPROVAL'
  | 'MANUAL_REVIEW'
  | 'AUTO_VERIFIED'
  | 'APPROVED'
  | 'REJECTED';

const DEMO_ADMIN_KEY = 'mmkeyhub-demo-key';
const ORDERS_PAGE_SIZE = 5;

export function PreviewAdminPanel({
  products,
  orders,
  incomingSmsList,
  merchantSettings,
  paymentMethods,
  promoCodes,
  subscribers,
  auditLogs,
  onUpdateMerchantSettings,
  onAddProduct,
  onUpdateProduct,
  onToggleProductActive,
  onBulkUploadStock,
  onApproveOrder,
  onRejectOrder,
  onSimulateIncomingSms,
  onLinkSmsToOrder,
  onSendDailySummary,
  onUpdatePaymentMethod,
  onCreatePromoCode,
  onTogglePromoActive,
  onSendBroadcast,
  onRunExpiryReminderSweep,
}: PreviewAdminPanelProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('mmk_preview_admin_key') === DEMO_ADMIN_KEY;
  });
  const [keyInput, setKeyInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('orders');

  // Orders search / filter / pagination
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [linkOrderSelections, setLinkOrderSelections] = useState<Record<string, string>>({});

  // Audit Log filter
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditActorFilter, setAuditActorFilter] = useState<string>('ALL');

  // Add Product form
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState<DeliveryFormat>('LICENSE_KEY');
  const [prodPrice, setProdPrice] = useState('');
  const [prodOriginalPrice, setProdOriginalPrice] = useState('');
  const [prodDuration, setProdDuration] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodImageUploading, setProdImageUploading] = useState(false);
  const [prodImageInfo, setProdImageInfo] = useState<string | null>(null);
  const [prodDesc, setProdDesc] = useState('');
  const [prodError, setProdError] = useState<string | null>(null);

  // Edit Product Modal
  const [editingProduct, setEditingProduct] = useState<PreviewProduct | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOriginalPrice, setEditOriginalPrice] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editImageUploading, setEditImageUploading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Promo Codes
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDiscountType, setPromoDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [promoDiscountValue, setPromoDiscountValue] = useState('10');
  const [promoMaxUses, setPromoMaxUses] = useState('50');
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [promoNotice, setPromoNotice] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Payment Settings
  const [pmTab, setPmTab] = useState<PaymentProvider>('KPAY');
  const [pmName, setPmName] = useState(paymentMethods.KPAY.accountName);
  const [pmPhone, setPmPhone] = useState(paymentMethods.KPAY.accountPhone);
  const [pmQrUrl, setPmQrUrl] = useState(paymentMethods.KPAY.qrImageUrl);
  const [pmNotice, setPmNotice] = useState<string | null>(null);

  // Daily Summary Report
  const [dailyReport, setDailyReport] = useState<PreviewDailySummaryReport | null>(null);

  // Bulk Stock Modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProdId, setStockProdId] = useState(products[0]?.id ?? '');
  const [stockText, setStockText] = useState('');
  const [stockNotice, setStockNotice] = useState<string | null>(null);

  // Broadcast & Expiry Reminders
  const [broadcastMessage, setBroadcastMessage] = useState(
    'Flash Sale Live on MMKeyHub! Enjoy 15% OFF all VPN & License Keys today with promo code FLASH15.'
  );
  const [broadcastPhotoUrl, setBroadcastPhotoUrl] = useState('');
  const [broadcastPromoCode, setBroadcastPromoCode] = useState('FLASH15');
  const [broadcastResult, setBroadcastResult] = useState<{
    totalTargets: number;
    sentCount: number;
    failedCount: number;
    blockedCount: number;
  } | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [csvMonth, setCsvMonth] = useState('');

  const [receiptPreviewOrder, setReceiptPreviewOrder] = useState<PreviewOrder | null>(null);
  const [adminSmsInput, setAdminSmsInput] = useState(
    'WavePay: You received 18,500 MMK from 09791234567. Ref ID: WP88001122.'
  );
  const [adminSmsNotice, setAdminSmsNotice] = useState<string | null>(null);

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === 'PENDING_APPROVAL'),
    [orders]
  );
  const latestPendingOrder = pendingOrders[0] ?? null;

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((ord) => {
      if (orderStatusFilter === 'PENDING_APPROVAL' && ord.status !== 'PENDING_APPROVAL') {
        return false;
      }
      if (orderStatusFilter === 'APPROVED' && ord.status !== 'APPROVED') return false;
      if (orderStatusFilter === 'REJECTED' && ord.status !== 'REJECTED') return false;
      if (orderStatusFilter === 'MANUAL_REVIEW' && ord.verificationMode !== 'MANUAL_REVIEW') {
        return false;
      }
      if (orderStatusFilter === 'AUTO_VERIFIED' && ord.verificationMode !== 'AUTO_VERIFIED') {
        return false;
      }
      if (!q) return true;
      return (
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.transactionLast6.toLowerCase().includes(q) ||
        (ord.ocrExtractedTxId ?? '').toLowerCase().includes(q) ||
        ord.customerLabel.toLowerCase().includes(q) ||
        ord.productTitleEn.toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));

  useEffect(() => {
    setOrderPage(1);
  }, [orderSearch, orderStatusFilter]);

  useEffect(() => {
    if (orderPage > totalOrderPages) {
      setOrderPage(totalOrderPages);
    }
  }, [orderPage, totalOrderPages]);

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * ORDERS_PAGE_SIZE;
    return filteredOrders.slice(start, start + ORDERS_PAGE_SIZE);
  }, [filteredOrders, orderPage]);

  const activeSubscribersCount = useMemo(
    () => subscribers.filter((s) => !s.isBlocked).length,
    [subscribers]
  );
  const blockedSubscribersCount = useMemo(
    () => subscribers.filter((s) => s.isBlocked).length,
    [subscribers]
  );

  const totalRevenueMmk = useMemo(
    () => orders.filter((o) => o.status === 'APPROVED').reduce((sum, o) => sum + o.totalMmk, 0),
    [orders]
  );
  const pendingCount = pendingOrders.length;
  const approvedCount = useMemo(
    () => orders.filter((o) => o.status === 'APPROVED').length,
    [orders]
  );
  const lowStockProducts = useMemo(
    () => products.filter((p) => p.isActive && p.availableKeys.length < 5),
    [products]
  );

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = keyInput.trim();
    if (!cleaned) {
      setAuthError('Enter your Admin API Key to unlock.');
      return;
    }
    if (cleaned !== DEMO_ADMIN_KEY) {
      setAuthError('Invalid Admin API Key.');
      return;
    }
    window.sessionStorage.setItem('mmk_preview_admin_key', cleaned);
    setAuthError(null);
    setUnlocked(true);
  }

  function handleLogout() {
    window.sessionStorage.removeItem('mmk_preview_admin_key');
    setUnlocked(false);
  }

  function handleSwitchPmTab(prov: PaymentProvider) {
    setPmTab(prov);
    setPmName(paymentMethods[prov].accountName);
    setPmPhone(paymentMethods[prov].accountPhone);
    setPmQrUrl(paymentMethods[prov].qrImageUrl);
    setPmNotice(null);
  }

  function handleSavePm(e: React.FormEvent) {
    e.preventDefault();
    onUpdatePaymentMethod(pmTab, {
      ...paymentMethods[pmTab],
      accountName: pmName.trim(),
      accountPhone: pmPhone.trim(),
      qrImageUrl: pmQrUrl.trim(),
    });
    setPmNotice(`Updated ${pmTab} account & QR details for Checkout.`);
  }

  function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProdError(null);
    const price = Number(prodPrice);
    if (!prodName.trim() || !prodDesc.trim() || !Number.isFinite(price) || price <= 0) {
      setProdError('Enter a valid product name, description, and MMK price.');
      return;
    }

    const parsedOriginal = prodOriginalPrice.trim() ? Number(prodOriginalPrice.trim()) : null;
    if (parsedOriginal !== null) {
      if (!Number.isFinite(parsedOriginal) || parsedOriginal <= price) {
        setProdError('Original Price (Flash Sale) must be greater than the selling price.');
        return;
      }
    }

    const categoryMap: Record<DeliveryFormat, { en: string; mm: string }> = {
      LICENSE_KEY: { en: 'License Keys', mm: 'Software Keys' },
      ACCOUNT_LOGIN: { en: 'Accounts', mm: 'Premium Accounts' },
      VPN_CONFIG: { en: 'VPN', mm: 'VPN Configs' },
    };

    onAddProduct({
      titleEn: prodName.trim(),
      titleMm: prodName.trim(),
      descriptionEn: prodDesc.trim(),
      descriptionMm: prodDesc.trim(),
      instructionsEn: 'Follow the activation guide included with your credential.',
      instructionsMm: 'ပေးပို့ထားသော Key / Config ကို ထည့်သွင်းအသုံးပြုပါ။',
      categoryNameEn: categoryMap[prodCategory].en,
      categoryNameMm: categoryMap[prodCategory].mm,
      durationEn: prodDuration.trim() || '1 Month',
      durationMm: prodDuration.trim() || '၁ လ',
      priceMmk: Math.round(price),
      originalPriceMmk: parsedOriginal !== null ? Math.round(parsedOriginal) : null,
      imageUrl: prodImageUrl.trim() || null,
      deliveryFormat: prodCategory,
      isActive: true,
    });

    setProdName('');
    setProdPrice('');
    setProdOriginalPrice('');
    setProdDuration('');
    setProdImageUrl('');
    setProdImageInfo(null);
    setProdDesc('');
    setShowAddProduct(false);
  }

  async function handlePreviewProductImageUpload(
    file: File | null | undefined,
    target: 'create' | 'edit'
  ) {
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      const msg = 'Please select a JPG, PNG, or WEBP image file.';
      if (target === 'create') setProdError(msg);
      else setEditError(msg);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const msg = 'Image file must be 5 MB or smaller.';
      if (target === 'create') setProdError(msg);
      else setEditError(msg);
      return;
    }

    if (target === 'create') {
      setProdImageUploading(true);
      setProdError(null);
    } else {
      setEditImageUploading(true);
      setEditError(null);
    }

    try {
      const compressed = await compressPreviewImage(file, {
        maxDimension: 1200,
        quality: 0.85,
      });
      const kb = Math.max(1, Math.round(compressed.compressedBytes / 1024));
      if (target === 'create') {
        setProdImageUrl(compressed.dataUrl);
        setProdImageInfo(`${compressed.filename} · ${kb} KB`);
      } else {
        setEditImageUrl(compressed.dataUrl);
      }
    } catch {
      const msg = 'Could not read the selected image file.';
      if (target === 'create') setProdError(msg);
      else setEditError(msg);
    } finally {
      if (target === 'create') setProdImageUploading(false);
      else setEditImageUploading(false);
    }
  }

  function openEditProductModal(p: PreviewProduct) {
    setEditingProduct(p);
    setEditTitle(p.titleEn);
    setEditPrice(String(p.priceMmk));
    setEditOriginalPrice(p.originalPriceMmk ? String(p.originalPriceMmk) : '');
    setEditDuration(p.durationEn);
    setEditImageUrl(p.imageUrl ?? '');
    setEditError(null);
  }

  function handleSaveProductEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError(null);

    const parsedPrice = Number(editPrice);
    if (!editTitle.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setEditError('Enter a valid product title and selling price.');
      return;
    }

    const parsedOrig = editOriginalPrice.trim() ? Number(editOriginalPrice.trim()) : null;
    if (parsedOrig !== null && (!Number.isFinite(parsedOrig) || parsedOrig <= parsedPrice)) {
      setEditError('Original Price must be higher than the selling price.');
      return;
    }

    onUpdateProduct(editingProduct.id, {
      titleEn: editTitle.trim(),
      priceMmk: Math.round(parsedPrice),
      originalPriceMmk: parsedOrig !== null ? Math.round(parsedOrig) : null,
      durationEn: editDuration.trim() || editingProduct.durationEn,
      imageUrl: editImageUrl.trim() || null,
    });

    setEditingProduct(null);
  }

  function handleCreatePromo(e: React.FormEvent) {
    e.preventDefault();
    setPromoNotice(null);
    setPromoError(null);

    const normalizedCode = promoCodeInput.trim().toUpperCase();
    const val = Number(promoDiscountValue);
    const maxUses = promoMaxUses.trim() ? Number(promoMaxUses.trim()) : null;

    if (!normalizedCode || normalizedCode.length < 3) {
      setPromoError('Coupon code must be at least 3 characters.');
      return;
    }
    if (!Number.isFinite(val) || val <= 0) {
      setPromoError('Discount value must be greater than 0.');
      return;
    }
    if (promoDiscountType === 'PERCENTAGE' && val > 95) {
      setPromoError('Percentage discount cannot exceed 95%.');
      return;
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      setPromoError('Max uses must be a positive integer or left empty.');
      return;
    }

    const res = onCreatePromoCode({
      code: normalizedCode,
      discountType: promoDiscountType,
      discountValue: Math.round(val),
      maxUses,
      expiresAt: promoExpiresAt ? new Date(`${promoExpiresAt}T23:59:59`).toISOString() : null,
      isActive: true,
    });

    if (!res.ok) {
      setPromoError(res.error || 'Could not create promo code.');
      return;
    }

    setPromoNotice(`Promo code ${normalizedCode} created and ready for checkout.`);
    setPromoCodeInput('');
  }

  function handleBulkUpload(e: React.FormEvent) {
    e.preventDefault();
    const lines = stockText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!stockProdId || lines.length === 0) return;
    const result = onBulkUploadStock(stockProdId, lines);
    setStockNotice(
      `AES-256 encrypted & saved ${result.inserted} item(s) (${result.skipped} duplicate(s) skipped).`
    );
    setStockText('');
  }

  function handleSendBroadcastSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBroadcastError(null);
    setBroadcastResult(null);

    if (broadcastMessage.trim().length < 5) {
      setBroadcastError('Broadcast message must be at least 5 characters.');
      return;
    }

    const res = onSendBroadcast({
      message: broadcastMessage.trim(),
      photoUrl: broadcastPhotoUrl.trim() || undefined,
      promoCode: broadcastPromoCode || undefined,
    });
    setBroadcastResult(res);
  }

  function handleExportSalesCsv() {
    const filtered = csvMonth
      ? orders.filter((o) => o.createdAt.slice(0, 7) === csvMonth)
      : orders;

    const escapeCsv = (val: string | number | null | undefined) => {
      const str = val == null ? '' : String(val);
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };

    const headers = [
      'Order Number',
      'Created At',
      'Status',
      'Product',
      'Quantity',
      'Subtotal (MMK)',
      'Discount (MMK)',
      'Promo Code',
      'Total (MMK)',
      'Payment Provider',
      'Tx Last 6',
      'Customer',
      'Mode',
      'Reviewed By',
    ];

    const rows = filtered.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.status,
      o.items && o.items.length > 1
        ? o.items.map((i) => `${i.productTitleEn} x${i.quantity}`).join(' | ')
        : o.productTitleEn,
      o.quantity,
      o.subtotalMmk,
      o.discountMmk,
      o.promoCode ?? '',
      o.totalMmk,
      o.paymentProvider,
      o.transactionLast6,
      o.customerLabel,
      o.customerMode,
      o.reviewedBy ?? '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mmkeyhub-sales-${csvMonth || 'all'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md py-10">
        <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 sm:p-8">
          <div className="flex items-center gap-2 text-emerald-400">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              MMKeyHub Admin Console
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">
            Admin Authentication Required
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            Restricted standalone console. Enter your{' '}
            <code className="font-mono-tabular text-slate-200">ADMIN_API_KEY</code> to unlock
            (preview key:{' '}
            <code className="font-mono-tabular text-emerald-300">{DEMO_ADMIN_KEY}</code>).
          </p>

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="preview-admin-key" className="block text-xs font-medium text-slate-300">
                Admin API Key
              </label>
              <input
                id="preview-admin-key"
                type="password"
                autoComplete="current-password"
                placeholder="Paste ADMIN_API_KEY"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="font-mono-tabular mt-1.5 w-full min-h-[44px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            {authError && <p className="text-xs text-rose-400">{authError}</p>}
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              Unlock Admin Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header + Quick Shop Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Admin Operations Dashboard</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Changes here sync live with Catalog, Checkout, and Telegram Bot Simulator.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              onUpdateMerchantSettings({
                ...merchantSettings,
                isShopOpen: !merchantSettings.isShopOpen,
              })
            }
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
              merchantSettings.isShopOpen
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                merchantSettings.isShopOpen ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {!merchantSettings.isShopOpen && (
              <Moon className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            )}
            <span>
              {merchantSettings.isShopOpen
                ? 'Online (5-min delivery)'
                : 'Night Mode (Delayed delivery)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0B0F17] px-3 text-xs font-medium text-slate-400 hover:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Total Revenue (Approved)</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-emerald-400">
            {totalRevenueMmk.toLocaleString('en-US')} MMK
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Pending Orders</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-amber-400">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Approved Orders</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-50">
            {approvedCount}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Low Stock Alerts (&lt; 5)</p>
          <p
            className={`font-mono-tabular mt-2 text-2xl font-semibold ${
              lowStockProducts.length > 0 ? 'text-rose-400' : 'text-slate-50'
            }`}
          >
            {lowStockProducts.length}
          </p>
        </div>
      </div>

      {/* 4 Clean Admin Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-[#121826] p-1.5"
      >
        {(
          [
            {
              id: 'orders' as AdminTab,
              label: `1. Orders & SMS Ledger (${orders.length})`,
              icon: ShoppingBag,
            },
            {
              id: 'products' as AdminTab,
              label: `2. Products & Stock (${products.length})`,
              icon: Package,
            },
            {
              id: 'promos' as AdminTab,
              label: `3. Promos & Broadcast (${promoCodes.length})`,
              icon: Megaphone,
            },
            {
              id: 'settings' as AdminTab,
              label: '4. Merchant & Shop Settings',
              icon: Settings,
            },
          ] as const
        ).map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:bg-[#182133] hover:text-white'
              }`}
            >
              <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ORDERS & SMS LEDGER */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Orders Search, Status Filter, Pagination & CSV Export */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-50">Orders Management</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Search by order number, transaction ID, or customer contact.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={csvMonth}
                  onChange={(e) => setCsvMonth(e.target.value)}
                  aria-label="Filter CSV export by month"
                  className="font-mono-tabular min-h-[36px] rounded-lg border border-white/[0.12] bg-[#0B0F17] px-2.5 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleExportSalesCsv}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#182133] px-3 text-xs font-semibold text-slate-100 hover:border-emerald-500/50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Export Sales CSV</span>
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-12">
              <div className="relative sm:col-span-7">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search Order #, Tx ID, or Customer..."
                  className="min-h-[40px] w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-5">
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value as OrderStatusFilter)}
                  aria-label="Filter orders by status"
                  className="min-h-[40px] w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">Status: ALL ({orders.length})</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL ({pendingCount})</option>
                  <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
                  <option value="AUTO_VERIFIED">AUTO_VERIFIED</option>
                  <option value="APPROVED">APPROVED ({approvedCount})</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="pb-2.5 pr-4">Order #</th>
                    <th className="pb-2.5 pr-4">Customer</th>
                    <th className="pb-2.5 pr-4">Product</th>
                    <th className="pb-2.5 pr-4">Amount</th>
                    <th className="pb-2.5 pr-4">Payment</th>
                    <th className="pb-2.5 pr-4">Status</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No orders match your current search/filter criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((ord) => (
                      <tr key={ord.id} className="text-slate-200">
                        <td className="font-mono-tabular py-3 pr-4 font-semibold">
                          {ord.orderNumber}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">{ord.customerLabel}</td>
                        <td className="py-3 pr-4">
                          {ord.items && ord.items.length > 1
                            ? ord.items.map((i) => `${i.productTitleEn} × ${i.quantity}`).join(', ')
                            : `${ord.productTitleEn} × ${ord.quantity}`}
                        </td>
                        <td className="font-mono-tabular py-3 pr-4 font-semibold">
                          <div>{ord.totalMmk.toLocaleString('en-US')} MMK</div>
                          {ord.discountMmk > 0 && (
                            <div className="text-[11px] font-normal text-amber-400">
                              -{ord.discountMmk.toLocaleString('en-US')} ({ord.promoCode ?? 'Promo'})
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div>
                            {ord.paymentProvider}
                            {ord.transactionLast6 ? ` · #${ord.transactionLast6}` : ''}
                          </div>
                          {ord.isDuplicateTxWarning && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>
                                DUPLICATE TX ID
                                {ord.duplicateTxOrderNumber ? ` (${ord.duplicateTxOrderNumber})` : ''}
                              </span>
                            </div>
                          )}
                          {ord.isSimilarSlipWarning && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>
                                ⚠️ SIMILAR SLIP DETECTED
                                {ord.similarSlipOrderNumber ? ` (${ord.similarSlipOrderNumber})` : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td
                          className={`py-3 pr-4 font-semibold ${
                            ord.status === 'APPROVED'
                              ? 'text-emerald-400'
                              : ord.status === 'REJECTED'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                          }`}
                        >
                          <div>{ord.status}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-slate-400">
                            {ord.verificationMode}
                            {ord.ocrConfidenceScore != null
                              ? ` · OCR ${Math.round(ord.ocrConfidenceScore * 100)}%`
                              : ''}
                          </div>
                          {ord.ocrTamperingFlags && ord.ocrTamperingFlags.length > 0 && (
                            <div className="mt-0.5 text-[11px] font-semibold text-rose-400">
                              ⚠️ {ord.ocrTamperingFlags[0]}
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {ord.receiptDataUrl && (
                              <button
                                type="button"
                                onClick={() => setReceiptPreviewOrder(ord)}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#182133] px-2.5 py-1 text-slate-200 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Receipt</span>
                              </button>
                            )}
                            {ord.status === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onApproveOrder(ord.id, 'Web Admin')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 font-semibold text-slate-950 cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRejectOrder(
                                      ord.id,
                                      'Payment could not be verified by Web Admin.',
                                      'Web Admin'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-300 cursor-pointer"
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-xs text-slate-400">
              <span className="font-mono-tabular">
                Showing {paginatedOrders.length} of {filteredOrders.length} order(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={orderPage <= 1}
                  onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Previous</span>
                </button>
                <span className="font-mono-tabular text-slate-300">
                  Page {orderPage} of {totalOrderPages}
                </span>
                <button
                  type="button"
                  disabled={orderPage >= totalOrderPages}
                  onClick={() => setOrderPage((p) => Math.min(totalOrderPages, p + 1))}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Incoming Bank SMS Ledger with 1-Click Link & Unlock */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-50">
                    Incoming KPay / WavePay SMS Ledger (24/7 Auto-Match)
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Real-time payment webhooks & 1-click manual linking for unmatched SMS alerts.
                </p>
              </div>
              {latestPendingOrder && (
                <button
                  type="button"
                  onClick={() => {
                    const txId =
                      latestPendingOrder.ocrExtractedTxId ||
                      `010099${latestPendingOrder.transactionLast6 || '551199'}`;
                    const raw =
                      latestPendingOrder.paymentProvider === 'KPAY'
                        ? `KBZPay: Received ${latestPendingOrder.totalMmk.toLocaleString('en-US')}.00 MMK from ${latestPendingOrder.customerLabel.split(' ')[0]}. Trans ID: ${txId}.`
                        : `WavePay: You received ${latestPendingOrder.totalMmk.toLocaleString('en-US')} MMK from 0977112233. Ref ID: ${txId}.`;
                    const res = onSimulateIncomingSms({
                      rawMessage: raw,
                      provider: latestPendingOrder.paymentProvider,
                      transactionId: txId,
                      amountMmk: latestPendingOrder.totalMmk,
                      senderInfo: latestPendingOrder.customerLabel,
                    });
                    setAdminSmsNotice(
                      res.matchedOrderNumber
                        ? `Matched & auto-unlocked ${res.matchedOrderNumber}!`
                        : `Saved SMS #${txId} to ledger.`
                    );
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Push Matching SMS for {latestPendingOrder.orderNumber}</span>
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adminSmsInput.trim()) return;
                const res = onSimulateIncomingSms({ rawMessage: adminSmsInput.trim() });
                setAdminSmsNotice(
                  res.matchedOrderNumber
                    ? `Auto-matched & unlocked ${res.matchedOrderNumber}!`
                    : `Recorded ${res.sms.provider} SMS #${res.sms.transactionId} (${res.sms.amountMmk.toLocaleString('en-US')} MMK).`
                );
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="text"
                value={adminSmsInput}
                onChange={(e) => setAdminSmsInput(e.target.value)}
                placeholder="KBZPay: Received 25,000.00 MMK from Kyaw Zin. Trans ID: 010099..."
                className="font-mono-tabular min-h-[40px] flex-1 rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[40px] shrink-0 rounded-xl border border-emerald-500/40 bg-[#182133] px-4 text-xs font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 cursor-pointer"
              >
                Simulate SMS Webhook
              </button>
            </form>

            {adminSmsNotice && <p className="text-xs text-emerald-400">{adminSmsNotice}</p>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="pb-2.5 pr-4">Provider</th>
                    <th className="pb-2.5 pr-4">Transaction ID</th>
                    <th className="pb-2.5 pr-4">Amount</th>
                    <th className="pb-2.5 pr-4">Sender</th>
                    <th className="pb-2.5 pr-4">Match / 1-Click Link</th>
                    <th className="pb-2.5 text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {incomingSmsList.map((sms) => {
                    const chosenOrderId =
                      linkOrderSelections[sms.id] || pendingOrders[0]?.id || '';
                    return (
                      <tr key={sms.id} className="text-slate-200">
                        <td className="py-2.5 pr-4 font-semibold">{sms.provider}</td>
                        <td className="font-mono-tabular py-2.5 pr-4 text-slate-100">
                          {sms.transactionId}
                        </td>
                        <td className="font-mono-tabular py-2.5 pr-4 font-semibold text-emerald-400">
                          {sms.amountMmk.toLocaleString('en-US')} MMK
                        </td>
                        <td className="py-2.5 pr-4 text-slate-300">{sms.senderInfo}</td>
                        <td className="py-2.5 pr-4">
                          {sms.isMatched ? (
                            <span className="font-mono-tabular font-semibold text-emerald-400">
                              MATCHED · {sms.matchedOrderNumber}
                            </span>
                          ) : pendingOrders.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={chosenOrderId}
                                onChange={(e) =>
                                  setLinkOrderSelections((prev) => ({
                                    ...prev,
                                    [sms.id]: e.target.value,
                                  }))
                                }
                                aria-label={`Select pending order for SMS ${sms.transactionId}`}
                                className="font-mono-tabular min-h-[30px] max-w-[200px] rounded-lg border border-white/[0.12] bg-[#0B0F17] px-2 text-[11px] text-slate-100"
                              >
                                {pendingOrders.map((po) => (
                                  <option key={po.id} value={po.id}>
                                    {po.orderNumber} ({po.totalMmk.toLocaleString('en-US')} MMK)
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!chosenOrderId) return;
                                  const res = onLinkSmsToOrder(sms.id, chosenOrderId);
                                  if (res.ok) {
                                    setAdminSmsNotice(
                                      `Linked SMS #${sms.transactionId} & unlocked keys for ${res.orderNumber}!`
                                    );
                                  } else {
                                    setAdminSmsNotice(res.error ?? 'Could not link SMS to order.');
                                  }
                                }}
                                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-emerald-500 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                              >
                                <Link2 className="h-3 w-3" aria-hidden="true" />
                                <span>Link &amp; Unlock</span>
                              </button>
                            </div>
                          ) : (
                            <span className="font-medium text-amber-300">
                              UNMATCHED (No pending orders)
                            </span>
                          )}
                        </td>
                        <td className="font-mono-tabular py-2.5 text-right text-slate-400">
                          {new Date(sms.receivedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS & STOCK */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Low Stock Banner */}
          {lowStockProducts.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Low Stock Alert: {lowStockProducts.length} product(s) below 5 keys</span>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {lowStockProducts.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0B0F17]/80 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-100">{item.titleEn}</p>
                      <p className="font-mono-tabular text-xs text-amber-300">
                        Left: {item.availableKeys.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStockProdId(item.id);
                        setStockNotice(null);
                        setShowStockModal(true);
                      }}
                      className="shrink-0 rounded-lg bg-[#182133] px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 cursor-pointer"
                    >
                      Restock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-50">Catalog &amp; Encrypted Inventory</h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddProduct((prev) => !prev)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/[0.12] bg-[#121826] px-3.5 text-xs font-semibold text-slate-100 hover:border-emerald-500/50 cursor-pointer"
              >
                <PackagePlus className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>{showAddProduct ? 'Hide Add Product' : 'Add Product'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStockNotice(null);
                  setStockProdId((prev) => prev || products[0]?.id || '');
                  setShowStockModal(true);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Bulk Upload Stock</span>
              </button>
            </div>
          </div>

          {/* Add New Product Form */}
          {showAddProduct && (
            <form
              onSubmit={handleCreateProduct}
              className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-semibold text-slate-50">Add New Product</h3>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div>
                <label className="block text-xs text-slate-300">Product Name</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="e.g. NordVPN 1 Year Account"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Category</label>
                <select
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value as DeliveryFormat)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                >
                  <option value="LICENSE_KEY">LICENSE_KEY</option>
                  <option value="ACCOUNT_LOGIN">ACCOUNT</option>
                  <option value="VPN_CONFIG">VPN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300">Selling Price (MMK)</label>
                <input
                  type="number"
                  required
                  min={100}
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="15000"
                  className="font-mono-tabular mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">
                  Original Price — Flash Sale Strikethrough (Optional)
                </label>
                <input
                  type="number"
                  min={100}
                  value={prodOriginalPrice}
                  onChange={(e) => setProdOriginalPrice(e.target.value)}
                  placeholder="e.g. 22000"
                  className="font-mono-tabular mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Duration</label>
                <input
                  type="text"
                  value={prodDuration}
                  onChange={(e) => setProdDuration(e.target.value)}
                  placeholder="1 Month"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-xs text-slate-300">
                  Product Cover Image (Upload JPG/PNG/WEBP or paste URL)
                </label>
                <div className="grid gap-3 sm:grid-cols-12 items-start">
                  <div className="sm:col-span-5">
                    <label className="flex min-h-[116px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.16] bg-[#0B0F17] p-3 text-center transition-colors hover:border-emerald-500/50">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={prodImageUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          void handlePreviewProductImageUpload(f, 'create');
                        }}
                        className="sr-only"
                      />
                      {prodImageUploading ? (
                        <>
                          <Loader2
                            className="h-5 w-5 animate-spin text-emerald-400"
                            aria-hidden="true"
                          />
                          <span className="text-xs text-emerald-300">Processing image...</span>
                        </>
                      ) : prodImageUrl ? (
                        <div className="w-full">
                          <img
                            src={prodImageUrl}
                            alt="Product cover preview"
                            referrerPolicy="no-referrer"
                            className="h-20 w-full rounded-lg border border-white/[0.1] object-cover"
                          />
                          <span className="mt-1.5 block text-[11px] font-medium text-emerald-300">
                            Click to change image
                          </span>
                        </div>
                      ) : (
                        <>
                          <ImagePlus className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                          <span className="text-xs font-medium text-slate-200">
                            Upload Product Image
                          </span>
                          <span className="text-[11px] text-slate-400">
                            JPG, PNG, WEBP (Max 5MB)
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="sm:col-span-7 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={prodImageUrl.startsWith('data:image/') ? '' : prodImageUrl}
                        onChange={(e) => {
                          setProdImageUrl(e.target.value);
                          setProdImageInfo(null);
                        }}
                        placeholder={
                          prodImageUrl.startsWith('data:image/')
                            ? 'Uploaded image attached (ready to save)'
                            : 'Or paste https://example.com/product-cover.jpg'
                        }
                        className="w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                      {prodImageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdImageUrl('');
                            setProdImageInfo(null);
                          }}
                          aria-label="Remove uploaded image"
                          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {prodImageInfo
                        ? `Uploaded: ${prodImageInfo}`
                        : 'Uploaded product cover appears immediately on the storefront catalog.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300">Description</label>
                <textarea
                  rows={2}
                  required
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Product highlights and supported platforms..."
                  className="mt-1 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-sm text-slate-100"
                />
              </div>
              {prodError && <p className="sm:col-span-2 text-xs text-rose-400">{prodError}</p>}
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Create Product</span>
                </button>
              </div>
            </form>
          )}

          {/* Inventory Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="pb-2.5 pr-4">Product</th>
                    <th className="pb-2.5 pr-4">Price</th>
                    <th className="pb-2.5 pr-4">Available</th>
                    <th className="pb-2.5 pr-4">Reserved</th>
                    <th className="pb-2.5 pr-4">Sold</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {products.map((p) => {
                    const discountPct =
                      p.originalPriceMmk && p.originalPriceMmk > p.priceMmk
                        ? Math.round(
                            ((p.originalPriceMmk - p.priceMmk) / p.originalPriceMmk) * 100
                          )
                        : 0;
                    return (
                      <tr key={p.id} className="text-slate-200">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-9 w-12 shrink-0 rounded-lg border border-white/[0.1] object-cover bg-[#0B0F17]"
                              />
                            ) : (
                              <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0B0F17] text-slate-400">
                                <KeyRound className="h-4 w-4" aria-hidden="true" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-slate-50">{p.titleEn}</p>
                              <p className="text-[11px] text-slate-400">{p.durationEn}</p>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono-tabular py-3 pr-4">
                          <span>{p.priceMmk.toLocaleString('en-US')} MMK</span>
                          {discountPct > 0 && p.originalPriceMmk && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-500 line-through">
                                {p.originalPriceMmk.toLocaleString('en-US')}
                              </span>
                              <span className="font-semibold text-amber-400">
                                {discountPct}% OFF
                              </span>
                            </div>
                          )}
                        </td>
                        <td
                          className={`font-mono-tabular py-3 pr-4 font-semibold ${
                            p.availableKeys.length < 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {p.availableKeys.length}
                        </td>
                        <td className="font-mono-tabular py-3 pr-4 text-slate-400">
                          {p.reservedCount}
                        </td>
                        <td className="font-mono-tabular py-3 pr-4 text-slate-400">{p.soldCount}</td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditProductModal(p)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1 text-slate-200 hover:border-emerald-500/50 hover:text-white cursor-pointer"
                            >
                              <Edit3 className="h-3 w-3" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleProductActive(p.id)}
                              className="rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1 text-slate-300 hover:text-white cursor-pointer"
                            >
                              {p.isActive ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStockProdId(p.id);
                                setStockNotice(null);
                                setShowStockModal(true);
                              }}
                              className="rounded-lg border border-white/[0.12] bg-[#182133] px-2.5 py-1 font-medium text-slate-100 hover:border-emerald-500/50 cursor-pointer"
                            >
                              Upload Keys
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROMOS & BROADCAST */}
      {activeTab === 'promos' && (
        <div className="space-y-6">
          {/* Promo Codes Management */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-5">
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
              <Tag className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-50">
                Promo Codes &amp; Discount Coupons
              </h3>
            </div>

            <form onSubmit={handleCreatePromo} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label className="block text-xs text-slate-300">Code</label>
                <input
                  type="text"
                  required
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  placeholder="KYAT15"
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Discount Type</label>
                <select
                  value={promoDiscountType}
                  onChange={(e) => setPromoDiscountType(e.target.value as DiscountType)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                >
                  <option value="PERCENTAGE">PERCENTAGE (%)</option>
                  <option value="FIXED_MMK">FIXED_MMK (MMK)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300">
                  {promoDiscountType === 'PERCENTAGE' ? 'Percent (%)' : 'Amount (MMK)'}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={promoDiscountType === 'PERCENTAGE' ? 95 : undefined}
                  value={promoDiscountValue}
                  onChange={(e) => setPromoDiscountValue(e.target.value)}
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Max Uses (Optional)</label>
                <input
                  type="number"
                  min={1}
                  value={promoMaxUses}
                  onChange={(e) => setPromoMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Expires On (Optional)</label>
                <input
                  type="date"
                  value={promoExpiresAt}
                  onChange={(e) => setPromoExpiresAt(e.target.value)}
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Create Coupon</span>
                </button>
              </div>
            </form>

            {promoError && <p className="text-xs text-rose-400">{promoError}</p>}
            {promoNotice && <p className="text-xs text-emerald-400">{promoNotice}</p>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="pb-2 pr-4">Code</th>
                    <th className="pb-2 pr-4">Discount</th>
                    <th className="pb-2 pr-4">Usage</th>
                    <th className="pb-2 pr-4">Expires</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {promoCodes.map((promo) => (
                    <tr key={promo.id} className="text-slate-200">
                      <td className="font-mono-tabular py-2.5 pr-4 font-semibold text-amber-300">
                        {promo.code}
                      </td>
                      <td className="font-mono-tabular py-2.5 pr-4">
                        {promo.discountType === 'PERCENTAGE'
                          ? `${promo.discountValue}% OFF`
                          : `${promo.discountValue.toLocaleString('en-US')} MMK OFF`}
                      </td>
                      <td className="font-mono-tabular py-2.5 pr-4">
                        {promo.usedCount} / {promo.maxUses ?? '∞'}
                      </td>
                      <td className="font-mono-tabular py-2.5 pr-4 text-slate-400">
                        {promo.expiresAt ? promo.expiresAt.slice(0, 10) : 'No expiry'}
                      </td>
                      <td
                        className={`py-2.5 pr-4 font-semibold ${
                          promo.isActive ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {promo.isActive ? 'ACTIVE' : 'PAUSED'}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onTogglePromoActive(promo.id)}
                          className="rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1 text-slate-200 hover:text-white cursor-pointer"
                        >
                          {promo.isActive ? 'Pause' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Telegram Marketing Broadcast & Expiry Reminder Sweep */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-50">
                    Telegram Marketing Broadcast
                  </h3>
                </div>
                <p className="font-mono-tabular mt-1 text-xs text-slate-400">
                  Active Subscribers: {activeSubscribersCount} · Blocked: {blockedSubscribersCount}{' '}
                  · Rate-limited 25 msgs/batch
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const sent = onRunExpiryReminderSweep();
                  setReminderNotice(
                    sent > 0
                      ? `Sent ${sent} automated 48-hour renewal reminder DM(s) to Telegram Bot.`
                      : 'No approved orders within 48h expiry window pending reminder.'
                  );
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Run 48h Expiry Reminders</span>
              </button>
            </div>

            {reminderNotice && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                {reminderNotice}
              </p>
            )}

            <form onSubmit={handleSendBroadcastSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300">
                  Announcement Message (EN / မြန်မာ)
                </label>
                <textarea
                  rows={3}
                  required
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300">
                  Optional Promo Banner Image URL (HTTPS)
                </label>
                <input
                  type="url"
                  value={broadcastPhotoUrl}
                  onChange={(e) => setBroadcastPhotoUrl(e.target.value)}
                  placeholder="https://example.com/flash-sale.jpg"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300">
                  Attach Promo Code CTA Button (Optional)
                </label>
                <select
                  value={broadcastPromoCode}
                  onChange={(e) => setBroadcastPromoCode(e.target.value)}
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                >
                  <option value="">No Promo Code Button</option>
                  {promoCodes
                    .filter((p) => p.isActive)
                    .map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.code} (
                        {p.discountType === 'PERCENTAGE'
                          ? `${p.discountValue}% OFF`
                          : `${p.discountValue.toLocaleString('en-US')} MMK OFF`}
                        )
                      </option>
                    ))}
                </select>
              </div>

              {broadcastError && (
                <p className="sm:col-span-2 text-xs text-rose-400">{broadcastError}</p>
              )}

              {broadcastResult && (
                <div className="sm:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <span className="font-semibold">Broadcast delivered to Bot DM Simulator:</span>{' '}
                  <span className="font-mono-tabular">
                    {broadcastResult.sentCount} / {broadcastResult.totalTargets} sent ·{' '}
                    {broadcastResult.blockedCount} blocked · {broadcastResult.failedCount} failed
                  </span>
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-sky-500 px-4 text-xs font-semibold text-slate-950 hover:bg-sky-400 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Send Broadcast to {activeSubscribersCount} Subscribers</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: MERCHANT & SHOP SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Daily Sales & Auto-Verify Summary Scheduler Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-50">
                    Daily Sales &amp; Auto-Verify Summary (23:59 MMT)
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Automatically sends daily revenue, AI + SMS auto-verify rate, and low stock report
                  to Admin Group.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDailyReport(onSendDailySummary())}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Send Daily Summary Now</span>
              </button>
            </div>

            {dailyReport && (
              <div className="grid gap-3 rounded-xl border border-emerald-500/25 bg-[#0B0F17] p-4 sm:grid-cols-2 lg:grid-cols-5 text-xs">
                <div>
                  <p className="text-slate-400">Report Date (MMT)</p>
                  <p className="font-mono-tabular mt-1 font-semibold text-slate-100">
                    {dailyReport.dateKey}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Revenue Today</p>
                  <p className="font-mono-tabular mt-1 font-semibold text-emerald-400">
                    {dailyReport.totalRevenueMmk.toLocaleString('en-US')} MMK
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Approved Orders</p>
                  <p className="font-mono-tabular mt-1 font-semibold text-slate-100">
                    {dailyReport.approvedOrdersCount} ({dailyReport.autoVerifiedCount} auto)
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Auto-Verify Rate</p>
                  <p className="font-mono-tabular mt-1 font-semibold text-emerald-400">
                    {dailyReport.autoVerifyRatePct}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Queue &amp; Telegram</p>
                  <p className="font-mono-tabular mt-1 font-semibold text-amber-300">
                    {dailyReport.pendingOrdersCount} pending · {dailyReport.lowStockCount} low ·{' '}
                    {dailyReport.telegramDelivered ? 'Sent' : 'Skipped'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Shop Operating Status & Night Mode Banner */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-50">
                  Shop Operating Status &amp; Night Mode Notice
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Toggle Night Mode to display a delayed-approval banner inside Checkout.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateMerchantSettings({
                    ...merchantSettings,
                    isShopOpen: !merchantSettings.isShopOpen,
                  })
                }
                className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold cursor-pointer ${
                  merchantSettings.isShopOpen
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                {!merchantSettings.isShopOpen && (
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {merchantSettings.isShopOpen ? 'Online (Auto + 5-min)' : 'Night Mode Active'}
                </span>
              </button>
            </div>

            <div>
              <label
                htmlFor="preview-offline-notice"
                className="block text-xs font-medium text-slate-300"
              >
                Night Mode Banner Message (EN)
              </label>
              <input
                id="preview-offline-notice"
                type="text"
                value={merchantSettings.offlineNoticeEn}
                onChange={(e) =>
                  onUpdateMerchantSettings({
                    ...merchantSettings,
                    offlineNoticeEn: e.target.value,
                  })
                }
                className="mt-1.5 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Storefront Branding, Flash Sale Timer & Hero Banner Slides */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-50">
                    Storefront Logo, Flash Sale Timer &amp; Hero Slides
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Changes sync instantaneously with the live Storefront Header and Hero Slider.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateMerchantSettings({
                    ...merchantSettings,
                    heroSlides: INITIAL_HERO_SLIDES,
                  })
                }
                className="min-h-[34px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Reset Default Slides
              </button>
            </div>

            {/* Brand Logo */}
            <div className="grid gap-4 rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 sm:grid-cols-12 sm:items-center">
              <div className="sm:col-span-8 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-300">
                    Custom Brand Logo URL or Upload Image
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline cursor-pointer">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Upload Logo</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void compressPreviewImage(file, {
                            maxDimension: 256,
                            quality: 0.9,
                            skipUnderBytes: 25 * 1024,
                          }).then((res) =>
                            onUpdateMerchantSettings({
                              ...merchantSettings,
                              brandLogoUrl: res.dataUrl,
                            })
                          );
                        }}
                      />
                    </label>
                    {merchantSettings.brandLogoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMerchantSettings({ ...merchantSettings, brandLogoUrl: null })
                        }
                        className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        Clear Logo
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={
                    merchantSettings.brandLogoUrl?.startsWith('data:image/')
                      ? ''
                      : merchantSettings.brandLogoUrl ?? ''
                  }
                  onChange={(e) =>
                    onUpdateMerchantSettings({
                      ...merchantSettings,
                      brandLogoUrl: e.target.value.trim() || null,
                    })
                  }
                  placeholder={
                    merchantSettings.brandLogoUrl?.startsWith('data:image/')
                      ? 'Uploaded image active (click Clear Logo to remove)'
                      : 'https://your-domain.com/logo.png (optional)'
                  }
                  className="w-full min-h-[38px] rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                />
              </div>
              <div className="sm:col-span-4 flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#121826] p-3">
                <span className="text-[11px] text-slate-400">Header Wordmark</span>
                <div className="mt-1.5 flex items-center gap-2">
                  {merchantSettings.brandLogoUrl ? (
                    <img
                      src={merchantSettings.brandLogoUrl}
                      alt="Brand logo"
                      className="h-8 w-8 rounded-lg object-contain"
                    />
                  ) : (
                    <img
                      src="/assets/aistudio/image_dd126173.png"
                      alt="MMKeyHub"
                      className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/15"
                    />
                  )}
                  <span className="text-sm font-semibold text-slate-100">MMKeyHub</span>
                </div>
              </div>
            </div>

            {/* Flash Sale Countdown Settings */}
            <div className="rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Flash Sale Countdown Timer</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateMerchantSettings({
                        ...merchantSettings,
                        flashSaleEndsAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                      })
                    }
                    className="text-emerald-400 hover:underline cursor-pointer"
                  >
                    +6 Hours
                  </button>
                  {merchantSettings.flashSaleEndsAt && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateMerchantSettings({ ...merchantSettings, flashSaleEndsAt: null })
                      }
                      className="text-slate-400 hover:text-rose-300 cursor-pointer"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] text-slate-400">Banner Label (EN)</label>
                  <input
                    type="text"
                    value={merchantSettings.flashSaleLabelEn ?? ''}
                    onChange={(e) =>
                      onUpdateMerchantSettings({
                        ...merchantSettings,
                        flashSaleLabelEn: e.target.value,
                      })
                    }
                    className="mt-1 w-full min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">Banner Label (MM)</label>
                  <input
                    type="text"
                    value={merchantSettings.flashSaleLabelMm ?? ''}
                    onChange={(e) =>
                      onUpdateMerchantSettings({
                        ...merchantSettings,
                        flashSaleLabelMm: e.target.value,
                      })
                    }
                    className="mt-1 w-full min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Slide Quick Editors */}
            <div className="space-y-2.5">
              {merchantSettings.heroSlides.map((slide, idx) => (
                <div
                  key={slide.id}
                  className="rounded-xl border border-white/[0.08] bg-[#0B0F17] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono-tabular font-semibold text-emerald-400">
                      Slide #{idx + 1} ({slide.targetCategory})
                    </span>
                    {merchantSettings.heroSlides.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMerchantSettings({
                            ...merchantSettings,
                            heroSlides: merchantSettings.heroSlides.filter((_, i) => i !== idx),
                          })
                        }
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      value={slide.titleEn}
                      onChange={(e) =>
                        onUpdateMerchantSettings({
                          ...merchantSettings,
                          heroSlides: merchantSettings.heroSlides.map((s, i) =>
                            i === idx ? { ...s, titleEn: e.target.value } : s
                          ),
                        })
                      }
                      aria-label={`Slide ${idx + 1} English title`}
                      className="w-full min-h-[36px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                    />
                    <input
                      type="text"
                      value={slide.ctaLabelEn}
                      onChange={(e) =>
                        onUpdateMerchantSettings({
                          ...merchantSettings,
                          heroSlides: merchantSettings.heroSlides.map((s, i) =>
                            i === idx ? { ...s, ctaLabelEn: e.target.value } : s
                          ),
                        })
                      }
                      aria-label={`Slide ${idx + 1} CTA label`}
                      className="w-full min-h-[36px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPay / WavePay Merchant Settings Editor */}
          <form
            onSubmit={handleSavePm}
            className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-semibold text-slate-50">
                KPay &amp; WavePay Merchant Accounts &amp; QR Codes
              </h3>
              <div className="inline-flex gap-1 rounded-lg bg-[#0B0F17] p-1">
                {(['KPAY', 'WAVEPAY'] as PaymentProvider[]).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => handleSwitchPmTab(prov)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold cursor-pointer ${
                      pmTab === prov ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    {prov}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-8 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-300">Account Holder Name</label>
                  <input
                    type="text"
                    required
                    value={pmName}
                    onChange={(e) => setPmName(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300">Account Phone Number</label>
                  <input
                    type="text"
                    required
                    value={pmPhone}
                    onChange={(e) => setPmPhone(e.target.value)}
                    className="font-mono-tabular mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs text-slate-300">
                      Custom QR Image URL or Upload (Auto-generates scannable QR if blank)
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline cursor-pointer">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Upload QR Image</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void compressPreviewImage(file, {
                              maxDimension: 480,
                              quality: 0.85,
                              skipUnderBytes: 40 * 1024,
                            }).then((res) => setPmQrUrl(res.dataUrl));
                          }}
                        />
                      </label>
                      {pmQrUrl && (
                        <button
                          type="button"
                          onClick={() => setPmQrUrl('')}
                          className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          Reset to Auto QR
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={pmQrUrl.startsWith('data:image/') ? '' : pmQrUrl}
                    onChange={(e) => setPmQrUrl(e.target.value)}
                    placeholder={
                      pmQrUrl.startsWith('data:image/')
                        ? 'Custom QR image uploaded (click Reset to clear)'
                        : 'https://your-domain.com/kpay-qr.png'
                    }
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col items-center justify-between rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-slate-400">Live Checkout QR</p>
                  <PreviewQrDisplay
                    provider={pmTab}
                    accountName={pmName || 'MMKeyHub Merchant'}
                    accountPhone={pmPhone || '09777000111'}
                    qrImageUrl={pmQrUrl}
                    size={108}
                    hideSaveButton
                  />
                </div>
                <button
                  type="submit"
                  className="mt-4 min-h-[40px] w-full rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  Save {pmTab} Account
                </button>
              </div>
            </div>
            {pmNotice && <p className="text-xs text-emerald-400">{pmNotice}</p>}
          </form>

          {/* Immutable Security Audit Trail (Read-Only) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-white/[0.08] dark:bg-[#121826]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Immutable Security Audit Trail
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Append-only security ledger tracking approvals, stock encryption uploads, payout edits, and SMS webhook verification.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter preview audit actor type"
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-white/[0.12] dark:bg-[#0B0F17] dark:text-slate-100"
                >
                  <option value="ALL">Actor: ALL</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="WEBHOOK">WEBHOOK</option>
                </select>
                <select
                  aria-label="Filter preview audit action"
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-white/[0.12] dark:bg-[#0B0F17] dark:text-slate-100"
                >
                  <option value="ALL">Action: ALL</option>
                  <option value="ORDER_APPROVED">ORDER_APPROVED</option>
                  <option value="ORDER_REJECTED">ORDER_REJECTED</option>
                  <option value="STOCK_UPLOADED">STOCK_UPLOADED</option>
                  <option value="MERCHANT_SETTINGS_UPDATED">MERCHANT_SETTINGS_UPDATED</option>
                  <option value="PROMO_CREATED">PROMO_CREATED</option>
                  <option value="BROADCAST_SENT">BROADCAST_SENT</option>
                  <option value="WEBHOOK_INGESTED">WEBHOOK_INGESTED</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 font-medium text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                    <th className="pb-2.5 pr-3">Timestamp</th>
                    <th className="pb-2.5 pr-3">Actor &amp; IP</th>
                    <th className="pb-2.5 pr-3">Action</th>
                    <th className="pb-2.5 pr-3">Target</th>
                    <th className="pb-2.5">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                  {auditLogs
                    .filter(
                      (entry) =>
                        (auditActorFilter === 'ALL' || entry.actorType === auditActorFilter) &&
                        (auditActionFilter === 'ALL' || entry.action === auditActionFilter)
                    )
                    .slice(0, 20)
                    .map((entry) => (
                      <tr key={entry.id} className="align-top text-slate-700 dark:text-slate-200">
                        <td className="font-mono-tabular py-2.5 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className="font-semibold">{entry.actorType}</span>
                          <span className="text-slate-500 dark:text-slate-400"> · {entry.actorId}</span>
                          {entry.actorIp && (
                            <div className="font-mono-tabular text-[11px] text-slate-400 dark:text-slate-500">
                              IP: {entry.actorIp}
                            </div>
                          )}
                        </td>
                        <td className="font-mono-tabular py-2.5 pr-3 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">
                          {entry.action}
                        </td>
                        <td className="font-mono-tabular py-2.5 pr-3 whitespace-nowrap">
                          {entry.entityType} · {entry.targetId}
                        </td>
                        <td className="font-mono-tabular py-2.5 text-[11px] text-slate-500 dark:text-slate-400 break-all">
                          {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveProductEdit}
            className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121826] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-semibold text-slate-50">Edit Product</h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300">Product Title (EN)</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Selling Price (MMK)</label>
                <input
                  type="number"
                  required
                  min={100}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">
                  Original Price (Strikethrough)
                </label>
                <input
                  type="number"
                  min={100}
                  value={editOriginalPrice}
                  onChange={(e) => setEditOriginalPrice(e.target.value)}
                  placeholder="Optional"
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300">Duration Tag</label>
                <input
                  type="text"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-xs text-slate-300">
                  Product Cover Image (Upload or URL)
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.12] bg-[#0B0F17]">
                    {editImageUrl ? (
                      <img
                        src={editImageUrl}
                        alt={editTitle || 'Product cover'}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={editImageUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            void handlePreviewProductImageUpload(f, 'edit');
                          }}
                          className="sr-only"
                        />
                        {editImageUploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{editImageUploading ? 'Processing...' : 'Upload Image'}</span>
                      </label>
                      {editImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEditImageUrl('')}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editImageUrl.startsWith('data:image/') ? '' : editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      placeholder={
                        editImageUrl.startsWith('data:image/')
                          ? 'Uploaded image attached'
                          : 'Or paste https://example.com/cover.jpg'
                      }
                      className="w-full min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {editError && <p className="text-xs text-rose-400">{editError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[40px] rounded-xl border border-white/[0.12] px-4 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Stock Modal */}
      {showStockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleBulkUpload}
            className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121826] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-semibold text-slate-50">Bulk Upload Encrypted Stock</h3>
              <button
                type="button"
                onClick={() => setShowStockModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-300">Product</label>
              <select
                value={stockProdId}
                onChange={(e) => setStockProdId(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titleEn} (Available: {p.availableKeys.length})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300">
                Paste Keys / Accounts / VPN Links (one per line)
              </label>
              <textarea
                rows={6}
                value={stockText}
                onChange={(e) => setStockText(e.target.value)}
                placeholder={'KEY-XXXX-YYYY-ZZZZ\nKEY-AAAA-BBBB-CCCC'}
                className="font-mono-tabular mt-1 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-xs text-slate-100"
              />
            </div>
            {stockNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{stockNotice}</span>
              </div>
            )}
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              Encrypt &amp; Upload Stock
            </button>
          </form>
        </div>
      )}

      {/* Receipt Lightbox */}
      {receiptPreviewOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#121826] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="font-mono-tabular text-sm font-semibold text-slate-50">
                  {receiptPreviewOrder.orderNumber} · {receiptPreviewOrder.paymentProvider}
                </span>
                {receiptPreviewOrder.isDuplicateTxWarning && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      ⚠️ DUPLICATE TX ID WARNING (Matches{' '}
                      {receiptPreviewOrder.duplicateTxOrderNumber ?? 'Earlier Order'})
                    </span>
                  </p>
                )}
                {receiptPreviewOrder.isSimilarSlipWarning && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      ⚠️ SIMILAR SLIP DETECTED (
                      {receiptPreviewOrder.similarSlipOrderNumber ?? 'Earlier Receipt'})
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReceiptPreviewOrder(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <img
              src={receiptPreviewOrder.receiptDataUrl}
              alt={`Receipt for ${receiptPreviewOrder.orderNumber}`}
              className="max-h-[55vh] w-full rounded-xl object-contain bg-[#0B0F17]"
            />
            <div className="rounded-xl border border-white/[0.08] bg-[#0B0F17] p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Verification Mode</span>
                <span className="font-mono-tabular font-semibold text-emerald-300">
                  {receiptPreviewOrder.verificationMode}
                </span>
              </div>
              {receiptPreviewOrder.ocrExtractedTxId && (
                <div className="flex justify-between">
                  <span className="text-slate-400">AI Extracted Tx ID</span>
                  <span className="font-mono-tabular text-slate-100">
                    {receiptPreviewOrder.ocrExtractedTxId}
                  </span>
                </div>
              )}
              {receiptPreviewOrder.ocrConfidenceScore != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">AI OCR Confidence</span>
                  <span className="font-mono-tabular text-slate-100">
                    {Math.round(receiptPreviewOrder.ocrConfidenceScore * 100)}%
                  </span>
                </div>
              )}
              {receiptPreviewOrder.ocrTamperingFlags &&
                receiptPreviewOrder.ocrTamperingFlags.length > 0 && (
                  <p className="pt-1 text-rose-400">
                    ⚠️ {receiptPreviewOrder.ocrTamperingFlags.join(' · ')}
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
