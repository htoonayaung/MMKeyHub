'use client';

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
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
  PackagePlus,
  Plus,
  RefreshCw,
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
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PaymentQrDisplay } from '@/components/PaymentQrDisplay';
import {
  type AdminDashboardResponse,
  type AdminOrderRow,
  type AdminProductSummary,
  approveAdminOrder,
  type AuditLogEntry,
  type BroadcastResponse,
  createAdminProduct,
  createAdminPromoCode,
  type DailySummaryReport,
  downloadSalesCsv,
  fetchAdminAuditLogs,
  fetchAdminDashboard,
  fetchAdminOrders,
  fetchAdminReceiptBlobUrl,
  linkAdminIncomingPayment,
  rejectAdminOrder,
  resolveApiAssetUrl,
  saveAdminPaymentMethod,
  sendAdminBroadcast,
  triggerAdminDailySummary,
  updateAdminMerchantSettings,
  updateAdminProduct,
  updateAdminPromoCode,
  uploadAdminProductImage,
  uploadBulkStock,
} from '@/lib/adminApi';
import { formatMmk } from '@/lib/api';
import { compressQrImageToDataUrl } from '@/lib/imageCompression';
import type { DeliveryFormat, DiscountType, HeroSlideItem, PaymentProvider } from '@/lib/types';

const ADMIN_KEY_STORAGE = 'mmkeyhub_admin_api_key';

type AdminCategoryOption = 'LICENSE_KEY' | 'ACCOUNT' | 'VPN';
type AdminTabKey = 'orders' | 'products' | 'promos' | 'settings';
type OrderStatusFilter =
  | 'ALL'
  | 'PENDING_APPROVAL'
  | 'MANUAL_REVIEW'
  | 'AUTO_VERIFIED'
  | 'APPROVED'
  | 'REJECTED';

const CATEGORY_PRESETS: Record<
  AdminCategoryOption,
  {
    deliveryFormat: DeliveryFormat;
    categorySlug: string;
    categoryNameEn: string;
    categoryNameMm: string;
    label: string;
  }
> = {
  LICENSE_KEY: {
    deliveryFormat: 'LICENSE_KEY',
    categorySlug: 'license-keys',
    categoryNameEn: 'License Keys',
    categoryNameMm: 'Software License Keys',
    label: 'LICENSE_KEY (Software Keys)',
  },
  ACCOUNT: {
    deliveryFormat: 'ACCOUNT_LOGIN',
    categorySlug: 'accounts',
    categoryNameEn: 'Premium Accounts',
    categoryNameMm: 'Premium Accounts',
    label: 'ACCOUNT (Email/Password)',
  },
  VPN: {
    deliveryFormat: 'VPN_CONFIG',
    categorySlug: 'vpn',
    categoryNameEn: 'VPN Configs',
    categoryNameMm: 'VPN Configs',
    label: 'VPN (Outline / WireGuard / V2Ray)',
  },
};

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_SLIDES_FALLBACK: HeroSlideItem[] = [
  {
    id: 'flash-promo',
    badgeEn: 'FLASH SALE · MMK INSTANT DELIVERY',
    badgeMm: 'FLASH SALE · ချက်ချင်းပို့ဆောင်မှု',
    titleEn: 'Software Keys, VPNs & AI Seats Paid in Kyat',
    titleMm: 'Software Key၊ VPN နှင့် AI အကောင့်များ ကျပ်ငွေဖြင့် ဝယ်ယူပါ',
    subtitleEn:
      'Auto-verified in seconds with KBZPay & WavePay. Unlock credentials directly on your Order Tracker or Telegram DM.',
    subtitleMm:
      'KBZPay / WavePay ဖြင့် ငွေလွှဲပြီး စက္ကန့်ပိုင်းအတွင်း AI + ဘဏ် SMS စနစ်ဖြင့် Key ချက်ချင်းရယူပါ။',
    ctaLabelEn: 'Shop Flash Deals',
    ctaLabelMm: 'Flash Deals ကြည့်ရန်',
    targetCategory: 'ALL',
    imageUrl: '/images/hero-campaign.jpg',
  },
  {
    id: 'vpn-security',
    badgeEn: 'LOW-LATENCY SG/JP TUNNELS',
    badgeMm: 'မြန်နှုန်းမြင့် စင်ကာပူ/ဂျပန် VPN များ',
    titleEn: 'High-Speed Outline & ExpressVPN Keys Ready',
    titleMm: 'မြန်မာအင်တာနက်လိုင်းနှင့် အထူးကိုက်ညီသော VPN များ',
    subtitleEn:
      'Scan your Outline ss:// QR code in one tap right after instant verification. 24/7 automated stock delivery.',
    subtitleMm:
      'ဝယ်ယူပြီးသည်နှင့် Outline QR Code ကို တစ်ချက်နှိပ် Scan ဖတ်၍ ချက်ချင်းချိတ်ဆက်နိုင်ပါသည်။',
    ctaLabelEn: 'Browse VPN Keys',
    ctaLabelMm: 'VPN Keys ကြည့်ရန်',
    targetCategory: 'VPN_CONFIG',
    imageUrl: '/images/hero-vpn.jpg',
  },
];

export default function AdminDashboardPage() {
  const [adminKey, setAdminKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTabKey>('orders');
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Order Search, Status Filter & Server Pagination State
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [debouncedOrderQuery, setDebouncedOrderQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [ordersData, setOrdersData] = useState<{
    orders: AdminOrderRow[];
    total: number;
    totalPages: number;
  }>({ orders: [], total: 0, totalPages: 1 });
  const [loadingOrders, setLoadingOrders] = useState(false);

  // 1-Click Unmatched SMS Linking State
  const [linkOrderSelections, setLinkOrderSelections] = useState<Record<string, string>>({});
  const [linkingSmsId, setLinkingSmsId] = useState<string | null>(null);

  // Add Product Form State
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodNameMm, setProdNameMm] = useState('');
  const [prodCategory, setProdCategory] = useState<AdminCategoryOption>('LICENSE_KEY');
  const [prodPrice, setProdPrice] = useState('');
  const [prodOriginalPrice, setProdOriginalPrice] = useState('');
  const [prodDuration, setProdDuration] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [uploadingProdImage, setUploadingProdImage] = useState(false);
  const [prodImageMeta, setProdImageMeta] = useState<string | null>(null);
  const [prodDesc, setProdDesc] = useState('');
  const [prodDescMm, setProdDescMm] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productFormMsg, setProductFormMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<AdminProductSummary | null>(null);
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOrigPrice, setEditOrigPrice] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [editImageError, setEditImageError] = useState<string | null>(null);
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  // Promo Code Management State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoType, setPromoType] = useState<DiscountType>('PERCENTAGE');
  const [promoValue, setPromoValue] = useState('');
  const [promoMaxUses, setPromoMaxUses] = useState('');
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Telegram Broadcast Composer State
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastPhotoUrl, setBroadcastPhotoUrl] = useState('');
  const [broadcastPromoCode, setBroadcastPromoCode] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResponse | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // CSV Export State
  const [exportMonth, setExportMonth] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Shop Operating Status (Online / Night Mode) & Daily Summary
  const [togglingShopStatus, setTogglingShopStatus] = useState(false);
  const [offlineNoticeInput, setOfflineNoticeInput] = useState('');
  const [savingOfflineNotice, setSavingOfflineNotice] = useState(false);
  const [sendingDailySummary, setSendingDailySummary] = useState(false);
  const [dailySummaryReport, setDailySummaryReport] = useState<DailySummaryReport | null>(null);

  // Storefront Branding, Flash Sale Timer & Hero Slides State
  const [brandLogoUrlInput, setBrandLogoUrlInput] = useState('');
  const [flashSaleLabelEnInput, setFlashSaleLabelEnInput] = useState('');
  const [flashSaleLabelMmInput, setFlashSaleLabelMmInput] = useState('');
  const [flashSaleEndsAtInput, setFlashSaleEndsAtInput] = useState('');
  const [heroSlidesDraft, setHeroSlidesDraft] = useState<HeroSlideItem[]>(DEFAULT_SLIDES_FALLBACK);
  const [savingBranding, setSavingBranding] = useState(false);

  // Payment Method Settings State
  const [pmProvider, setPmProvider] = useState<PaymentProvider>('KPAY');
  const [pmName, setPmName] = useState('MMKeyHub Merchant (KBZPay)');
  const [pmPhone, setPmPhone] = useState('09777000111');
  const [pmQrUrl, setPmQrUrl] = useState('');
  const [pmInstrEn, setPmInstrEn] = useState('');
  const [pmInstrMm, setPmInstrMm] = useState('');
  const [savingPm, setSavingPm] = useState(false);

  // Bulk Stock Uploader Modal State
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProductId, setStockProductId] = useState('');
  const [stockRegionLabel, setStockRegionLabel] = useState('');
  const [stockDelimiter, setStockDelimiter] = useState<'newline' | 'block'>('newline');
  const [stockText, setStockText] = useState('');
  const [uploadingStock, setUploadingStock] = useState(false);
  const [stockResultMsg, setStockResultMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Receipt Preview & Order Action State
  const [previewOrder, setPreviewOrder] = useState<AdminOrderRow | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<AdminOrderRow | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState(
    'Transfer amount or transaction ID could not be verified.'
  );

  // Immutable Security Audit Trail State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditActorFilter, setAuditActorFilter] = useState('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Debounce order search query
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedOrderQuery(orderSearchQuery.trim());
      setOrderPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [orderSearchQuery]);

  const loadOrdersPage = useCallback(
    async (key: string, q: string, status: OrderStatusFilter, page: number) => {
      setLoadingOrders(true);
      try {
        const res = await fetchAdminOrders(key, {
          q,
          status,
          page,
          limit: 12,
        });
        setOrdersData({
          orders: res.orders,
          total: res.total,
          totalPages: res.totalPages,
        });
      } catch (err) {
        setDataError(err instanceof Error ? err.message : 'Failed to load orders');
      } finally {
        setLoadingOrders(false);
      }
    },
    []
  );

  const loadAuditLogsPage = useCallback(
    async (key: string, action: string, actorType: string, page: number) => {
      setLoadingAuditLogs(true);
      try {
        const res = await fetchAdminAuditLogs(key, {
          action,
          actorType,
          page,
          limit: 15,
        });
        setAuditLogs(res.logs);
        setAuditTotal(res.total);
        setAuditTotalPages(res.totalPages);
      } catch (err) {
        setDataError(err instanceof Error ? err.message : 'Failed to load security audit logs');
      } finally {
        setLoadingAuditLogs(false);
      }
    },
    []
  );

  const loadDashboard = useCallback(async (key: string) => {
    setLoadingData(true);
    setDataError(null);
    try {
      const data = await fetchAdminDashboard(key);
      setDashboard(data);
      setOfflineNoticeInput(data.merchantSettings?.offlineNotice ?? '');
      setBrandLogoUrlInput(data.merchantSettings?.brandLogoUrl ?? '');
      setFlashSaleLabelEnInput(data.merchantSettings?.flashSaleLabelEn ?? '');
      setFlashSaleLabelMmInput(data.merchantSettings?.flashSaleLabelMm ?? '');
      setFlashSaleEndsAtInput(isoToDatetimeLocal(data.merchantSettings?.flashSaleEndsAt));
      if (
        Array.isArray(data.merchantSettings?.heroSlides) &&
        data.merchantSettings.heroSlides.length > 0
      ) {
        setHeroSlidesDraft(data.merchantSettings.heroSlides);
      }
      setAdminKey(key);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      }
      setAuthError(null);
      if (data.products.length > 0) {
        setStockProductId((prev) => prev || data.products[0].id);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setDataError(message);
      return false;
    } finally {
      setLoadingData(false);
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      void loadDashboard(saved).then((ok) => {
        if (!ok) {
          window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
          setAdminKey('');
        }
      });
    } else {
      setAuthChecking(false);
    }
  }, [loadDashboard]);

  // Reload paginated orders whenever query, status filter, or page changes
  useEffect(() => {
    if (!adminKey) return;
    void loadOrdersPage(adminKey, debouncedOrderQuery, orderStatusFilter, orderPage);
  }, [adminKey, debouncedOrderQuery, orderStatusFilter, orderPage, loadOrdersPage]);

  // Load read-only security audit trail when Settings tab is opened or filters change
  useEffect(() => {
    if (!adminKey || activeTab !== 'settings') return;
    void loadAuditLogsPage(adminKey, auditActionFilter, auditActorFilter, auditPage);
  }, [adminKey, activeTab, auditActionFilter, auditActorFilter, auditPage, loadAuditLogsPage]);

  // Sync payment editor fields when provider tab changes
  useEffect(() => {
    if (!dashboard?.paymentMethods) return;
    const match = dashboard.paymentMethods.find((m) => m.provider === pmProvider);
    if (match) {
      setPmName(match.accountName);
      setPmPhone(match.accountPhone);
      setPmQrUrl(match.qrImageUrl || '');
      setPmInstrEn(match.instructionsEn || '');
      setPmInstrMm(match.instructionsMm || '');
    } else {
      setPmName(
        pmProvider === 'KPAY' ? 'MMKeyHub Merchant (KBZPay)' : 'MMKeyHub Merchant (WavePay)'
      );
      setPmPhone(pmProvider === 'KPAY' ? '09777000111' : '09777000222');
      setPmQrUrl('');
      setPmInstrEn('');
      setPmInstrMm('');
    }
  }, [pmProvider, dashboard]);

  // Cleanup receipt object URL on modal close
  useEffect(() => {
    if (!previewBlobUrl) return;
    return () => URL.revokeObjectURL(previewBlobUrl);
  }, [previewBlobUrl]);

  const pendingOrdersForLinking = useMemo(() => {
    const map = new Map<string, AdminOrderRow>();
    for (const o of dashboard?.recentOrders ?? []) {
      if (o.status === 'PENDING_APPROVAL') map.set(o.id, o);
    }
    for (const o of ordersData.orders) {
      if (o.status === 'PENDING_APPROVAL') map.set(o.id, o);
    }
    return Array.from(map.values());
  }, [dashboard?.recentOrders, ordersData.orders]);

  async function refreshAll() {
    if (!adminKey) return;
    const tasks: Array<Promise<unknown>> = [
      loadDashboard(adminKey),
      loadOrdersPage(adminKey, debouncedOrderQuery, orderStatusFilter, orderPage),
    ];
    if (activeTab === 'settings') {
      tasks.push(loadAuditLogsPage(adminKey, auditActionFilter, auditActorFilter, auditPage));
    }
    await Promise.all(tasks);
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = keyInput.trim();
    if (!candidate) {
      setAuthError('Please enter your ADMIN_API_KEY.');
      return;
    }
    setAuthError(null);
    setAuthChecking(true);
    const ok = await loadDashboard(candidate);
    if (!ok) {
      setAuthError('Invalid ADMIN_API_KEY or backend unreachable.');
      setAdminKey('');
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      }
    } else {
      setKeyInput('');
    }
  }

  function handleLogout() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    }
    setAdminKey('');
    setDashboard(null);
    setAuthError(null);
  }

  async function handleOpenReceipt(order: AdminOrderRow) {
    if (!order.paymentProof?.receiptPath || !adminKey) return;
    setPreviewOrder(order);
    setPreviewBlobUrl(null);
    setLoadingPreview(true);
    try {
      const url = await fetchAdminReceiptBlobUrl(adminKey, order.paymentProof.receiptPath);
      setPreviewBlobUrl(url);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load receipt image');
      setPreviewOrder(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleApproveOrder(order: AdminOrderRow) {
    if (!adminKey) return;
    setProcessingOrderId(order.id);
    setDataError(null);
    setActionNotice(null);
    try {
      await approveAdminOrder(adminKey, order.id);
      setActionNotice(`Approved ${order.orderNumber} and unlocked customer key.`);
      await refreshAll();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to approve order');
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleConfirmReject(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey || !rejectingOrder) return;
    setProcessingOrderId(rejectingOrder.id);
    setDataError(null);
    setActionNotice(null);
    try {
      await rejectAdminOrder(adminKey, rejectingOrder.id, rejectReasonInput);
      setActionNotice(
        `Rejected ${rejectingOrder.orderNumber} and released reserved stock back to inventory.`
      );
      setRejectingOrder(null);
      await refreshAll();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to reject order');
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleLinkSmsToOrder(incomingPaymentId: string) {
    if (!adminKey) return;
    const selectedOrderId =
      linkOrderSelections[incomingPaymentId] || pendingOrdersForLinking[0]?.id;
    if (!selectedOrderId) {
      setDataError('Select a pending order to link with this bank SMS.');
      return;
    }

    setLinkingSmsId(incomingPaymentId);
    setDataError(null);
    setActionNotice(null);
    try {
      const res = await linkAdminIncomingPayment(adminKey, incomingPaymentId, selectedOrderId);
      setActionNotice(
        `Linked SMS #${res.transactionId} to order ${res.orderNumber} and unlocked keys immediately.`
      );
      await refreshAll();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to link SMS to order');
    } finally {
      setLinkingSmsId(null);
    }
  }

  async function handleToggleShopStatus() {
    if (!adminKey) return;
    const currentOpen = dashboard?.merchantSettings?.isShopOpen ?? true;
    setTogglingShopStatus(true);
    setDataError(null);
    setActionNotice(null);
    try {
      const updated = await updateAdminMerchantSettings(adminKey, {
        isShopOpen: !currentOpen,
      });
      setActionNotice(
        updated.isShopOpen
          ? 'Shop switched to Online (5-min delivery).'
          : 'Shop switched to Night Mode (Delayed delivery notice shown at checkout).'
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mmkeyhub-shop-status-updated'));
      }
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update shop status');
    } finally {
      setTogglingShopStatus(false);
    }
  }

  async function handleSaveOfflineNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    const trimmed = offlineNoticeInput.trim();
    if (trimmed.length < 5) {
      setDataError('Night mode notice must be at least 5 characters.');
      return;
    }
    setSavingOfflineNotice(true);
    setDataError(null);
    setActionNotice(null);
    try {
      await updateAdminMerchantSettings(adminKey, {
        isShopOpen: dashboard?.merchantSettings?.isShopOpen ?? false,
        offlineNotice: trimmed,
      });
      setActionNotice('Updated Night Mode checkout banner message.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mmkeyhub-shop-status-updated'));
      }
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to save Night Mode notice');
    } finally {
      setSavingOfflineNotice(false);
    }
  }

  async function handleSaveBrandingAndCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    setSavingBranding(true);
    setDataError(null);
    setActionNotice(null);

    try {
      let flashSaleIso: string | null = null;
      if (flashSaleEndsAtInput.trim()) {
        const parsedDate = new Date(flashSaleEndsAtInput);
        if (Number.isNaN(parsedDate.getTime())) {
          setDataError('Please enter a valid Flash Sale end date and time.');
          setSavingBranding(false);
          return;
        }
        flashSaleIso = parsedDate.toISOString();
      }

      const validSlides = heroSlidesDraft
        .filter((s) => s.titleEn.trim() && s.titleMm.trim())
        .slice(0, 6);

      await updateAdminMerchantSettings(adminKey, {
        isShopOpen: dashboard?.merchantSettings?.isShopOpen ?? true,
        brandLogoUrl: brandLogoUrlInput.trim() || null,
        flashSaleEndsAt: flashSaleIso,
        flashSaleLabelEn: flashSaleLabelEnInput.trim() || null,
        flashSaleLabelMm: flashSaleLabelMmInput.trim() || null,
        heroSlides: validSlides.length > 0 ? validSlides : null,
      });

      setActionNotice('Saved Storefront Brand Logo, Flash Sale Timer & Hero Banner Slides.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mmkeyhub-shop-status-updated'));
      }
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : 'Failed to save storefront branding & campaign settings'
      );
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleSendDailySummaryNow() {
    if (!adminKey) return;
    setSendingDailySummary(true);
    setDataError(null);
    setActionNotice(null);
    try {
      const report = await triggerAdminDailySummary(adminKey);
      setDailySummaryReport(report);
      setActionNotice(
        report.telegramSent
          ? `Daily Summary for ${report.dateKey} sent to Telegram Admin Group.`
          : `Daily Summary computed (${report.dateKey}). Configure Telegram Admin Group ID to auto-deliver.`
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to send daily summary');
    } finally {
      setSendingDailySummary(false);
    }
  }

  async function handleToggleProductActive(productId: string, currentActive: boolean) {
    if (!adminKey) return;
    try {
      await updateAdminProduct(adminKey, productId, { isActive: !currentActive });
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update product status');
    }
  }

  function openEditProductModal(product: AdminProductSummary) {
    setEditingProduct(product);
    setEditTitleEn(product.titleEn);
    setEditPrice(String(product.priceMmk));
    setEditOrigPrice(product.originalPriceMmk ? String(product.originalPriceMmk) : '');
    setEditDuration(product.durationLabelEn ?? '');
    setEditImageUrl(product.imageUrl ?? '');
    setEditImageError(null);
  }

  async function handleUploadProductCover(
    file: File | null | undefined,
    target: 'create' | 'edit'
  ) {
    if (!file || !adminKey) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      const errMsg = 'Only JPG, PNG, or WEBP images are supported.';
      if (target === 'create') {
        setProductFormMsg({ type: 'error', text: errMsg });
      } else {
        setEditImageError(errMsg);
      }
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const errMsg = 'Image must be 5 MB or smaller.';
      if (target === 'create') {
        setProductFormMsg({ type: 'error', text: errMsg });
      } else {
        setEditImageError(errMsg);
      }
      return;
    }

    if (target === 'create') {
      setUploadingProdImage(true);
      setProductFormMsg(null);
    } else {
      setUploadingEditImage(true);
      setEditImageError(null);
    }

    try {
      const uploaded = await uploadAdminProductImage(adminKey, file);
      const kb = Math.max(1, Math.round(uploaded.fileSizeBytes / 1024));
      if (target === 'create') {
        setProdImageUrl(uploaded.imageUrl);
        setProdImageMeta(`${uploaded.width}×${uploaded.height} WebP · ${kb} KB`);
      } else {
        setEditImageUrl(uploaded.imageUrl);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload product image.';
      if (target === 'create') {
        setProductFormMsg({ type: 'error', text: msg });
      } else {
        setEditImageError(msg);
      }
    } finally {
      if (target === 'create') {
        setUploadingProdImage(false);
      } else {
        setUploadingEditImage(false);
      }
    }
  }

  async function handleSaveProductEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey || !editingProduct) return;
    const parsedPrice = Number(editPrice);
    const parsedOrig = editOrigPrice.trim() ? Number(editOrigPrice.trim()) : null;

    if (!editTitleEn.trim() || !Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      setDataError('Enter a valid product title and positive integer price.');
      return;
    }
    if (parsedOrig !== null && (!Number.isInteger(parsedOrig) || parsedOrig <= parsedPrice)) {
      setDataError('Original price (Flash Sale) must exceed the current price.');
      return;
    }

    setSavingProductEdit(true);
    setDataError(null);
    try {
      await updateAdminProduct(adminKey, editingProduct.id, {
        titleEn: editTitleEn.trim(),
        priceMmk: parsedPrice,
        originalPriceMmk: parsedOrig,
        durationLabelEn: editDuration.trim() || null,
        imageUrl: editImageUrl.trim() || null,
      });
      setActionNotice(`Updated "${editTitleEn.trim()}".`);
      setEditingProduct(null);
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setSavingProductEdit(false);
    }
  }

  async function handleSavePaymentMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    setSavingPm(true);
    setDataError(null);
    setActionNotice(null);
    try {
      await saveAdminPaymentMethod(adminKey, pmProvider, {
        accountName: pmName.trim(),
        accountPhone: pmPhone.trim(),
        qrImageUrl: pmQrUrl.trim(),
        instructionsEn: pmInstrEn.trim() || undefined,
        instructionsMm: pmInstrMm.trim() || undefined,
        isActive: true,
      });
      setActionNotice(`Saved ${pmProvider} merchant details.`);
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update payment method');
    } finally {
      setSavingPm(false);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    setProductFormMsg(null);

    const parsedPrice = Number(prodPrice);
    const parsedOriginalPrice = prodOriginalPrice.trim() ? Number(prodOriginalPrice) : null;
    if (!prodName.trim() || !prodDesc.trim() || !Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      setProductFormMsg({
        type: 'error',
        text: 'Name, positive integer Price (MMK), and Description are required.',
      });
      return;
    }

    if (
      parsedOriginalPrice !== null &&
      (!Number.isInteger(parsedOriginalPrice) || parsedOriginalPrice <= parsedPrice)
    ) {
      setProductFormMsg({
        type: 'error',
        text: 'Original Price (Flash Sale) must be an integer higher than Price (MMK).',
      });
      return;
    }

    const preset = CATEGORY_PRESETS[prodCategory];
    const generatedSlug = slugifyTitle(prodName) || `product-${Date.now().toString(36)}`;

    setCreatingProduct(true);
    try {
      await createAdminProduct(adminKey, {
        categorySlug: preset.categorySlug,
        categoryNameEn: preset.categoryNameEn,
        categoryNameMm: preset.categoryNameMm,
        slug: generatedSlug,
        titleEn: prodName.trim(),
        titleMm: prodNameMm.trim() || prodName.trim(),
        descriptionEn: prodDesc.trim(),
        descriptionMm: prodDescMm.trim() || prodDesc.trim(),
        priceMmk: parsedPrice,
        originalPriceMmk: parsedOriginalPrice,
        deliveryFormat: preset.deliveryFormat,
        durationLabelEn: prodDuration.trim() || undefined,
        imageUrl: prodImageUrl.trim() || null,
      });

      setProductFormMsg({
        type: 'success',
        text: `Created "${prodName.trim()}" successfully.`,
      });
      setProdName('');
      setProdNameMm('');
      setProdPrice('');
      setProdOriginalPrice('');
      setProdDuration('');
      setProdImageUrl('');
      setProdImageMeta(null);
      setProdDesc('');
      setProdDescMm('');
      await loadDashboard(adminKey);
    } catch (err) {
      setProductFormMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create product.',
      });
    } finally {
      setCreatingProduct(false);
    }
  }

  async function handleCreatePromoCode(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    setPromoMsg(null);

    const parsedVal = Number(promoValue);
    const parsedMax = promoMaxUses.trim() ? Number(promoMaxUses) : null;
    const cleanCode = promoCodeInput.trim().toUpperCase();

    if (!cleanCode || !Number.isInteger(parsedVal) || parsedVal <= 0) {
      setPromoMsg({
        type: 'error',
        text: 'Enter a valid promo code and positive integer discount value.',
      });
      return;
    }

    setCreatingPromo(true);
    try {
      const created = await createAdminPromoCode(adminKey, {
        code: cleanCode,
        discountType: promoType,
        discountValue: parsedVal,
        maxUses: parsedMax,
        expiresAt: promoExpiresAt ? new Date(promoExpiresAt).toISOString() : null,
      });
      setPromoMsg({
        type: 'success',
        text: `Promo code "${created.code}" created.`,
      });
      setPromoCodeInput('');
      setPromoValue('');
      setPromoMaxUses('');
      setPromoExpiresAt('');
      await loadDashboard(adminKey);
    } catch (err) {
      setPromoMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create promo code',
      });
    } finally {
      setCreatingPromo(false);
    }
  }

  async function handleTogglePromoActive(promoId: string, currentActive: boolean) {
    if (!adminKey) return;
    try {
      await updateAdminPromoCode(adminKey, promoId, { isActive: !currentActive });
      await loadDashboard(adminKey);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to toggle promo status');
    }
  }

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey || !broadcastMessage.trim()) return;
    setSendingBroadcast(true);
    setBroadcastError(null);
    setBroadcastResult(null);

    try {
      const res = await sendAdminBroadcast(adminKey, {
        message: broadcastMessage.trim(),
        photoUrl: broadcastPhotoUrl.trim() || null,
        promoCode: broadcastPromoCode.trim() || null,
      });
      setBroadcastResult(res);
      await loadDashboard(adminKey);
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : 'Broadcast delivery failed');
    } finally {
      setSendingBroadcast(false);
    }
  }

  async function handleExportSalesCsv() {
    if (!adminKey) return;
    setExportingCsv(true);
    setDataError(null);
    try {
      const { blob, filename } = await downloadSalesCsv(adminKey, exportMonth || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to export sales CSV');
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleBulkStockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey) return;
    setStockResultMsg(null);

    if (!stockProductId || !stockText.trim()) {
      setStockResultMsg({
        type: 'error',
        text: 'Select a product and paste at least one key, account, or VPN config.',
      });
      return;
    }

    setUploadingStock(true);
    try {
      const result = await uploadBulkStock(adminKey, stockProductId, {
        items: stockText,
        delimiter: stockDelimiter,
        regionLabel: stockRegionLabel.trim() || undefined,
      });

      setStockResultMsg({
        type: 'success',
        text: `Encrypted & saved ${result.insertedCount} item(s) (${result.skippedDuplicates} duplicate(s) skipped). Total available: ${result.availableStockCount}.`,
      });
      setStockText('');
      await loadDashboard(adminKey);
    } catch (err) {
      setStockResultMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload stock.',
      });
    } finally {
      setUploadingStock(false);
    }
  }

  const pendingUploadItemCount = useMemo(() => {
    if (!stockText.trim()) return 0;
    const parts =
      stockDelimiter === 'block'
        ? stockText.split(/\r?\n---\r?\n/)
        : stockText.split(/\r?\n/);
    return parts.map((s) => s.trim()).filter(Boolean).length;
  }, [stockText, stockDelimiter]);

  function openStockModalForProduct(productId?: string) {
    setStockResultMsg(null);
    if (productId) {
      setStockProductId(productId);
    } else if (dashboard?.products[0]?.id) {
      setStockProductId(dashboard.products[0].id);
    }
    setShowStockModal(true);
  }

  // ---------------------------------------------------------------------------
  // 1. Login Gate View
  // ---------------------------------------------------------------------------
  if (!adminKey) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              MMKeyHub Admin Console
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            Admin Authentication Required
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Enter your server <code className="font-mono-tabular text-slate-200">ADMIN_API_KEY</code>{' '}
            to manage products, encrypted inventory, KPay/WavePay settings, and orders.
          </p>

          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="admin-api-key-input"
                className="block text-xs font-medium text-slate-300"
              >
                Admin API Key
              </label>
              <input
                id="admin-api-key-input"
                type="password"
                autoComplete="current-password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste ADMIN_API_KEY"
                className="font-mono-tabular mt-1.5 w-full min-h-[44px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authChecking}
              className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {authChecking ? 'Verifying Key...' : 'Unlock Admin Panel'}
            </button>
          </form>

          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Return to Storefront</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Authenticated 4-Tab Admin Dashboard
  // ---------------------------------------------------------------------------
  const metrics = dashboard?.metrics ?? {
    totalRevenueMmk: 0,
    pendingOrdersCount: 0,
    approvedOrdersCount: 0,
    lowStockCount: 0,
  };
  const isShopOpen = dashboard?.merchantSettings?.isShopOpen ?? true;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Admin Header Toolbar */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Storefront</span>
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">
            Admin Operations Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={togglingShopStatus}
            onClick={() => void handleToggleShopStatus()}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
              isShopOpen
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${isShopOpen ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            {!isShopOpen && <Moon className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />}
            <span>
              {isShopOpen ? 'Online (5-min delivery)' : 'Night Mode (Delayed delivery)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loadingData || loadingOrders}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/[0.12] bg-[#121826] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-[#182133] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingData || loadingOrders ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => openStockModalForProduct()}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Bulk Upload Stock</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* Overview KPI Strip */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Total Revenue (Approved)</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-emerald-400">
            {formatMmk(metrics.totalRevenueMmk)}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Pending Orders</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-amber-400">
            {metrics.pendingOrdersCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Approved Orders</p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-50">
            {metrics.approvedOrdersCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#121826] p-5">
          <p className="text-xs font-medium text-slate-400">Low Stock Alerts (&lt; 5)</p>
          <p
            className={`font-mono-tabular mt-2 text-2xl font-semibold ${
              metrics.lowStockCount > 0 ? 'text-rose-400' : 'text-slate-50'
            }`}
          >
            {metrics.lowStockCount}
          </p>
        </div>
      </section>

      {dataError && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
        >
          {dataError}
        </div>
      )}

      {actionNotice && (
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {actionNotice}
        </div>
      )}

      {/* 4-Tab Navigation Bar */}
      <div
        role="tablist"
        aria-label="Admin Dashboard Sections"
        className="mt-6 grid grid-cols-2 gap-1.5 rounded-xl border border-white/[0.08] bg-[#121826] p-1.5 sm:grid-cols-4"
      >
        {(
          [
            {
              key: 'orders',
              label: `1. Orders & SMS Ledger (${metrics.pendingOrdersCount})`,
              icon: ShoppingBag,
            },
            {
              key: 'products',
              label: `2. Products & Stock (${dashboard?.products.length ?? 0})`,
              icon: PackagePlus,
            },
            {
              key: 'promos',
              label: `3. Promos & Broadcast (${dashboard?.promoCodes.length ?? 0})`,
              icon: Megaphone,
            },
            {
              key: 'settings',
              label: '4. Merchant & Shop Settings',
              icon: Settings,
            },
          ] as Array<{ key: AdminTabKey; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:bg-[#182133] hover:text-white'
              }`}
            >
              <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: ORDERS & INCOMING SMS LEDGER                                */}
      {/* =================================================================== */}
      {activeTab === 'orders' && (
        <div className="mt-6 space-y-8">
          {/* Paginated & Searchable Orders Table */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-50">
                  Orders Queue & Fulfillment
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Search by Order #, Tx ID, or Customer Contact · Filter by Verification Mode
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[210px]">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Order #, Tx ID, @username..."
                    className="w-full min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <select
                  aria-label="Filter orders by status"
                  value={orderStatusFilter}
                  onChange={(e) => {
                    setOrderStatusFilter(e.target.value as OrderStatusFilter);
                    setOrderPage(1);
                  }}
                  className="min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">Status: ALL</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                  <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
                  <option value="AUTO_VERIFIED">AUTO_VERIFIED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>

                <input
                  type="month"
                  aria-label="Filter CSV export by month"
                  value={exportMonth}
                  onChange={(e) => setExportMonth(e.target.value)}
                  className="font-mono-tabular min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={exportingCsv}
                  onClick={() => void handleExportSalesCsv()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{exportingCsv ? 'Exporting...' : 'Export CSV'}</span>
                </button>
              </div>
            </div>

            {loadingOrders && ordersData.orders.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Searching orders...</p>
            ) : ordersData.orders.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                No matching orders found.
              </p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                        <th className="pb-3 pr-4">Order #</th>
                        <th className="pb-3 pr-4">Customer</th>
                        <th className="pb-3 pr-4">Item</th>
                        <th className="pb-3 pr-4">Total</th>
                        <th className="pb-3 pr-4">Payment</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {ordersData.orders.map((order) => {
                        const customerDisplay = order.customer.telegramUsername
                          ? `@${order.customer.telegramUsername}`
                          : order.customer.telegramId
                            ? `TG:${order.customer.telegramId}`
                            : order.contactPhone ?? order.contactEmail ?? 'Guest';

                        const itemDisplay = order.items
                          .map((i) => `${i.productTitleEn} × ${i.quantity}`)
                          .join(', ');

                        const statusStyle =
                          order.status === 'APPROVED'
                            ? 'text-emerald-400'
                            : order.status === 'REJECTED' || order.status === 'EXPIRED'
                              ? 'text-rose-400'
                              : 'text-amber-400';

                        const isPending = order.status === 'PENDING_APPROVAL';
                        const isBusy = processingOrderId === order.id;

                        return (
                          <tr key={order.id} className="text-slate-200">
                            <td className="font-mono-tabular py-3.5 pr-4 text-xs font-semibold text-slate-100">
                              {order.orderNumber}
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">{customerDisplay}</td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">{itemDisplay}</td>
                            <td className="font-mono-tabular py-3.5 pr-4 text-xs font-semibold text-slate-100">
                              <div>{formatMmk(order.totalMmk)}</div>
                              {order.discountMmk > 0 && (
                                <div className="text-[11px] font-normal text-emerald-400">
                                  -{formatMmk(order.discountMmk)} ({order.promoCodeText})
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 pr-4 text-xs text-slate-300">
                              <div>
                                {order.paymentProof?.provider ?? 'N/A'}
                                {order.paymentProof?.transactionLast6
                                  ? ` · #${order.paymentProof.transactionLast6}`
                                  : ''}
                              </div>
                              {order.paymentProof?.verificationMode && (
                                <div
                                  className={`font-mono-tabular mt-0.5 text-[11px] font-semibold ${
                                    order.paymentProof.verificationMode === 'AUTO_VERIFIED'
                                      ? 'text-emerald-400'
                                      : order.paymentProof.verificationMode === 'ADMIN_APPROVED'
                                        ? 'text-sky-400'
                                        : 'text-amber-300'
                                  }`}
                                >
                                  {order.paymentProof.verificationMode}
                                  {order.paymentProof.ocrConfidenceScore != null
                                    ? ` (${Math.round(order.paymentProof.ocrConfidenceScore * 100)}%)`
                                    : ''}
                                </div>
                              )}
                              {order.paymentProof?.ocrTamperingFlags &&
                                order.paymentProof.ocrTamperingFlags.length > 0 && (
                                  <div className="mt-0.5 text-[11px] text-amber-300">
                                    Flags: {order.paymentProof.ocrTamperingFlags.join(', ')}
                                  </div>
                                )}
                              {order.paymentProof?.isDuplicateTxWarning && (
                                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span>
                                    DUPLICATE TX ID
                                    {order.paymentProof.duplicateTxOrderNumber
                                      ? ` (${order.paymentProof.duplicateTxOrderNumber})`
                                      : ''}
                                  </span>
                                </div>
                              )}
                              {order.paymentProof?.isSimilarSlipWarning && (
                                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span>
                                    ⚠️ SIMILAR SLIP DETECTED
                                    {order.paymentProof.similarSlipOrderNumber
                                      ? ` (${order.paymentProof.similarSlipOrderNumber}${
                                          order.paymentProof.similarSlipDistance != null
                                            ? `, ${Math.round(((64 - order.paymentProof.similarSlipDistance) / 64) * 100)}%`
                                            : ''
                                        })`
                                      : ''}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className={`py-3.5 pr-4 text-xs font-semibold ${statusStyle}`}>
                              {order.status}
                            </td>
                            <td className="py-3.5 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                {order.paymentProof?.receiptPath && (
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenReceipt(order)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#182133] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500/50 cursor-pointer"
                                  >
                                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Receipt</span>
                                  </button>
                                )}

                                {isPending && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void handleApproveOrder(order)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                                    >
                                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => setRejectingOrder(order)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 cursor-pointer"
                                    >
                                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4 text-xs text-slate-400">
                  <span className="font-mono-tabular">
                    Showing page {orderPage} of {ordersData.totalPages} ({ordersData.total} total)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={orderPage <= 1 || loadingOrders}
                      onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/[0.12] bg-[#0B0F17] px-3 text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      disabled={orderPage >= ordersData.totalPages || loadingOrders}
                      onClick={() => setOrderPage((p) => Math.min(ordersData.totalPages, p + 1))}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/[0.12] bg-[#0B0F17] px-3 text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Incoming Bank SMS Ledger with 1-Click Link Unmatched SMS */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-50">
                    Incoming KPay / WavePay SMS Ledger (24/7 Auto-Match)
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Real-time bank transfer notifications pushed via{' '}
                  <code className="font-mono-tabular text-slate-200">
                    POST /api/webhooks/payment-sms
                  </code>
                  . Link any unmatched SMS directly to a pending order in 1 click.
                </p>
              </div>
            </div>

            {!dashboard?.incomingPayments || dashboard.incomingPayments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                No incoming payment SMS records ingested yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400">
                      <th className="pb-2.5 pr-4">Provider</th>
                      <th className="pb-2.5 pr-4">Transaction ID</th>
                      <th className="pb-2.5 pr-4">Amount</th>
                      <th className="pb-2.5 pr-4">Sender</th>
                      <th className="pb-2.5 pr-4">Ledger Match / 1-Click Link</th>
                      <th className="pb-2.5 text-right">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {dashboard.incomingPayments.map((sms) => {
                      const selectedOrderId =
                        linkOrderSelections[sms.id] || pendingOrdersForLinking[0]?.id || '';
                      return (
                        <tr key={sms.id} className="text-slate-200">
                          <td className="py-3 pr-4 font-semibold">{sms.provider}</td>
                          <td className="font-mono-tabular py-3 pr-4 text-emerald-300">
                            {sms.transactionId}
                          </td>
                          <td className="font-mono-tabular py-3 pr-4 font-semibold">
                            {formatMmk(sms.amountMmk)}
                          </td>
                          <td className="py-3 pr-4 text-slate-300">{sms.senderInfo ?? '—'}</td>
                          <td className="py-3 pr-4">
                            {sms.isMatched ? (
                              <span className="font-semibold text-emerald-400">MATCHED</span>
                            ) : pendingOrdersForLinking.length === 0 ? (
                              <span className="font-semibold text-amber-300">
                                UNMATCHED (No pending orders)
                              </span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  aria-label={`Select pending order for SMS ${sms.transactionId}`}
                                  value={selectedOrderId}
                                  onChange={(e) =>
                                    setLinkOrderSelections((prev) => ({
                                      ...prev,
                                      [sms.id]: e.target.value,
                                    }))
                                  }
                                  className="font-mono-tabular min-h-[34px] max-w-[230px] rounded-lg border border-white/[0.12] bg-[#0B0F17] px-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                                >
                                  {pendingOrdersForLinking.map((po) => (
                                    <option key={po.id} value={po.id}>
                                      {po.orderNumber} ({formatMmk(po.totalMmk)})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={linkingSmsId === sms.id || !selectedOrderId}
                                  onClick={() => void handleLinkSmsToOrder(sms.id)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-500 px-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                                >
                                  <Link2 className="h-3 w-3" aria-hidden="true" />
                                  <span>
                                    {linkingSmsId === sms.id ? 'Linking...' : 'Link & Unlock'}
                                  </span>
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="font-mono-tabular py-3 text-right text-slate-400">
                            {new Date(sms.receivedAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PRODUCTS & STOCK                                             */}
      {/* =================================================================== */}
      {activeTab === 'products' && (
        <div className="mt-6 space-y-6">
          {/* Low Stock Alert Banner */}
          {dashboard && dashboard.lowStockProducts.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Low Stock Attention Needed (&lt; 5 keys)</span>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {dashboard.lowStockProducts.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#0B0F17]/80 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{item.titleEn}</p>
                      <p className="font-mono-tabular text-xs text-amber-300">
                        Remaining: {item.availableStockCount}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openStockModalForProduct(item.id)}
                      className="shrink-0 rounded-lg bg-[#182133] px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition-colors cursor-pointer"
                    >
                      Restock
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Toolbar for Add Product & Stock Upload */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-50">
              Catalog Products & Encrypted Stock
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAddProduct((prev) => !prev)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/[0.12] bg-[#121826] px-3.5 text-xs font-semibold text-slate-100 hover:border-emerald-500/50 cursor-pointer"
              >
                <PackagePlus className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>{showAddProduct ? 'Hide Product Form' : 'Add New Product'}</span>
              </button>
              <button
                type="button"
                onClick={() => openStockModalForProduct()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Bulk Upload Stock</span>
              </button>
            </div>
          </div>

          {/* Add New Product Form */}
          {showAddProduct && (
            <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <h3 className="text-base font-semibold text-slate-50">Add New Digital Product</h3>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  aria-label="Close product form"
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="prod-name-en" className="block text-xs font-medium text-slate-300">
                    Product Name (English) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="prod-name-en"
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="e.g. Outline VPN Singapore 1 Month"
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="prod-name-mm" className="block text-xs font-medium text-slate-300">
                    Product Name (Burmese, Optional)
                  </label>
                  <input
                    id="prod-name-mm"
                    type="text"
                    value={prodNameMm}
                    onChange={(e) => setProdNameMm(e.target.value)}
                    placeholder="Defaults to English name if blank"
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="prod-category" className="block text-xs font-medium text-slate-300">
                    Category & Delivery Format <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="prod-category"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value as AdminCategoryOption)}
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {(Object.keys(CATEGORY_PRESETS) as AdminCategoryOption[]).map((key) => (
                      <option key={key} value={key}>
                        {CATEGORY_PRESETS[key].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="prod-price" className="block text-xs font-medium text-slate-300">
                      Price (MMK) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id="prod-price"
                      type="number"
                      min={100}
                      step={50}
                      required
                      value={prodPrice}
                      onChange={(e) => setProdPrice(e.target.value)}
                      placeholder="15000"
                      className="font-mono-tabular mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-orig-price"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Original Price (Flash Sale)
                    </label>
                    <input
                      id="prod-orig-price"
                      type="number"
                      min={100}
                      step={50}
                      value={prodOriginalPrice}
                      onChange={(e) => setProdOriginalPrice(e.target.value)}
                      placeholder="Optional"
                      className="font-mono-tabular mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-duration"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Duration Label
                    </label>
                    <input
                      id="prod-duration"
                      type="text"
                      value={prodDuration}
                      onChange={(e) => setProdDuration(e.target.value)}
                      placeholder="1 Month"
                      className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-2.5">
                  <label htmlFor="prod-image-url" className="block text-xs font-medium text-slate-300">
                    Product Cover Image (Upload JPG/PNG/WEBP or paste URL)
                  </label>
                  <div className="grid gap-3 sm:grid-cols-12 items-start">
                    <div className="sm:col-span-5">
                      <label className="flex min-h-[124px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.16] bg-[#0B0F17] p-3 text-center transition-colors hover:border-emerald-500/50">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingProdImage}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            void handleUploadProductCover(f, 'create');
                          }}
                          className="sr-only"
                        />
                        {uploadingProdImage ? (
                          <>
                            <Loader2
                              className="h-5 w-5 animate-spin text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="text-xs font-medium text-emerald-300">
                              Optimizing &amp; Uploading...
                            </span>
                          </>
                        ) : prodImageUrl ? (
                          <div className="relative w-full">
                            <img
                              src={resolveApiAssetUrl(prodImageUrl)}
                              alt="Product cover preview"
                              referrerPolicy="no-referrer"
                              className="h-24 w-full rounded-lg object-cover border border-white/[0.1]"
                            />
                            <span className="mt-1.5 block text-[11px] font-medium text-emerald-300">
                              Click to replace image
                            </span>
                          </div>
                        ) : (
                          <>
                            <ImagePlus className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                            <span className="text-xs font-medium text-slate-200">
                              Upload Product Image
                            </span>
                            <span className="text-[11px] text-slate-400">
                              JPG, PNG, WEBP · Auto-sanitized WebP (Max 5MB)
                            </span>
                          </>
                        )}
                      </label>
                    </div>

                    <div className="sm:col-span-7 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          id="prod-image-url"
                          type="text"
                          value={prodImageUrl}
                          onChange={(e) => {
                            setProdImageUrl(e.target.value);
                            setProdImageMeta(null);
                          }}
                          placeholder="Uploaded path or https://your-cdn.com/product-cover.jpg"
                          className="w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                        />
                        {prodImageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setProdImageUrl('');
                              setProdImageMeta(null);
                            }}
                            aria-label="Remove product cover image"
                            className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {prodImageMeta
                          ? `Uploaded cleanly: ${prodImageMeta}`
                          : 'Upload directly from your device (recommended 4:3 cover) or leave blank to use default brand art.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="prod-desc-en" className="block text-xs font-medium text-slate-300">
                    Description (English) <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    id="prod-desc-en"
                    rows={3}
                    required
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder="Key highlights, supported devices, and region notes..."
                    className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="prod-desc-mm" className="block text-xs font-medium text-slate-300">
                    Description (Burmese, Optional)
                  </label>
                  <textarea
                    id="prod-desc-mm"
                    rows={3}
                    value={prodDescMm}
                    onChange={(e) => setProdDescMm(e.target.value)}
                    placeholder="Defaults to English description if blank"
                    className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {productFormMsg && (
                  <div
                    className={`sm:col-span-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                      productFormMsg.type === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {productFormMsg.text}
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={creatingProduct}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{creatingProduct ? 'Creating Product...' : 'Create Product'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Catalog Inventory Table */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-5 sm:p-6">
            {!dashboard || dashboard.products.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No products found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                      <th className="pb-3 pr-4">Product</th>
                      <th className="pb-3 pr-4">Format</th>
                      <th className="pb-3 pr-4">Price</th>
                      <th className="pb-3 pr-4">Available</th>
                      <th className="pb-3 pr-4">Reserved</th>
                      <th className="pb-3 pr-4">Sold</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {dashboard.products.map((p) => (
                      <tr key={p.id} className="text-slate-200">
                        <td className="py-3 pr-4 font-medium text-slate-50">
                          <div className="flex items-center gap-2.5">
                            {p.imageUrl && (
                              <img
                                src={resolveApiAssetUrl(p.imageUrl)}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-8 w-8 rounded-lg border border-white/[0.1] object-cover shrink-0"
                              />
                            )}
                            <div>
                              <p>{p.titleEn}</p>
                              {p.durationLabelEn && (
                                <p className="text-[11px] font-normal text-slate-400">
                                  {p.durationLabelEn}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-400">{p.deliveryFormat}</td>
                        <td className="font-mono-tabular py-3 pr-4">
                          <span>{formatMmk(p.priceMmk)}</span>
                          {p.originalPriceMmk && p.originalPriceMmk > p.priceMmk && (
                            <span className="ml-2 text-xs text-slate-500 line-through">
                              {formatMmk(p.originalPriceMmk)}
                            </span>
                          )}
                        </td>
                        <td
                          className={`font-mono-tabular py-3 pr-4 font-semibold ${
                            p.availableStockCount < 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {p.availableStockCount}
                        </td>
                        <td className="font-mono-tabular py-3 pr-4 text-slate-400">
                          {p.reservedStockCount}
                        </td>
                        <td className="font-mono-tabular py-3 pr-4 text-slate-400">
                          {p.soldStockCount}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          <span className={p.isActive ? 'text-emerald-400' : 'text-slate-500'}>
                            {p.isActive ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => openEditProductModal(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-300 hover:border-emerald-500/40 hover:text-white cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleProductActive(p.id, p.isActive)}
                            className="rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                          >
                            {p.isActive ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openStockModalForProduct(p.id)}
                            className="rounded-lg border border-white/[0.12] bg-[#182133] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500/50 cursor-pointer"
                          >
                            Upload Keys
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PROMOS & TELEGRAM BROADCAST                                  */}
      {/* =================================================================== */}
      {activeTab === 'promos' && (
        <div className="mt-6 space-y-6">
          {/* Promo Codes Management */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4">
              <Tag className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-50">Promo Codes & Coupons</h2>
            </div>

            <form onSubmit={handleCreatePromoCode} className="grid gap-3 sm:grid-cols-5 items-end">
              <div>
                <label
                  htmlFor="promo-code-create"
                  className="block text-xs font-medium text-slate-300"
                >
                  Code
                </label>
                <input
                  id="promo-code-create"
                  type="text"
                  required
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  placeholder="KYAT15"
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm uppercase text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="promo-type-create"
                  className="block text-xs font-medium text-slate-300"
                >
                  Type
                </label>
                <select
                  id="promo-type-create"
                  value={promoType}
                  onChange={(e) => setPromoType(e.target.value as DiscountType)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED_MMK">Fixed MMK</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="promo-val-create"
                  className="block text-xs font-medium text-slate-300"
                >
                  {promoType === 'PERCENTAGE' ? 'Percent (1-95)' : 'Amount (MMK)'}
                </label>
                <input
                  id="promo-val-create"
                  type="number"
                  required
                  min={1}
                  max={promoType === 'PERCENTAGE' ? 95 : undefined}
                  value={promoValue}
                  onChange={(e) => setPromoValue(e.target.value)}
                  placeholder={promoType === 'PERCENTAGE' ? '15' : '2500'}
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="promo-max-create"
                  className="block text-xs font-medium text-slate-300"
                >
                  Max Uses (Opt)
                </label>
                <input
                  id="promo-max-create"
                  type="number"
                  min={1}
                  value={promoMaxUses}
                  onChange={(e) => setPromoMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={creatingPromo}
                  className="min-h-[40px] w-full rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  {creatingPromo ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>

            {promoMsg && (
              <div
                className={`rounded-xl border px-3.5 py-2 text-xs ${
                  promoMsg.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {promoMsg.text}
              </div>
            )}

            {dashboard && dashboard.promoCodes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400">
                      <th className="pb-2.5 pr-4">Code</th>
                      <th className="pb-2.5 pr-4">Discount</th>
                      <th className="pb-2.5 pr-4">Used / Limit</th>
                      <th className="pb-2.5 pr-4">Status</th>
                      <th className="pb-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {dashboard.promoCodes.map((promo) => (
                      <tr key={promo.id} className="text-slate-200">
                        <td className="font-mono-tabular py-2.5 pr-4 font-semibold text-emerald-300">
                          {promo.code}
                        </td>
                        <td className="font-mono-tabular py-2.5 pr-4">
                          {promo.discountType === 'PERCENTAGE'
                            ? `${promo.discountValue}% OFF`
                            : `-${formatMmk(promo.discountValue)}`}
                        </td>
                        <td className="font-mono-tabular py-2.5 pr-4 text-slate-300">
                          {promo.usedCount} / {promo.maxUses ?? '∞'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={promo.isActive ? 'text-emerald-400' : 'text-slate-500'}>
                            {promo.isActive ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleTogglePromoActive(promo.id, promo.isActive)}
                            className="rounded-lg border border-white/[0.1] bg-[#0B0F17] px-2.5 py-1 text-slate-300 hover:text-white cursor-pointer"
                          >
                            {promo.isActive ? 'Pause' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Telegram Broadcast Message Section */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 space-y-5">
            <div className="border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-sky-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-slate-50">
                  Telegram Marketing Broadcast
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Active Bot & Mini App Subscribers:{' '}
                <span className="font-mono-tabular font-semibold text-emerald-400">
                  {dashboard?.subscriberStats?.activeSubscribers ?? 0}
                </span>{' '}
                · Rate-limited at 25 messages/sec
              </p>
            </div>

            <form onSubmit={handleSendBroadcast} className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-8 space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="broadcast-msg"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Announcement Message (English / Burmese)
                    </label>
                    <span className="font-mono-tabular text-xs text-slate-500">
                      {broadcastMessage.length} chars
                    </span>
                  </div>
                  <textarea
                    id="broadcast-msg"
                    rows={5}
                    required
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Flash Sale! Get 10% OFF Windows 11 Pro & Outline VPN today using promo code KYAT10."
                    className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="broadcast-photo"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Banner Photo URL (Optional HTTPS)
                    </label>
                    <input
                      id="broadcast-photo"
                      type="url"
                      value={broadcastPhotoUrl}
                      onChange={(e) => setBroadcastPhotoUrl(e.target.value)}
                      placeholder="https://your-domain.com/promo-banner.jpg"
                      className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="broadcast-promo"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Attach Promo Code CTA Button (Optional)
                    </label>
                    <select
                      id="broadcast-promo"
                      value={broadcastPromoCode}
                      onChange={(e) => setBroadcastPromoCode(e.target.value)}
                      className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">No promo code button</option>
                      {dashboard?.promoCodes
                        .filter((c) => c.isActive)
                        .map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code} (
                            {c.discountType === 'PERCENTAGE'
                              ? `${c.discountValue}% OFF`
                              : `-${formatMmk(c.discountValue)}`}
                            )
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 space-y-4">
                <div className="space-y-2 text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">Telegram Delivery Preview</p>
                  <p className="text-slate-400">
                    Target audience: {dashboard?.subscriberStats?.activeSubscribers ?? 0} active
                    user(s). Users who blocked the bot are automatically skipped and flagged.
                  </p>
                  {broadcastPromoCode && (
                    <p className="font-mono-tabular text-emerald-400">
                      Inline Button: Claim Promo {broadcastPromoCode}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={sendingBroadcast || !broadcastMessage.trim()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>{sendingBroadcast ? 'Sending Batch...' : 'Send Broadcast'}</span>
                </button>
              </div>
            </form>

            {broadcastError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
                {broadcastError}
              </div>
            )}

            {broadcastResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                Broadcast completed: Delivered to{' '}
                <span className="font-mono-tabular font-semibold">{broadcastResult.sentCount}</span>{' '}
                /{' '}
                <span className="font-mono-tabular font-semibold">
                  {broadcastResult.totalTargets}
                </span>{' '}
                subscriber(s) ({broadcastResult.failedCount} failed, {broadcastResult.blockedCount}{' '}
                blocked).
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: MERCHANT & SHOP SETTINGS                                     */}
      {/* =================================================================== */}
      {activeTab === 'settings' && (
        <div className="mt-6 space-y-6">
          {/* Daily Sales & Auto-Verify Summary Scheduler Card */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-50">
                    Daily Sales & Auto-Verify Summary (23:59 Yangon)
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Automatically dispatched every night at 23:59 to your Telegram Admin Group, or
                  send an on-demand snapshot now.
                </p>
              </div>
              <button
                type="button"
                disabled={sendingDailySummary}
                onClick={() => void handleSendDailySummaryNow()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {sendingDailySummary ? 'Generating Report...' : 'Send Daily Summary Now'}
                </span>
              </button>
            </div>

            {dailySummaryReport && (
              <div className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 sm:grid-cols-4 text-xs">
                <div>
                  <p className="text-slate-400">Today Revenue ({dailySummaryReport.dateKey})</p>
                  <p className="font-mono-tabular mt-1 text-base font-semibold text-emerald-400">
                    {formatMmk(dailySummaryReport.totalRevenueMmk)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Approved Today</p>
                  <p className="font-mono-tabular mt-1 text-base font-semibold text-slate-100">
                    {dailySummaryReport.approvedOrdersCount}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Auto-Verified Rate</p>
                  <p className="font-mono-tabular mt-1 text-base font-semibold text-sky-400">
                    {dailySummaryReport.autoVerifyRatePct}% ({dailySummaryReport.autoVerifiedCount})
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Pending / Low Stock</p>
                  <p className="font-mono-tabular mt-1 text-base font-semibold text-amber-300">
                    {dailySummaryReport.pendingOrdersCount} pending ·{' '}
                    {dailySummaryReport.lowStockProducts.length} low stock
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Shop Online / Night Mode Status Notice Editor */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-50">
                  Shop Operating Status & Night Mode Banner
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Switch between 24/7 Instant Online mode and Night Mode when human escalations may
                  take longer.
                </p>
              </div>
              <button
                type="button"
                disabled={togglingShopStatus}
                onClick={() => void handleToggleShopStatus()}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold cursor-pointer ${
                  isShopOpen
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                <span>{isShopOpen ? 'Online (5-min delivery)' : 'Night Mode Active'}</span>
              </button>
            </div>

            <form
              onSubmit={handleSaveOfflineNotice}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label
                  htmlFor="offline-notice-input"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Moon className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                  <span>Night Mode Checkout Banner Message (Shown to Customers)</span>
                </label>
                <input
                  id="offline-notice-input"
                  type="text"
                  value={offlineNoticeInput}
                  onChange={(e) => setOfflineNoticeInput(e.target.value)}
                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={savingOfflineNotice}
                className="min-h-[42px] shrink-0 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                {savingOfflineNotice ? 'Saving...' : 'Save Banner Notice'}
              </button>
            </form>
          </section>

          {/* Storefront Branding, Flash Sale Timer & Hero Slides Editor */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-50">
                    Storefront Logo, Flash Sale Timer & Hero Banner Slides
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Customize your brand header logo, live Flash Sale countdown timer, and rotating Hero
                  banner slides in English &amp; Burmese.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHeroSlidesDraft(DEFAULT_SLIDES_FALLBACK)}
                className="min-h-[36px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Reset Default Slides
              </button>
            </div>

            <form onSubmit={handleSaveBrandingAndCampaign} className="space-y-5">
              {/* Custom Brand Logo */}
              <div className="grid gap-4 rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 sm:grid-cols-12 sm:items-center">
                <div className="sm:col-span-8 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="brand-logo-input" className="text-xs font-medium text-slate-300">
                      Custom Header Brand Logo (HTTPS URL or Upload Image)
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
                            void compressQrImageToDataUrl(file)
                              .then((dataUrl) => setBrandLogoUrlInput(dataUrl))
                              .catch(() => setDataError('Failed to process brand logo image'));
                          }}
                        />
                      </label>
                      {brandLogoUrlInput && (
                        <button
                          type="button"
                          onClick={() => setBrandLogoUrlInput('')}
                          className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          Clear Logo
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    id="brand-logo-input"
                    type="text"
                    value={brandLogoUrlInput.startsWith('data:image/') ? '' : brandLogoUrlInput}
                    onChange={(e) => setBrandLogoUrlInput(e.target.value)}
                    placeholder={
                      brandLogoUrlInput.startsWith('data:image/')
                        ? 'Custom logo uploaded (click Clear Logo to remove)'
                        : 'https://your-domain.com/logo.png (optional)'
                    }
                    className="w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-4 flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#121826] p-3">
                  <span className="text-[11px] text-slate-400">Navbar Wordmark Preview</span>
                  <div className="mt-2 flex items-center gap-2">
                    {brandLogoUrlInput ? (
                      <img
                        src={brandLogoUrlInput}
                        alt="Brand logo preview"
                        className="h-8 w-8 rounded-lg object-contain"
                      />
                    ) : (
                      <img
                        src="/images/mmkeyhub-icon.png"
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
                    <span>Live Flash Sale Countdown Timer</span>
                  </div>
                  {flashSaleEndsAtInput && (
                    <button
                      type="button"
                      onClick={() => setFlashSaleEndsAtInput('')}
                      className="text-xs text-slate-400 hover:text-rose-300 cursor-pointer"
                    >
                      Disable Timer
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-300">Ends At (Local Time)</label>
                    <input
                      type="datetime-local"
                      value={flashSaleEndsAtInput}
                      onChange={(e) => setFlashSaleEndsAtInput(e.target.value)}
                      className="font-mono-tabular mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300">Banner Label (EN)</label>
                    <input
                      type="text"
                      value={flashSaleLabelEnInput}
                      onChange={(e) => setFlashSaleLabelEnInput(e.target.value)}
                      placeholder="Weekend Flash Sale · Up to 28% OFF"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300">Banner Label (MM)</label>
                    <input
                      type="text"
                      value={flashSaleLabelMmInput}
                      onChange={(e) => setFlashSaleLabelMmInput(e.target.value)}
                      placeholder="Weekend Flash Sale · ၂၈% အထိ လျှော့ဈေး"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Hero Banner Slides */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Hero Banner Slides ({heroSlidesDraft.length}/6)
                  </span>
                  {heroSlidesDraft.length < 6 && (
                    <button
                      type="button"
                      onClick={() =>
                        setHeroSlidesDraft((prev) => [
                          ...prev,
                          {
                            id: `slide-${Date.now()}`,
                            badgeEn: 'NEW PROMO',
                            badgeMm: 'အထူးပရိုမိုးရှင်း',
                            titleEn: 'New Instant Digital Deal',
                            titleMm: 'အထူးလျှော့ဈေး အစီအစဉ်',
                            subtitleEn: 'Pay cleanly in MMK with 24/7 auto verification.',
                            subtitleMm: 'KPay / WavePay ဖြင့် ၂၄ နာရီ ဝယ်ယူနိုင်ပါပြီ။',
                            ctaLabelEn: 'Explore Catalog',
                            ctaLabelMm: 'ကုန်ပစ္စည်းများ ကြည့်ရန်',
                            targetCategory: 'ALL',
                            imageUrl: '/images/hero-campaign.jpg',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#0B0F17] px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:border-emerald-500/40 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Slide</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {heroSlidesDraft.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className="rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                        <span className="font-mono-tabular text-xs font-semibold text-emerald-400">
                          Slide #{idx + 1} · Target: {slide.targetCategory}
                        </span>
                        {heroSlidesDraft.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setHeroSlidesDraft((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-[11px] text-slate-400">Title (English)</label>
                          <input
                            type="text"
                            required
                            value={slide.titleEn}
                            onChange={(e) =>
                              setHeroSlidesDraft((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, titleEn: e.target.value } : s
                                )
                              )
                            }
                            className="mt-1 w-full min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400">Title (Burmese)</label>
                          <input
                            type="text"
                            required
                            value={slide.titleMm}
                            onChange={(e) =>
                              setHeroSlidesDraft((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, titleMm: e.target.value } : s
                                )
                              )
                            }
                            className="mt-1 w-full min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400">
                            CTA Label &amp; Target Category
                          </label>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="text"
                              value={slide.ctaLabelEn}
                              onChange={(e) =>
                                setHeroSlidesDraft((prev) =>
                                  prev.map((s, i) =>
                                    i === idx ? { ...s, ctaLabelEn: e.target.value } : s
                                  )
                                )
                              }
                              className="flex-1 min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                            />
                            <select
                              value={slide.targetCategory}
                              onChange={(e) =>
                                setHeroSlidesDraft((prev) =>
                                  prev.map((s, i) =>
                                    i === idx
                                      ? {
                                          ...s,
                                          targetCategory: e.target
                                            .value as HeroSlideItem['targetCategory'],
                                        }
                                      : s
                                  )
                                )
                              }
                              className="min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-2.5 text-xs text-slate-100"
                            >
                              <option value="ALL">ALL</option>
                              <option value="LICENSE_KEY">LICENSE_KEY</option>
                              <option value="ACCOUNT_LOGIN">ACCOUNT_LOGIN</option>
                              <option value="VPN_CONFIG">VPN_CONFIG</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400">
                            Background Image Path / HTTPS URL
                          </label>
                          <input
                            type="text"
                            value={slide.imageUrl ?? ''}
                            onChange={(e) =>
                              setHeroSlidesDraft((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, imageUrl: e.target.value } : s
                                )
                              )
                            }
                            placeholder="/images/hero-campaign.jpg"
                            className="mt-1 w-full min-h-[38px] rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingBranding}
                  className="min-h-[42px] rounded-xl bg-emerald-500 px-5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  {savingBranding
                    ? 'Saving Storefront Settings...'
                    : 'Save Logo, Flash Timer & Hero Slides'}
                </button>
              </div>
            </form>
          </section>

          {/* KPay / WavePay Merchant Receiving Accounts */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <h2 className="text-base font-semibold text-slate-50">
                Merchant KPay & WavePay Receiving Accounts
              </h2>
              <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-[#0B0F17] p-1">
                {(['KPAY', 'WAVEPAY'] as PaymentProvider[]).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => setPmProvider(prov)}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer ${
                      pmProvider === prov
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {prov === 'KPAY' ? 'KBZPay (KPay)' : 'WavePay'}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSavePaymentMethod} className="mt-4 grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pm-name" className="block text-xs font-medium text-slate-300">
                    Account Holder Name
                  </label>
                  <input
                    id="pm-name"
                    type="text"
                    required
                    value={pmName}
                    onChange={(e) => setPmName(e.target.value)}
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="pm-phone" className="block text-xs font-medium text-slate-300">
                    Phone Number
                  </label>
                  <input
                    id="pm-phone"
                    type="text"
                    required
                    value={pmPhone}
                    onChange={(e) => setPmPhone(e.target.value)}
                    className="font-mono-tabular mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="pm-qr" className="block text-xs font-medium text-slate-300">
                      Custom QR Code URL or Upload Image (Auto-QR if blank)
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
                            void compressQrImageToDataUrl(file)
                              .then((dataUrl) => setPmQrUrl(dataUrl))
                              .catch(() => setDataError('Failed to process QR image file'));
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
                    id="pm-qr"
                    type="text"
                    value={pmQrUrl.startsWith('data:image/') ? '' : pmQrUrl}
                    onChange={(e) => setPmQrUrl(e.target.value)}
                    placeholder={
                      pmQrUrl.startsWith('data:image/')
                        ? 'Custom QR image uploaded (click Reset to clear)'
                        : 'https://your-domain.com/kpay-qr.png (or click Upload QR Image)'
                    }
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="pm-instr-en" className="block text-xs font-medium text-slate-300">
                    Instructions (English)
                  </label>
                  <input
                    id="pm-instr-en"
                    type="text"
                    value={pmInstrEn}
                    onChange={(e) => setPmInstrEn(e.target.value)}
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="pm-instr-mm" className="block text-xs font-medium text-slate-300">
                    Instructions (Burmese)
                  </label>
                  <input
                    id="pm-instr-mm"
                    type="text"
                    value={pmInstrMm}
                    onChange={(e) => setPmInstrMm(e.target.value)}
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col items-center justify-between rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-medium text-slate-400">Checkout QR Preview</p>
                  <PaymentQrDisplay
                    provider={pmProvider}
                    accountName={pmName || 'MMKeyHub Merchant'}
                    accountPhone={pmPhone || '09777000111'}
                    qrImageUrl={pmQrUrl}
                    size={120}
                    hideSaveButton
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPm}
                  className="mt-4 min-h-[42px] w-full rounded-xl bg-emerald-500 px-5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  {savingPm ? 'Saving...' : `Save ${pmProvider} Settings`}
                </button>
              </div>
            </form>
          </section>

          {/* Immutable Security Audit Trail (Read-Only) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#121826] p-6">
            <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-slate-50">
                    Immutable Security Audit Trail
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Append-only operational ledger for approvals, stock uploads, payout changes, and webhook verification.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter audit logs by actor type"
                  value={auditActorFilter}
                  onChange={(e) => {
                    setAuditActorFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">Actor: ALL</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="WEBHOOK">WEBHOOK</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                </select>

                <select
                  aria-label="Filter audit logs by action"
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">Action: ALL</option>
                  <option value="ORDER_APPROVED">ORDER_APPROVED</option>
                  <option value="ORDER_REJECTED">ORDER_REJECTED</option>
                  <option value="STOCK_UPLOADED">STOCK_UPLOADED</option>
                  <option value="MERCHANT_SETTINGS_UPDATED">MERCHANT_SETTINGS_UPDATED</option>
                  <option value="PROMO_CREATED">PROMO_CREATED</option>
                  <option value="BROADCAST_SENT">BROADCAST_SENT</option>
                  <option value="WEBHOOK_INGESTED">WEBHOOK_INGESTED</option>
                  <option value="WEBHOOK_REJECTED">WEBHOOK_REJECTED</option>
                </select>

                <button
                  type="button"
                  disabled={loadingAuditLogs}
                  onClick={() =>
                    void loadAuditLogsPage(adminKey, auditActionFilter, auditActorFilter, auditPage)
                  }
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs font-medium text-slate-200 hover:border-emerald-500/40 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingAuditLogs ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {loadingAuditLogs && auditLogs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                Loading security audit trail...
              </p>
            ) : auditLogs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                No audit events match the selected filters.
              </p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] font-medium text-slate-400">
                        <th className="pb-2.5 pr-4">Timestamp</th>
                        <th className="pb-2.5 pr-4">Actor &amp; IP</th>
                        <th className="pb-2.5 pr-4">Action</th>
                        <th className="pb-2.5 pr-4">Target</th>
                        <th className="pb-2.5">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {auditLogs.map((entry) => {
                        const isAlertAction =
                          entry.action === 'WEBHOOK_REJECTED' ||
                          entry.action === 'MERCHANT_SETTINGS_UPDATED' ||
                          entry.action === 'ORDER_REJECTED';

                        return (
                          <tr key={entry.id} className="text-slate-200 align-top">
                            <td className="font-mono-tabular py-3 pr-4 whitespace-nowrap text-slate-400">
                              {new Date(entry.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">
                              <span className="font-semibold text-slate-100">{entry.actorType}</span>
                              <span className="text-slate-400"> · {entry.actorId}</span>
                              {entry.actorIp && (
                                <div className="font-mono-tabular text-[11px] text-slate-500">
                                  IP: {entry.actorIp}
                                </div>
                              )}
                            </td>
                            <td className="font-mono-tabular py-3 pr-4 whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  isAlertAction
                                    ? 'text-amber-300'
                                    : entry.action === 'ORDER_APPROVED'
                                      ? 'text-emerald-400'
                                      : 'text-sky-300'
                                }`}
                              >
                                {entry.action}
                              </span>
                            </td>
                            <td className="font-mono-tabular py-3 pr-4 whitespace-nowrap text-slate-300">
                              {entry.entityType} · {entry.targetId}
                            </td>
                            <td className="font-mono-tabular py-3 text-[11px] text-slate-400 break-all">
                              {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-slate-400">
                  <span className="font-mono-tabular">
                    Page {auditPage} of {auditTotalPages} ({auditTotal} immutable record(s))
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={auditPage <= 1 || loadingAuditLogs}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/[0.12] bg-[#0B0F17] px-3 text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      disabled={auditPage >= auditTotalPages || loadingAuditLogs}
                      onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-white/[0.12] bg-[#0B0F17] px-3 text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS: EDIT PRODUCT, REJECT ORDER, BULK STOCK, RECEIPT VIEWER      */}
      {/* =================================================================== */}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveProductEdit}
            className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121826] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h2 className="text-base font-semibold text-slate-50">
                Edit Product · {editingProduct.titleEn}
              </h2>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Title (English)</label>
              <input
                type="text"
                required
                value={editTitleEn}
                onChange={(e) => setEditTitleEn(e.target.value)}
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Price (MMK)</label>
                <input
                  type="number"
                  required
                  min={100}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="font-mono-tabular mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Original Price</label>
                <input
                  type="number"
                  min={100}
                  value={editOrigPrice}
                  onChange={(e) => setEditOrigPrice(e.target.value)}
                  placeholder="Optional"
                  className="font-mono-tabular mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Duration</label>
                <input
                  type="text"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-medium text-slate-300">
                Product Cover Image (Upload or URL)
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/[0.12] bg-[#0B0F17] flex items-center justify-center">
                  {editImageUrl ? (
                    <img
                      src={resolveApiAssetUrl(editImageUrl)}
                      alt={editTitleEn || 'Product preview'}
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
                        disabled={uploadingEditImage}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          void handleUploadProductCover(f, 'edit');
                        }}
                        className="sr-only"
                      />
                      {uploadingEditImage ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{uploadingEditImage ? 'Uploading...' : 'Upload Image'}</span>
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
                    value={editImageUrl}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    placeholder="Uploaded path or https://your-cdn.com/cover.jpg"
                    className="w-full min-h-[38px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-xs text-slate-100"
                  />
                  {editImageError && <p className="text-xs text-rose-400">{editImageError}</p>}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[40px] rounded-xl border border-white/[0.12] px-4 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProductEdit}
                className="min-h-[40px] rounded-xl bg-emerald-500 px-5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
              >
                {savingProductEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmReject}
            className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#121826] p-6 shadow-2xl space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-50">
              Reject Order {rejectingOrder.orderNumber}
            </h2>
            <div>
              <label
                htmlFor="reject-reason-input"
                className="block text-xs font-medium text-slate-300"
              >
                Rejection Reason (shown to customer)
              </label>
              <textarea
                id="reject-reason-input"
                rows={3}
                required
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3 text-sm text-slate-100 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="min-h-[40px] rounded-xl border border-white/[0.12] px-4 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingOrderId === rejectingOrder.id}
                className="min-h-[40px] rounded-xl bg-rose-500 px-4 text-xs font-semibold text-white hover:bg-rose-400 cursor-pointer"
              >
                Confirm Reject & Release Stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Stock Uploader Modal */}
      {showStockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-stock-title"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#121826] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h2 id="bulk-stock-title" className="text-lg font-semibold text-slate-50">
                Bulk Upload Encrypted Stock
              </h2>
              <button
                type="button"
                onClick={() => setShowStockModal(false)}
                aria-label="Close stock uploader"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-[#182133] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleBulkStockSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="stock-product-select"
                  className="block text-xs font-medium text-slate-300"
                >
                  Target Product
                </label>
                <select
                  id="stock-product-select"
                  value={stockProductId}
                  onChange={(e) => setStockProductId(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  {dashboard?.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titleEn} (Available: {p.availableStockCount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="stock-delimiter"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Entry Separator
                  </label>
                  <select
                    id="stock-delimiter"
                    value={stockDelimiter}
                    onChange={(e) => setStockDelimiter(e.target.value as 'newline' | 'block')}
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="newline">One item per line</option>
                    <option value="block">Multi-line blocks (split by ---)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="stock-region" className="block text-xs font-medium text-slate-300">
                    Region Tag (Optional)
                  </label>
                  <input
                    id="stock-region"
                    type="text"
                    value={stockRegionLabel}
                    onChange={(e) => setStockRegionLabel(e.target.value)}
                    placeholder="e.g. SG-01 / Global"
                    className="mt-1.5 w-full min-h-[42px] rounded-xl border border-white/[0.12] bg-[#0B0F17] px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="stock-textarea" className="block text-xs font-medium text-slate-300">
                    Keys / Account Logins / VPN Links
                  </label>
                  <span className="font-mono-tabular text-xs text-slate-400">
                    {pendingUploadItemCount} item(s) detected
                  </span>
                </div>
                <textarea
                  id="stock-textarea"
                  rows={8}
                  value={stockText}
                  onChange={(e) => setStockText(e.target.value)}
                  placeholder={
                    stockDelimiter === 'newline'
                      ? 'XXXXX-XXXXX-XXXXX-XXXXX\nuser@domain.com:password123\nss://Y2hhY2hhMjA...'
                      : '[Interface]\nPrivateKey = ...\n---\n[Interface]\nPrivateKey = ...'
                  }
                  className="font-mono-tabular mt-1.5 w-full rounded-xl border border-white/[0.12] bg-[#0B0F17] p-3.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {stockResultMsg && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                    stockResultMsg.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {stockResultMsg.type === 'success' && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{stockResultMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={uploadingStock || pendingUploadItemCount === 0}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>
                  {uploadingStock
                    ? 'Encrypting & Saving...'
                    : `Encrypt & Upload ${pendingUploadItemCount} Item(s)`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Authenticated Receipt Image Quick View Modal */}
      {previewOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-preview-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121826] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h2
                  id="receipt-preview-title"
                  className="font-mono-tabular text-sm font-semibold text-slate-50"
                >
                  {previewOrder.orderNumber} · {previewOrder.paymentProof?.provider}
                </h2>
                <p className="font-mono-tabular text-xs text-slate-400">
                  {formatMmk(previewOrder.totalMmk)}
                  {previewOrder.paymentProof?.transactionLast6
                    ? ` · Tx #${previewOrder.paymentProof.transactionLast6}`
                    : ''}
                </p>
                {previewOrder.paymentProof?.isDuplicateTxWarning && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      ⚠️ DUPLICATE TX ID WARNING
                      {previewOrder.paymentProof.duplicateTxOrderNumber
                        ? ` — Matches ${previewOrder.paymentProof.duplicateTxOrderNumber}`
                        : ''}
                    </span>
                  </p>
                )}
                {previewOrder.paymentProof?.isSimilarSlipWarning && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      ⚠️ SIMILAR SLIP DETECTED
                      {previewOrder.paymentProof.similarSlipOrderNumber
                        ? ` — Similar to ${previewOrder.paymentProof.similarSlipOrderNumber}`
                        : ''}
                      {previewOrder.paymentProof.similarSlipDistance != null
                        ? ` (dHash distance ${previewOrder.paymentProof.similarSlipDistance})`
                        : ''}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewOrder(null);
                  setPreviewBlobUrl(null);
                }}
                aria-label="Close receipt preview"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#182133] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0F17]">
              {loadingPreview ? (
                <span className="text-xs text-slate-400">Loading authenticated receipt...</span>
              ) : previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt={`Payment receipt for ${previewOrder.orderNumber}`}
                  className="max-h-[70vh] w-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-500">Receipt preview unavailable.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
