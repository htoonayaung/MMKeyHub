/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Languages,
  LayoutGrid,
  LifeBuoy,
  Lock,
  Mail,
  Minus,
  Moon,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PreviewAdminPanel,
  type PreviewDailySummaryReport,
} from './components/PreviewAdminPanel';
import {
  type PreviewCartCheckoutLine,
  PreviewCheckoutModal,
} from './components/PreviewCheckoutModal';
import { PreviewDetailsModal } from './components/PreviewDetailsModal';
import { PreviewHeroSlider } from './components/PreviewHeroSlider';
import { PreviewProductVisual } from './components/PreviewProductVisual';
import { PreviewTelegramBot } from './components/PreviewTelegramBot';
import { PreviewVpnQrCode, isPreviewVpnUri } from './components/PreviewVpnQrCode';
import {
  type BotDmMessage,
  type DeliveryFormat,
  INITIAL_INCOMING_SMS,
  INITIAL_MERCHANT_SETTINGS,
  INITIAL_ORDERS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_PRODUCTS,
  INITIAL_PROMO_CODES,
  INITIAL_RECENT_PURCHASES,
  INITIAL_SUBSCRIBERS,
  INITIAL_SUPPORT_TICKETS,
  type PaymentProvider,
  type PreviewAdminGroupLog,
  type PreviewAuditLogEntry,
  type PreviewBotSubscriber,
  type PreviewCartItem,
  type PreviewIncomingSms,
  type PreviewLocale,
  type PreviewMerchantSettings,
  type PreviewOrder,
  type PreviewOrderItemLine,
  type PreviewPaymentMethod,
  type PreviewProduct,
  type PreviewPromoCode,
  type PreviewSupportTicket,
  type PreviewTheme,
  type RecentPurchaseSeed,
  INITIAL_AUDIT_LOGS,
} from './previewData';
import { detectPreviewVendor } from './utils/previewUtils';

type PreviewTab = 'CATALOG' | 'TRACKER' | 'BOT';
type CategoryFilter = 'ALL' | DeliveryFormat;

function isAdminPortalRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    hash === '#/admin' ||
    hash === '#admin' ||
    hash.startsWith('#/admin/') ||
    params.get('portal') === 'admin'
  );
}

interface SavedPreviewOrder {
  orderNumber: string;
  productTitle: string;
  totalMmk: number;
  createdAt: string;
}

const SAVED_ORDERS_STORAGE_KEY = 'mmk_preview_recent_orders_v1';
const PREVIEW_THEME_STORAGE_KEY = 'mmk_preview_theme_v1';
const PREVIEW_CART_STORAGE_KEY = 'mmk_preview_cart_v1';

function readSavedPreviewOrders(): SavedPreviewOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPreviewTheme(): PreviewTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readPreviewCart(): PreviewCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PREVIEW_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i) => i && typeof i.productId === 'string' && typeof i.quantity === 'number' && i.quantity > 0
    );
  } catch {
    return [];
  }
}

function maskPreviewBuyer(label: string): string {
  const clean = label.replace(/^@/, '').split(' ')[0].trim();
  if (!clean) return 'Cu***';
  if (/^\d+$/.test(clean) && clean.length >= 6) {
    return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 2)}***`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('CATALOG');
  const [isAdminPortal, setIsAdminPortal] = useState<boolean>(() => isAdminPortalRoute());
  const [locale, setLocale] = useState<PreviewLocale>('en');
  const [theme, setTheme] = useState<PreviewTheme>(() => readPreviewTheme());
  const [isTelegramMode, setIsTelegramMode] = useState(false);

  const [products, setProducts] = useState<PreviewProduct[]>(INITIAL_PRODUCTS);
  const [merchantSettings, setMerchantSettings] = useState<PreviewMerchantSettings>(
    INITIAL_MERCHANT_SETTINGS
  );
  const [paymentMethods, setPaymentMethods] =
    useState<Record<PaymentProvider, PreviewPaymentMethod>>(INITIAL_PAYMENT_METHODS);
  const [promoCodes, setPromoCodes] = useState<PreviewPromoCode[]>(INITIAL_PROMO_CODES);
  const [orders, setOrders] = useState<PreviewOrder[]>(INITIAL_ORDERS);
  const [incomingSmsList, setIncomingSmsList] =
    useState<PreviewIncomingSms[]>(INITIAL_INCOMING_SMS);
  const [adminGroupLogs, setAdminGroupLogs] = useState<PreviewAdminGroupLog[]>([
    {
      id: 'log-seed-vpn02',
      orderNumber: 'MMK-20261115-VPN02',
      provider: 'WAVEPAY',
      amountMmk: 8000,
      transactionId: 'WP882991204',
      confidenceScore: 0.98,
      productTitleEn: 'Outline VPN Singapore High-Speed',
      quantity: 1,
      dmSent: true,
      timestamp: '8 mins ago',
    },
  ]);
  const [subscribers, setSubscribers] = useState<PreviewBotSubscriber[]>(INITIAL_SUBSCRIBERS);
  const [supportTickets, setSupportTickets] =
    useState<PreviewSupportTicket[]>(INITIAL_SUPPORT_TICKETS);
  const [auditLogs, setAuditLogs] = useState<PreviewAuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [supportOpen, setSupportOpen] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [savedOrders, setSavedOrders] = useState<SavedPreviewOrder[]>(() =>
    readSavedPreviewOrders()
  );
  const [cartItems, setCartItems] = useState<PreviewCartItem[]>(() => readPreviewCart());
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [cartCheckoutLines, setCartCheckoutLines] = useState<PreviewCartCheckoutLine[] | null>(null);
  const [cartToast, setCartToast] = useState<string | null>(null);
  const [pendingPromoCode, setPendingPromoCode] = useState<string | null>(null);
  const fallbackTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = fallbackTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncAdminRoute = () => {
      setIsAdminPortal(isAdminPortalRoute());
    };
    const handleAdminShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsAdminPortal((prev) => {
          const next = !prev;
          try {
            if (next) {
              window.history.pushState(null, '', '#/admin');
            } else {
              window.history.pushState(null, '', window.location.pathname === '/admin' ? '/' : window.location.pathname);
            }
          } catch {
            // ignore history restriction in sandboxed iframe
          }
          return next;
        });
      }
    };
    window.addEventListener('hashchange', syncAdminRoute);
    window.addEventListener('popstate', syncAdminRoute);
    window.addEventListener('keydown', handleAdminShortcut);
    return () => {
      window.removeEventListener('hashchange', syncAdminRoute);
      window.removeEventListener('popstate', syncAdminRoute);
      window.removeEventListener('keydown', handleAdminShortcut);
    };
  }, []);

  function exitAdminPortal() {
    setIsAdminPortal(false);
    setActiveTab('CATALOG');
    if (typeof window !== 'undefined') {
      try {
        const cleanPath = window.location.pathname.startsWith('/admin')
          ? '/'
          : window.location.pathname;
        window.history.pushState(null, '', cleanPath);
      } catch {
        window.location.hash = '';
      }
    }
  }

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    try {
      window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREVIEW_CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // ignore
    }
  }, [cartItems]);

  function triggerPreviewHaptic(kind: 'light' | 'selection' | 'success' | 'error') {
    if (!isTelegramMode) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        if (kind === 'error') navigator.vibrate([25, 30, 25]);
        else if (kind === 'success') navigator.vibrate([15, 25, 18]);
        else navigator.vibrate(10);
      }
    } catch {
      // Ignore vibration restrictions in embedded preview iframes
    }
  }

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsProduct, setDetailsProduct] = useState<PreviewProduct | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<PreviewProduct | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>(
    INITIAL_ORDERS[0].orderNumber
  );
  const [orderLookupInput, setOrderLookupInput] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAllOrderNumber, setCopiedAllOrderNumber] = useState<string | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);

  const [dmMessages, setDmMessages] = useState<BotDmMessage[]>([
    {
      id: 'dm-welcome',
      sender: 'BOT',
      text: 'Welcome to MMKeyHub!\nInstant Software License Keys, Premium Accounts & VPN Configs in MMK via KPay & WavePay.\n\nMMKeyHub မှ ကြိုဆိုပါတယ်။ /myorders ဖြင့် ဝယ်ယူပြီးသား Key များကို ကြည့်ရှုနိုင်ပြီး /support <မက်ဆေ့ချ်> ဖြင့် အကူအညီတောင်းနိုင်ပါသည်။',
      timestamp: 'Just now',
    },
  ]);

  const isMm = locale === 'mm';

  const recentPurchaseFeed: RecentPurchaseSeed[] = useMemo(() => {
    const approvedFromOrders: RecentPurchaseSeed[] = orders
      .filter((o) => o.status === 'APPROVED')
      .map((o) => {
        const prod = products.find((p) => p.id === o.productId);
        return {
          id: o.id,
          maskedBuyer: maskPreviewBuyer(o.customerLabel),
          productTitleEn: o.productTitleEn,
          productTitleMm: o.productTitleMm,
          durationEn: prod?.durationEn ?? '1 Month',
          durationMm: prod?.durationMm ?? '၁ လ',
          minutesAgo: Math.max(1, Math.round((Date.now() - Date.parse(o.createdAt)) / 60000)),
        };
      });

    return [...approvedFromOrders, ...INITIAL_RECENT_PURCHASES].slice(0, 6);
  }, [orders, products]);

  useEffect(() => {
    if (recentPurchaseFeed.length <= 1) return;
    const timer = window.setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % recentPurchaseFeed.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [recentPurchaseFeed.length]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (categoryFilter !== 'ALL' && p.deliveryFormat !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.titleEn.toLowerCase().includes(q) ||
        p.titleMm.toLowerCase().includes(q) ||
        p.descriptionEn.toLowerCase().includes(q)
      );
    });
  }, [products, categoryFilter, searchQuery]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.orderNumber === selectedOrderNumber) ?? orders[0] ?? null,
    [orders, selectedOrderNumber]
  );

  const resolvedCartLines = useMemo(() => {
    return cartItems
      .map((ci) => {
        const prod = products.find((p) => p.id === ci.productId);
        if (!prod || !prod.isActive || prod.availableKeys.length === 0) return null;
        return {
          product: prod,
          quantity: Math.min(ci.quantity, prod.availableKeys.length, 10),
        };
      })
      .filter((x): x is PreviewCartCheckoutLine => Boolean(x && x.quantity > 0));
  }, [cartItems, products]);

  const totalCartUnits = useMemo(
    () => resolvedCartLines.reduce((sum, l) => sum + l.quantity, 0),
    [resolvedCartLines]
  );

  const cartSubtotalMmk = useMemo(
    () => resolvedCartLines.reduce((sum, l) => sum + l.product.priceMmk * l.quantity, 0),
    [resolvedCartLines]
  );

  function handleAddToCart(product: PreviewProduct, qty = 1) {
    if (product.availableKeys.length === 0) return;
    triggerPreviewHaptic('selection');
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: Math.min(10, product.availableKeys.length, i.quantity + qty),
              }
            : i
        );
      }
      return [...prev, { productId: product.id, quantity: Math.min(10, product.availableKeys.length, qty) }];
    });
    const label = isMm
      ? `စျေးခြင်းထဲသို့ ${product.titleMm} ထည့်ပြီး`
      : `Added ${product.titleEn} to cart`;
    setCartToast(label);
    window.setTimeout(() => {
      setCartToast((curr) => (curr === label ? null : curr));
    }, 2000);
  }

  function handleUpdateCartQty(productId: string, nextQty: number) {
    if (nextQty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    const prod = products.find((p) => p.id === productId);
    const maxCap = prod ? Math.min(10, prod.availableKeys.length) : 10;
    setCartItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(maxCap, nextQty) } : i))
    );
  }

  function handleRemoveFromCart(productId: string) {
    setCartItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function parsePreviewSms(
    rawMessage: string,
    hintProvider?: PaymentProvider
  ): {
    provider: PaymentProvider;
    amountMmk: number;
    transactionId: string;
    senderInfo: string;
  } {
    const provider: PaymentProvider =
      hintProvider ??
      (/wave\s*pay|wave/i.test(rawMessage) ? 'WAVEPAY' : 'KPAY');
    const amtMatch = rawMessage.match(/([\d,]+)(?:\.\d{1,2})?\s*MMK/i);
    const amountMmk = amtMatch ? Number(amtMatch[1].replace(/,/g, '')) : 0;
    const txMatch = rawMessage.match(/(?:Trans(?:action)?\s*ID|Ref(?:\s*ID)?|ID)\s*[:#]?\s*([A-Z0-9]{6,24})/i);
    const transactionId = txMatch
      ? txMatch[1].toUpperCase()
      : `TX${Math.floor(100000 + Math.random() * 900000)}`;
    const senderMatch = rawMessage.match(/from\s+([^.\n]+)/i);
    const senderInfo = senderMatch ? senderMatch[1].trim() : 'Customer Wallet';
    return { provider, amountMmk, transactionId, senderInfo };
  }

  function clearFallbackTimer(orderId: string) {
    const timer = fallbackTimersRef.current[orderId];
    if (timer) {
      window.clearTimeout(timer);
      delete fallbackTimersRef.current[orderId];
    }
  }

  function scheduleOrderFallback(orderId: string) {
    clearFallbackTimer(orderId);
    fallbackTimersRef.current[orderId] = window.setTimeout(() => {
      delete fallbackTimersRef.current[orderId];
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId && o.status === 'PENDING_APPROVAL'
            ? {
                ...o,
                verificationMode: 'MANUAL_REVIEW',
                escalatedToAdminGroup: true,
                ocrValidationNotes:
                  '60s SMS match window elapsed — escalated to @MMKeyHubAdmins for manual approval.',
              }
            : o
        )
      );
    }, 60_000);
  }

  function handleEscalateOrderNow(orderId: string) {
    clearFallbackTimer(orderId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId && o.status === 'PENDING_APPROVAL'
          ? {
              ...o,
              verificationMode: 'MANUAL_REVIEW',
              escalatedToAdminGroup: true,
              ocrValidationNotes:
                'Escalated to @MMKeyHubAdmins for manual verification.',
            }
          : o
      )
    );
  }

  function txIdsMatch(a?: string | null, b?: string | null): boolean {
    const cleanA = (a ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanB = (b ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!cleanA || !cleanB) return true;
    return cleanA === cleanB || cleanA.endsWith(cleanB) || cleanB.endsWith(cleanA);
  }

  function appendAuditLog(entry: Omit<PreviewAuditLogEntry, 'id' | 'createdAt'>) {
    setAuditLogs((prev) => [
      {
        ...entry,
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function appendAutoVerifiedSideEffects(order: PreviewOrder, matchedTxId: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAdminGroupLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        orderNumber: order.orderNumber,
        provider: order.paymentProvider,
        amountMmk: order.totalMmk,
        transactionId: matchedTxId,
        confidenceScore: order.ocrConfidenceScore ?? 0.99,
        productTitleEn: order.productTitleEn,
        quantity: order.quantity,
        dmSent: order.customerMode === 'TELEGRAM',
        timestamp: time,
      },
      ...prev,
    ]);

    appendAuditLog({
      actorType: 'SYSTEM',
      actorId: 'auto-fulfillment',
      actorIp: '127.0.0.1',
      action: 'ORDER_APPROVED',
      entityType: 'Order',
      targetId: order.orderNumber,
      metadata: {
        verificationMode: 'AUTO_VERIFIED',
        matchedTxId,
        amountMmk: order.totalMmk,
      },
    });

    if (order.customerMode === 'TELEGRAM') {
      setDmMessages((prev) => [
        ...prev,
        {
          id: `dm-auto-${Date.now()}`,
          sender: 'BOT',
          text:
            `✅ Instant Auto-Verified — ${order.orderNumber}\n` +
            `AI Vision & Bank SMS matched in real time! Key unlocked automatically.\n` +
            `သင့်ငွေလွှဲမှုကို AI + ဘဏ် SMS စနစ်မှ အလိုအလျောက် စစ်ဆေးအတည်ပြုပြီး Key များ ပေးပို့လိုက်ပါပြီ။\n\n` +
            `${order.productTitleEn}:`,
          codeBlocks: order.reservedKeys,
          orderNumberTag: order.orderNumber,
          timestamp: time,
        },
      ]);
    }
  }

  function handleSimulateIncomingSms(input: {
    rawMessage?: string;
    provider?: PaymentProvider;
    transactionId?: string;
    amountMmk?: number;
    senderInfo?: string;
  }): { matchedOrderNumber: string | null; sms: PreviewIncomingSms } {
    const parsed = input.rawMessage
      ? parsePreviewSms(input.rawMessage, input.provider)
      : {
          provider: input.provider ?? 'KPAY',
          amountMmk: input.amountMmk ?? 0,
          transactionId: input.transactionId ?? `TX${Math.floor(100000 + Math.random() * 900000)}`,
          senderInfo: input.senderInfo ?? 'Customer Wallet',
        };

    const provider = input.provider ?? parsed.provider;
    const transactionId = (input.transactionId ?? parsed.transactionId).trim().toUpperCase();
    const amountMmk = input.amountMmk ?? parsed.amountMmk;
    const senderInfo = input.senderInfo ?? parsed.senderInfo;
    const rawMessage =
      input.rawMessage ??
      `${provider}: Received ${amountMmk.toLocaleString('en-US')} MMK from ${senderInfo}. Trans ID: ${transactionId}.`;

    const candidate = orders.find((o) => {
      if (o.status !== 'PENDING_APPROVAL') return false;
      if (o.paymentProvider !== provider) return false;
      if (o.totalMmk !== amountMmk) return false;
      if (o.isDuplicateTxWarning) return false;
      if (o.ocrTamperingFlags && o.ocrTamperingFlags.length > 0) return false;
      return (
        txIdsMatch(transactionId, o.ocrExtractedTxId) ||
        txIdsMatch(transactionId, o.transactionLast6)
      );
    });

    const smsRecord: PreviewIncomingSms = {
      id: `sms-${Date.now()}`,
      provider,
      transactionId,
      transactionLast6: transactionId.slice(-6),
      amountMmk,
      senderInfo,
      rawMessage,
      isMatched: Boolean(candidate),
      matchedOrderNumber: candidate?.orderNumber ?? null,
      receivedAt: new Date().toISOString(),
    };

    setIncomingSmsList((prev) => [smsRecord, ...prev]);

    appendAuditLog({
      actorType: 'WEBHOOK',
      actorId: 'payment-sms-webhook',
      actorIp: '103.89.44.19',
      action: 'WEBHOOK_INGESTED',
      entityType: 'IncomingPayment',
      targetId: transactionId,
      metadata: {
        provider,
        amountMmk,
        authMode: 'hmac-sha256',
        matchedOrderNumber: candidate?.orderNumber ?? null,
      },
    });

    if (candidate) {
      clearFallbackTimer(candidate.id);
      const prod = products.find((p) => p.id === candidate.productId);
      const warrantyExpiresAt = computePreviewWarrantyExpiry(prod?.durationEn);

      setOrders((prev) =>
        prev.map((o) =>
          o.id === candidate.id
            ? {
                ...o,
                status: 'APPROVED',
                deliveredKeys: o.reservedKeys,
                reservedKeys: [],
                reviewedBy: 'SYSTEM_AUTO',
                verificationMode: 'AUTO_VERIFIED',
                escalatedToAdminGroup: false,
                ocrValidationNotes: `Matched incoming ${provider} SMS #${transactionId}.`,
                warrantyExpiresAt,
                expiryReminderSent: false,
              }
            : o
        )
      );

      setProducts((prev) =>
        prev.map((p) => {
          const itemMatch = candidate.items?.find((it) => it.productId === p.id);
          const qtyDelta = itemMatch ? itemMatch.quantity : p.id === candidate.productId ? candidate.quantity : 0;
          if (qtyDelta === 0) return p;
          return {
            ...p,
            reservedCount: Math.max(0, p.reservedCount - qtyDelta),
            soldCount: p.soldCount + qtyDelta,
          };
        })
      );

      appendAutoVerifiedSideEffects(candidate, transactionId);
      triggerPreviewHaptic('success');
    }

    return { matchedOrderNumber: candidate?.orderNumber ?? null, sms: smsRecord };
  }

  function handleSubmitOrder(payload: {
    productId: string;
    quantity: number;
    items?: Array<{ productId: string; quantity: number }>;
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
  }) {
    const requestedLines =
      payload.items && payload.items.length > 0
        ? payload.items
        : [{ productId: payload.productId, quantity: payload.quantity }];

    const reservations = new Map<string, string[]>();
    const orderItemLines: PreviewOrderItemLine[] = [];

    for (const line of requestedLines) {
      const targetProduct = products.find((p) => p.id === line.productId);
      if (!targetProduct || targetProduct.availableKeys.length < line.quantity) {
        return;
      }
      const picked = targetProduct.availableKeys.slice(0, line.quantity);
      reservations.set(targetProduct.id, picked);
      orderItemLines.push({
        productId: targetProduct.id,
        productTitleEn: targetProduct.titleEn,
        productTitleMm: targetProduct.titleMm,
        deliveryFormat: targetProduct.deliveryFormat,
        instructionsEn: targetProduct.instructionsEn,
        instructionsMm: targetProduct.instructionsMm,
        quantity: line.quantity,
        unitPriceMmk: targetProduct.priceMmk,
        subtotalMmk: targetProduct.priceMmk * line.quantity,
        reservedKeys: picked,
        deliveredKeys: picked,
      });
    }

    const primaryProduct = products.find((p) => p.id === requestedLines[0].productId);
    if (!primaryProduct) return;

    const allKeys = orderItemLines.flatMap((l) => l.reservedKeys);
    const totalQty = orderItemLines.reduce((sum, l) => sum + l.quantity, 0);

    const normalizedTx = payload.transactionLast6.trim().toUpperCase();
    const matchedApprovedTxOrder = normalizedTx
      ? orders.find(
          (o) => o.status === 'APPROVED' && o.transactionLast6.trim().toUpperCase() === normalizedTx
        )
      : undefined;

    const hasTamperOrDup =
      payload.ocrTamperingFlags.length > 0 || Boolean(matchedApprovedTxOrder);

    let matchedSms = !hasTamperOrDup
      ? incomingSmsList.find(
          (sms) =>
            !sms.isMatched &&
            sms.provider === payload.paymentProvider &&
            sms.amountMmk === payload.totalMmk &&
            (txIdsMatch(sms.transactionId, payload.ocrExtractedTxId) ||
              txIdsMatch(sms.transactionId, normalizedTx))
        )
      : undefined;

    if (!matchedSms && !hasTamperOrDup && payload.forcePreMatchedSms) {
      const seededSms: PreviewIncomingSms = {
        id: `sms-pre-${Date.now()}`,
        provider: payload.paymentProvider,
        transactionId: payload.ocrExtractedTxId,
        transactionLast6: payload.ocrExtractedTxId.slice(-6),
        amountMmk: payload.totalMmk,
        senderInfo: payload.customerContact,
        rawMessage: `${payload.paymentProvider === 'KPAY' ? 'KBZPay' : 'WavePay'}: Received ${payload.totalMmk.toLocaleString('en-US')} MMK. Trans ID: ${payload.ocrExtractedTxId}.`,
        isMatched: false,
        matchedOrderNumber: null,
        receivedAt: new Date(Date.now() - 12_000).toISOString(),
      };
      matchedSms = seededSms;
      setIncomingSmsList((prev) => [seededSms, ...prev]);
    }

    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const orderNumber = `MMK-20261115-${suffix}`;
    const warrantyExpiresAt = matchedSms
      ? computePreviewWarrantyExpiry(primaryProduct.durationEn)
      : null;

    setProducts((prev) =>
      prev.map((p) => {
        const picked = reservations.get(p.id);
        if (!picked) return p;
        return {
          ...p,
          availableKeys: p.availableKeys.slice(picked.length),
          reservedCount: matchedSms ? p.reservedCount : p.reservedCount + picked.length,
          soldCount: matchedSms ? p.soldCount + picked.length : p.soldCount,
        };
      })
    );

    if (payload.promoCode) {
      const normalized = payload.promoCode.toUpperCase();
      setPromoCodes((prev) =>
        prev.map((c) => (c.code === normalized ? { ...c, usedCount: c.usedCount + 1 } : c))
      );
    }

    const combinedTitleEn =
      orderItemLines.length > 1
        ? `${primaryProduct.titleEn} + ${orderItemLines.length - 1} more`
        : primaryProduct.titleEn;
    const combinedTitleMm =
      orderItemLines.length > 1
        ? `${primaryProduct.titleMm} + ${orderItemLines.length - 1} မျိုး`
        : primaryProduct.titleMm;

    const newOrder: PreviewOrder = {
      id: `ord-${Date.now()}`,
      orderNumber,
      accessToken: `tok-${suffix.toLowerCase()}`,
      status: matchedSms ? 'APPROVED' : 'PENDING_APPROVAL',
      productId: primaryProduct.id,
      productTitleEn: combinedTitleEn,
      productTitleMm: combinedTitleMm,
      deliveryFormat: primaryProduct.deliveryFormat,
      instructionsEn: primaryProduct.instructionsEn,
      instructionsMm: primaryProduct.instructionsMm,
      quantity: totalQty,
      items: orderItemLines.map((l) => ({
        ...l,
        reservedKeys: matchedSms ? [] : l.reservedKeys,
        deliveredKeys: matchedSms ? l.deliveredKeys : [],
      })),
      subtotalMmk: payload.subtotalMmk,
      discountMmk: payload.discountMmk,
      promoCode: payload.promoCode,
      totalMmk: payload.totalMmk,
      paymentProvider: payload.paymentProvider,
      transactionLast6: payload.transactionLast6,
      receiptDataUrl: payload.receiptDataUrl,
      receiptHash: payload.receiptHash,
      isDuplicateTxWarning: Boolean(matchedApprovedTxOrder),
      duplicateTxOrderNumber: matchedApprovedTxOrder?.orderNumber ?? null,
      customerMode: isTelegramMode ? 'TELEGRAM' : 'WEB',
      customerLabel: payload.customerContact,
      reservedKeys: matchedSms ? [] : allKeys,
      deliveredKeys: matchedSms ? allKeys : [],
      rejectionReason: null,
      reviewedBy: matchedSms ? 'SYSTEM_AUTO' : null,
      verificationMode: matchedSms
        ? 'AUTO_VERIFIED'
        : hasTamperOrDup
          ? 'MANUAL_REVIEW'
          : 'AUTO_VERIFIED',
      ocrExtractedTxId: payload.ocrExtractedTxId,
      ocrExtractedAmount: payload.ocrExtractedAmount,
      ocrConfidenceScore: payload.ocrConfidenceScore,
      ocrTamperingFlags: payload.ocrTamperingFlags,
      ocrValidationNotes: matchedSms
        ? `Auto-matched pre-received ${matchedSms.provider} SMS #${matchedSms.transactionId}.`
        : payload.ocrValidationNotes,
      escalatedToAdminGroup: hasTamperOrDup,
      warrantyExpiresAt,
      expiryReminderSent: false,
      createdAt: new Date().toISOString(),
    };

    setOrders((prev) => [newOrder, ...prev]);

    const nextSaved: SavedPreviewOrder[] = [
      {
        orderNumber,
        productTitle: combinedTitleEn,
        totalMmk: payload.totalMmk,
        createdAt: newOrder.createdAt,
      },
      ...savedOrders.filter((item) => item.orderNumber !== orderNumber),
    ].slice(0, 20);
    setSavedOrders(nextSaved);
    try {
      window.localStorage.setItem(SAVED_ORDERS_STORAGE_KEY, JSON.stringify(nextSaved));
    } catch {
      // Ignore storage quota errors
    }

    if (matchedSms) {
      const matchedId = matchedSms.id;
      setIncomingSmsList((prev) =>
        prev.map((s) =>
          s.id === matchedId ? { ...s, isMatched: true, matchedOrderNumber: orderNumber } : s
        )
      );
      appendAutoVerifiedSideEffects(
        { ...newOrder, reservedKeys: allKeys },
        matchedSms.transactionId
      );
    } else if (!hasTamperOrDup) {
      scheduleOrderFallback(newOrder.id);
    }

    if (isTelegramMode) {
      setSubscribers((prev) => {
        const exists = prev.some((s) => s.telegramUserId === '704118290');
        if (exists) {
          return prev.map((s) =>
            s.telegramUserId === '704118290'
              ? { ...s, isBlocked: false, lastActiveAt: new Date().toISOString() }
              : s
          );
        }
        return [
          {
            id: `sub-${Date.now()}`,
            telegramUserId: '704118290',
            username: '@kyaw_dev',
            firstName: 'Kyaw',
            source: 'MINI_APP',
            isBlocked: false,
            lastActiveAt: new Date().toISOString(),
          },
          ...prev,
        ];
      });
    }

    if (cartCheckoutLines) {
      setCartItems([]);
      setCartCheckoutLines(null);
    }
    setCheckoutProduct(null);
    setSelectedOrderNumber(orderNumber);
    setActiveTab('TRACKER');
  }

  function handleRemoveSavedOrder(orderNumber: string) {
    const next = savedOrders.filter((item) => item.orderNumber !== orderNumber);
    setSavedOrders(next);
    try {
      window.localStorage.setItem(SAVED_ORDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleClearSavedOrders() {
    setSavedOrders([]);
    try {
      window.localStorage.removeItem(SAVED_ORDERS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function handleUpdateProduct(
    productId: string,
    patch: {
      titleEn?: string;
      priceMmk?: number;
      originalPriceMmk?: number | null;
      durationEn?: string;
      imageUrl?: string | null;
    }
  ) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          titleEn: patch.titleEn ?? p.titleEn,
          priceMmk: patch.priceMmk ?? p.priceMmk,
          originalPriceMmk:
            patch.originalPriceMmk !== undefined ? patch.originalPriceMmk : p.originalPriceMmk,
          durationEn: patch.durationEn ?? p.durationEn,
          imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : p.imageUrl,
        };
      })
    );
  }

  function handleLinkSmsToOrder(
    smsId: string,
    orderId: string
  ): { ok: boolean; orderNumber?: string; error?: string } {
    const sms = incomingSmsList.find((s) => s.id === smsId);
    const order = orders.find((o) => o.id === orderId);
    if (!sms) return { ok: false, error: 'Incoming SMS record not found.' };
    if (sms.isMatched) return { ok: false, error: 'SMS is already matched.' };
    if (!order || order.status !== 'PENDING_APPROVAL') {
      return { ok: false, error: 'Selected order is not awaiting payment approval.' };
    }

    clearFallbackTimer(order.id);
    const prod = products.find((p) => p.id === order.productId);
    const warrantyExpiresAt = computePreviewWarrantyExpiry(prod?.durationEn);

    setIncomingSmsList((prev) =>
      prev.map((s) =>
        s.id === smsId ? { ...s, isMatched: true, matchedOrderNumber: order.orderNumber } : s
      )
    );

    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: 'APPROVED',
              deliveredKeys: o.reservedKeys,
              reservedKeys: [],
              reviewedBy: 'Admin (1-Click SMS Link)',
              verificationMode: 'ADMIN_APPROVED',
              escalatedToAdminGroup: false,
              ocrValidationNotes: `Manually linked incoming ${sms.provider} SMS #${sms.transactionId} (${sms.amountMmk.toLocaleString('en-US')} MMK).`,
              warrantyExpiresAt,
              expiryReminderSent: false,
            }
          : o
      )
    );

    setProducts((prev) =>
      prev.map((p) => {
        const line = order.items?.find((it) => it.productId === p.id);
        const qtyDelta = line ? line.quantity : p.id === order.productId ? order.quantity : 0;
        if (qtyDelta === 0) return p;
        return {
          ...p,
          reservedCount: Math.max(0, p.reservedCount - qtyDelta),
          soldCount: p.soldCount + qtyDelta,
        };
      })
    );

    appendAutoVerifiedSideEffects(order, sms.transactionId);
    triggerPreviewHaptic('success');

    return { ok: true, orderNumber: order.orderNumber };
  }

  function handleSendDailySummary(): PreviewDailySummaryReport {
    const now = new Date();
    const yangonTime = new Date(now.getTime() + 6.5 * 60 * 60 * 1000);
    const dateKey = yangonTime.toISOString().slice(0, 10);
    const approvedOrders = orders.filter((o) => o.status === 'APPROVED');
    const totalRevenueMmk = approvedOrders.reduce((sum, o) => sum + o.totalMmk, 0);
    const autoVerifiedCount = approvedOrders.filter(
      (o) => o.verificationMode === 'AUTO_VERIFIED'
    ).length;
    const autoVerifyRatePct =
      approvedOrders.length > 0
        ? Math.round((autoVerifiedCount / approvedOrders.length) * 100)
        : 0;
    const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING_APPROVAL').length;
    const lowStockCount = products.filter((p) => p.isActive && p.availableKeys.length < 5).length;

    setAdminGroupLogs((prev) => [
      {
        id: `log-summary-${Date.now()}`,
        orderNumber: `DAILY-${dateKey}`,
        provider: 'KPAY',
        amountMmk: totalRevenueMmk,
        transactionId: `${approvedOrders.length} ORD / ${autoVerifyRatePct}% AUTO`,
        confidenceScore: null,
        productTitleEn: '23:59 MMT Daily Sales & Auto-Verify Summary',
        quantity: approvedOrders.length,
        dmSent: true,
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      ...prev,
    ]);

    return {
      dateKey,
      totalRevenueMmk,
      approvedOrdersCount: approvedOrders.length,
      autoVerifiedCount,
      autoVerifyRatePct,
      pendingOrdersCount,
      lowStockCount,
      telegramDelivered: true,
    };
  }

  function computePreviewWarrantyExpiry(durationEn?: string): string | null {
    if (!durationEn || /lifetime/i.test(durationEn)) return null;
    const match = durationEn.match(/(\d+)\s*(day|week|month|year)/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const d = new Date();
    if (unit === 'day') d.setDate(d.getDate() + amount);
    else if (unit === 'week') d.setDate(d.getDate() + amount * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() + amount);
    else if (unit === 'year') d.setFullYear(d.getFullYear() + amount);
    return d.toISOString();
  }

  function handleApproveOrder(orderId: string, actorName: string) {
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.status !== 'PENDING_APPROVAL') return;
    clearFallbackTimer(orderId);

    const prod = products.find((p) => p.id === target.productId);
    const warrantyExpiresAt = computePreviewWarrantyExpiry(prod?.durationEn);

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'APPROVED',
              deliveredKeys: o.reservedKeys,
              reservedKeys: [],
              reviewedBy: actorName,
              verificationMode: 'ADMIN_APPROVED',
              warrantyExpiresAt,
              expiryReminderSent: false,
            }
          : o
      )
    );

    setProducts((prev) =>
      prev.map((p) => {
        const line = target.items?.find((it) => it.productId === p.id);
        const qtyDelta = line ? line.quantity : p.id === target.productId ? target.quantity : 0;
        if (qtyDelta === 0) return p;
        return {
          ...p,
          reservedCount: Math.max(0, p.reservedCount - qtyDelta),
          soldCount: p.soldCount + qtyDelta,
        };
      })
    );

    if (target.customerMode === 'TELEGRAM') {
      setDmMessages((prev) => [
        ...prev,
        {
          id: `dm-${Date.now()}`,
          sender: 'BOT',
          text: `Order Approved — ${target.orderNumber}\nသင့်အော်ဒါကို အတည်ပြုပြီး Key များ ပေးပို့လိုက်ပါပြီ။\n\n${target.productTitleEn}:`,
          codeBlocks: target.reservedKeys,
          orderNumberTag: target.orderNumber,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    appendAuditLog({
      actorType: 'ADMIN',
      actorId: actorName,
      actorIp: '172.18.0.1',
      action: 'ORDER_APPROVED',
      entityType: 'Order',
      targetId: target.orderNumber,
      metadata: {
        totalMmk: target.totalMmk,
        verificationMode: 'ADMIN_APPROVED',
      },
    });
  }

  function handleRejectOrder(orderId: string, reason: string, actorName: string) {
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.status !== 'PENDING_APPROVAL') return;
    clearFallbackTimer(orderId);

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'REJECTED',
              reservedKeys: [],
              rejectionReason: reason,
              reviewedBy: actorName,
            }
          : o
      )
    );

    setProducts((prev) =>
      prev.map((p) => {
        const line = target.items?.find((it) => it.productId === p.id);
        if (line) {
          return {
            ...p,
            availableKeys: [...line.reservedKeys, ...p.availableKeys],
            reservedCount: Math.max(0, p.reservedCount - line.quantity),
          };
        }
        if (p.id === target.productId && !target.items?.length) {
          return {
            ...p,
            availableKeys: [...target.reservedKeys, ...p.availableKeys],
            reservedCount: Math.max(0, p.reservedCount - target.quantity),
          };
        }
        return p;
      })
    );

    if (target.promoCode) {
      const normalized = target.promoCode.toUpperCase();
      setPromoCodes((prev) =>
        prev.map((c) =>
          c.code === normalized ? { ...c, usedCount: Math.max(0, c.usedCount - 1) } : c
        )
      );
    }

    if (target.customerMode === 'TELEGRAM') {
      setDmMessages((prev) => [
        ...prev,
        {
          id: `dm-${Date.now()}`,
          sender: 'BOT',
          text: `Order Rejected — ${target.orderNumber}\nReason: ${reason}\n\nသင်တင်ပြထားသော ပြေစာကို အတည်မပြုနိုင်ပါ။ ပြန်လည်စစ်ဆေးပြီး ထပ်မံဝယ်ယူပေးပါ။`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    appendAuditLog({
      actorType: 'ADMIN',
      actorId: actorName,
      actorIp: '172.18.0.1',
      action: 'ORDER_REJECTED',
      entityType: 'Order',
      targetId: target.orderNumber,
      metadata: { reason },
    });
  }

  function handleCustomerBotCommand(cmd: '/start' | '/myorders' | '/support') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: BotDmMessage = {
      id: `u-${Date.now()}`,
      sender: 'USER',
      text: cmd,
      timestamp: time,
    };

    if (cmd === '/start') {
      setDmMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `b-${Date.now() + 1}`,
          sender: 'BOT',
          text: 'Welcome to MMKeyHub!\nInstant Software License Keys, Premium Accounts & VPN Configs in MMK via KPay & WavePay.',
          timestamp: time,
        },
      ]);
      return;
    }

    if (cmd === '/support') {
      setDmMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `b-${Date.now() + 1}`,
          sender: 'BOT',
          text:
            'Customer Support & Warranty Claim\n' +
            'Send `/support <your issue>` below (or click "Reply to Order" on a delivered key) and our team will reply directly to your DM.\n\n' +
            'ဝယ်ယူထားသော Key အဆင်မပြေပါက `/support <အကြောင်းအရာ>` ဟု ပေးပို့နိုင်ပါသည်။',
          timestamp: time,
        },
      ]);
      return;
    }

    const tgOrders = orders.filter((o) => o.customerMode === 'TELEGRAM');
    const summaryLines =
      tgOrders.length === 0
        ? 'You have no Telegram orders yet.'
        : tgOrders
            .map(
              (o) =>
                `${o.orderNumber} — ${o.status}\n${o.productTitleEn} (${o.totalMmk.toLocaleString('en-US')} MMK)`
            )
            .join('\n\n');

    const keys = tgOrders.flatMap((o) => (o.status === 'APPROVED' ? o.deliveredKeys : []));

    setDmMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: `b-${Date.now() + 1}`,
        sender: 'BOT',
        text: `Your Recent Orders / သင့်အော်ဒါများ:\n\n${summaryLines}`,
        codeBlocks: keys.length > 0 ? keys : undefined,
        orderNumberTag: tgOrders[0]?.orderNumber,
        timestamp: time,
      },
    ]);
  }

  function handleSubmitSupportTicket(message: string, referencedOrderNumber?: string | null) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tgOrder =
      (referencedOrderNumber
        ? orders.find((o) => o.orderNumber === referencedOrderNumber)
        : undefined) ?? orders.find((o) => o.customerMode === 'TELEGRAM');

    const ticketNumber = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const newTicket: PreviewSupportTicket = {
      id: `tkt-${Date.now()}`,
      ticketNumber,
      customerLabel: tgOrder?.customerLabel ?? '@kyaw_dev (TG: 704118290)',
      orderNumber: tgOrder?.orderNumber ?? null,
      message,
      status: 'OPEN',
      adminReply: null,
      repliedBy: null,
      createdAt: new Date().toISOString(),
    };

    setSupportTickets((prev) => [newTicket, ...prev]);
    setDmMessages((prev) => [
      ...prev,
      {
        id: `u-sup-${Date.now()}`,
        sender: 'USER',
        text: referencedOrderNumber
          ? `[Reply to ${referencedOrderNumber}] ${message}`
          : `/support ${message}`,
        timestamp: time,
      },
      {
        id: `b-sup-${Date.now() + 1}`,
        sender: 'BOT',
        text:
          `Ticket ${ticketNumber} received and forwarded to MMKeyHub Support.\n` +
          (newTicket.orderNumber ? `Linked Order: ${newTicket.orderNumber}\n` : '') +
          `Admin reply will arrive here automatically.\n\nသင့်မေးမြန်းချက် (${ticketNumber}) ကို Admin အဖွဲ့ထံ ပေးပို့ပြီးပါပြီ။`,
        timestamp: time,
      },
    ]);
  }

  function handleAdminReplyTicket(ticketId: string, replyText: string, actorName: string) {
    const target = supportTickets.find((t) => t.id === ticketId);
    if (!target || target.status !== 'OPEN') return;

    setSupportTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: 'REPLIED', adminReply: replyText, repliedBy: actorName }
          : t
      )
    );

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDmMessages((prev) => [
      ...prev,
      {
        id: `b-rep-${Date.now()}`,
        sender: 'BOT',
        text:
          `Support Reply (${target.ticketNumber}` +
          (target.orderNumber ? ` · ${target.orderNumber}` : '') +
          `)\nFrom: ${actorName}\n\n${replyText}`,
        timestamp: time,
      },
    ]);
  }

  function handleSendBroadcast(payload: {
    message: string;
    photoUrl?: string;
    promoCode?: string;
  }) {
    const activeSubs = subscribers.filter((s) => !s.isBlocked);
    const blockedCount = subscribers.length - activeSubs.length;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setDmMessages((prev) => [
      ...prev,
      {
        id: `b-cast-${Date.now()}`,
        sender: 'BOT',
        text: `MMKeyHub Announcement\n\n${payload.message}`,
        photoUrl: payload.photoUrl ?? null,
        promoCodeCta: payload.promoCode ?? null,
        timestamp: time,
      },
    ]);

    appendAuditLog({
      actorType: 'ADMIN',
      actorId: 'web-admin',
      actorIp: '172.18.0.1',
      action: 'BROADCAST_SENT',
      entityType: 'Broadcast',
      targetId: payload.promoCode || 'ALL_SUBSCRIBERS',
      metadata: {
        sentCount: activeSubs.length,
        blockedCount,
      },
    });

    return {
      totalTargets: activeSubs.length,
      sentCount: activeSubs.length,
      failedCount: 0,
      blockedCount,
    };
  }

  function handleRunExpiryReminderSweep(): number {
    const now = Date.now();
    const horizon = now + 48 * 60 * 60 * 1000;
    const due = orders.filter((o) => {
      if (o.status !== 'APPROVED' || o.expiryReminderSent || !o.warrantyExpiresAt) return false;
      const exp = Date.parse(o.warrantyExpiresAt);
      return Number.isFinite(exp) && exp > now && exp <= horizon;
    });

    if (due.length === 0) return 0;

    const dueIds = new Set(due.map((d) => d.id));
    setOrders((prev) =>
      prev.map((o) => (dueIds.has(o.id) ? { ...o, expiryReminderSent: true } : o))
    );

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDmMessages((prev) => [
      ...prev,
      ...due.map((o, idx) => ({
        id: `b-exp-${Date.now()}-${idx}`,
        sender: 'BOT' as const,
        text:
          `Subscription / Warranty Reminder — ${o.orderNumber}\n` +
          `Product: ${o.productTitleEn}\n` +
          `Expires on: ${o.warrantyExpiresAt ? new Date(o.warrantyExpiresAt).toLocaleString() : 'Soon'}\n\n` +
          `သင့်ဝန်ဆောင်မှုသက်တမ်း ကုန်ဆုံးရန် ၄၈ နာရီအတွင်း ရောက်ရှိနေပါပြီ။ ဆက်လက်အသုံးပြုလိုပါက Mini App မှ သက်တမ်းတိုးနိုင်ပါသည်။`,
        promoCodeCta: promoCodes.find((p) => p.isActive)?.code ?? null,
        timestamp: time,
      })),
    ]);

    return due.length;
  }

  function handleDownloadReceiptTxt(order: PreviewOrder) {
    const lines = [
      '============================================================',
      '                   MMKEYHUB DIGITAL RECEIPT                 ',
      '============================================================',
      `Order Number    : ${order.orderNumber}`,
      `Status          : ${order.status}`,
      `Created At      : ${new Date(order.createdAt).toLocaleString()}`,
      `Product         : ${order.productTitleEn}`,
      `Quantity        : ${order.quantity}`,
      ...(order.items && order.items.length > 1
        ? [
            'Items Breakdown :',
            ...order.items.map(
              (item) =>
                `  - ${item.productTitleEn} x ${item.quantity} (${item.subtotalMmk.toLocaleString('en-US')} MMK)`
            ),
          ]
        : []),
      `Payment Method  : ${order.paymentProvider}${order.transactionLast6 ? ` (#${order.transactionLast6})` : ''}`,
      `Subtotal (MMK)  : ${order.subtotalMmk.toLocaleString('en-US')} MMK`,
      `Discount (MMK)  : -${order.discountMmk.toLocaleString('en-US')} MMK${order.promoCode ? ` (${order.promoCode})` : ''}`,
      `Total Paid      : ${order.totalMmk.toLocaleString('en-US')} MMK`,
      `Customer        : ${order.customerLabel}`,
      '------------------------------------------------------------',
      'UNLOCKED CREDENTIALS:',
      ...order.deliveredKeys.map((k, idx) => `  [${idx + 1}] ${k}`),
      '------------------------------------------------------------',
      'ACTIVATION INSTRUCTIONS:',
      order.instructionsEn,
      '============================================================',
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MMKeyHub-Receipt-${order.orderNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleCopyKey(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      triggerPreviewHaptic('success');
      setCopiedKey(secret);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore
    }
  }

  async function handleCopyAllKeys(orderNumber: string, keys: string[]) {
    if (keys.length === 0) return;
    try {
      await navigator.clipboard.writeText(keys.join('\n'));
      triggerPreviewHaptic('success');
      setCopiedAllOrderNumber(orderNumber);
      setTimeout(() => setCopiedAllOrderNumber(null), 1800);
    } catch {
      // ignore
    }
  }

  function handleTrackerSearch(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = orderLookupInput.trim().toUpperCase();
    if (!cleaned) return;
    setSelectedOrderNumber(cleaned);
    setActiveTab('TRACKER');
  }

  const currentTicker = recentPurchaseFeed[tickerIndex % recentPurchaseFeed.length];

  if (isAdminPortal) {
    return (
      <div className="min-h-screen bg-[#0B0F17] text-slate-50">
        <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0B0F17]/95 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
            <div className="flex items-center gap-2.5">
              <img
                src={merchantSettings.brandLogoUrl || '/assets/aistudio/image_dd126173.png'}
                alt="MMKeyHub"
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/15"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-slate-50 sm:text-base">
                  MMKeyHub
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span>Admin Portal</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={exitAdminPortal}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs font-medium text-slate-200 hover:border-emerald-500/40 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Return to Storefront</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <PreviewAdminPanel
            products={products}
            orders={orders}
            incomingSmsList={incomingSmsList}
            merchantSettings={merchantSettings}
            paymentMethods={paymentMethods}
            promoCodes={promoCodes}
            subscribers={subscribers}
            auditLogs={auditLogs}
            onUpdateMerchantSettings={(next) => {
              setMerchantSettings(next);
              appendAuditLog({
                actorType: 'ADMIN',
                actorId: 'web-admin',
                actorIp: '172.18.0.1',
                action: 'MERCHANT_SETTINGS_UPDATED',
                entityType: 'MerchantSettings',
                targetId: 'default',
                metadata: { isShopOpen: next.isShopOpen },
              });
            }}
            onAddProduct={(newProd) => {
              const id = `prod-${Date.now()}`;
              setProducts((prev) => [
                {
                  ...newProd,
                  id,
                  availableKeys: [],
                  reservedCount: 0,
                  soldCount: 0,
                },
                ...prev,
              ]);
              appendAuditLog({
                actorType: 'ADMIN',
                actorId: 'web-admin',
                actorIp: '172.18.0.1',
                action: 'PRODUCT_CREATED',
                entityType: 'Product',
                targetId: newProd.titleEn,
                metadata: { priceMmk: newProd.priceMmk, deliveryFormat: newProd.deliveryFormat },
              });
            }}
            onUpdateProduct={handleUpdateProduct}
            onToggleProductActive={(productId) => {
              setProducts((prev) =>
                prev.map((p) => (p.id === productId ? { ...p, isActive: !p.isActive } : p))
              );
            }}
            onBulkUploadStock={(productId, lines) => {
              const target = products.find((p) => p.id === productId);
              if (!target) return { inserted: 0, skipped: 0 };
              const existing = new Set(target.availableKeys);
              const fresh = lines.filter((l) => {
                if (existing.has(l)) return false;
                existing.add(l);
                return true;
              });
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === productId
                    ? { ...p, availableKeys: [...p.availableKeys, ...fresh] }
                    : p
                )
              );
              appendAuditLog({
                actorType: 'ADMIN',
                actorId: 'web-admin',
                actorIp: '172.18.0.1',
                action: 'STOCK_UPLOADED',
                entityType: 'Product',
                targetId: productId,
                metadata: {
                  insertedCount: fresh.length,
                  skippedDuplicates: lines.length - fresh.length,
                },
              });
              return { inserted: fresh.length, skipped: lines.length - fresh.length };
            }}
            onApproveOrder={handleApproveOrder}
            onRejectOrder={handleRejectOrder}
            onSimulateIncomingSms={handleSimulateIncomingSms}
            onLinkSmsToOrder={handleLinkSmsToOrder}
            onSendDailySummary={handleSendDailySummary}
            onUpdatePaymentMethod={(prov, next) => {
              const prevMethod = paymentMethods[prov];
              const sensitiveChanged =
                prevMethod.accountPhone !== next.accountPhone ||
                prevMethod.accountName !== next.accountName;
              setPaymentMethods((prev) => ({ ...prev, [prov]: next }));
              appendAuditLog({
                actorType: 'ADMIN',
                actorId: 'web-admin',
                actorIp: '172.18.0.1',
                action: 'MERCHANT_SETTINGS_UPDATED',
                entityType: 'PaymentMethod',
                targetId: prov,
                metadata: {
                  previousPhone: prevMethod.accountPhone,
                  nextPhone: next.accountPhone,
                  previousName: prevMethod.accountName,
                  nextName: next.accountName,
                  sensitiveChanged,
                },
              });
              if (sensitiveChanged) {
                setAdminGroupLogs((prev) => [
                  {
                    id: `log-canary-${Date.now()}`,
                    orderNumber: `🚨 CRITICAL SECURITY ALERT (${prov})`,
                    provider: prov,
                    amountMmk: 0,
                    transactionId: `${prevMethod.accountPhone} -> ${next.accountPhone}`,
                    confidenceScore: null,
                    productTitleEn: `Canary: Merchant ${prov} payout account modified (${next.accountName})`,
                    quantity: 1,
                    dmSent: false,
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                  ...prev,
                ]);
              }
            }}
            onCreatePromoCode={(promo) => {
              const exists = promoCodes.some(
                (c) => c.code.toUpperCase() === promo.code.toUpperCase()
              );
              if (exists) {
                return { ok: false, error: `Promo code ${promo.code} already exists.` };
              }
              setPromoCodes((prev) => [
                {
                  ...promo,
                  id: `promo-${Date.now()}`,
                  usedCount: 0,
                },
                ...prev,
              ]);
              appendAuditLog({
                actorType: 'ADMIN',
                actorId: 'web-admin',
                actorIp: '172.18.0.1',
                action: 'PROMO_CREATED',
                entityType: 'PromoCode',
                targetId: promo.code.toUpperCase(),
                metadata: {
                  discountType: promo.discountType,
                  discountValue: promo.discountValue,
                },
              });
              return { ok: true };
            }}
            onTogglePromoActive={(promoId) => {
              setPromoCodes((prev) =>
                prev.map((c) => (c.id === promoId ? { ...c, isActive: !c.isActive } : c))
              );
            }}
            onSendBroadcast={handleSendBroadcast}
            onRunExpiryReminderSweep={handleRunExpiryReminderSweep}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-50 transition-colors">
      {/* Strict 3-Zone Top Bar Contract (Public Storefront Only — Admin Portal Isolated) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0B0F17]/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:gap-6 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab('CATALOG')}
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {merchantSettings.brandLogoUrl ? (
              <img
                src={merchantSettings.brandLogoUrl}
                alt="MMKeyHub"
                className="h-8 w-8 rounded-lg object-contain"
              />
            ) : (
              <img
                src="/assets/aistudio/image_dd126173.png"
                alt="MMKeyHub"
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/15"
              />
            )}
            <span>MMKeyHub</span>
          </button>

          <nav className="flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600 dark:text-slate-400 sm:gap-6 sm:text-sm">
            {(
              [
                { id: 'CATALOG', label: isMm ? 'ကုန်ပစ္စည်းများ' : 'Catalog' },
                { id: 'TRACKER', label: isMm ? 'အော်ဒါစစ်ရန်' : 'Order Tracker' },
                { id: 'BOT', label: 'Telegram Bot' },
              ] as Array<{ id: PreviewTab; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label="Open shopping cart"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <ShoppingCart className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span className="hidden sm:inline">{isMm ? 'စျေးခြင်း' : 'Cart'}</span>
              {totalCartUnits > 0 && (
                <span className="font-mono-tabular rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {totalCartUnits}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMyOrdersOpen(true)}
              className="hidden sm:inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <ReceiptText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{isMm ? 'ကျွန်ုပ်၏အော်ဒါများ' : 'My Orders'}</span>
              {savedOrders.length > 0 && (
                <span className="font-mono-tabular rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {savedOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setLocale((l) => (l === 'en' ? 'mm' : 'en'))}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 dark:hover:border-white/25 whitespace-nowrap cursor-pointer"
            >
              <Languages className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{locale === 'en' ? 'EN / မြန်မာ' : 'မြန်မာ / EN'}</span>
            </button>
          </div>
        </div>
      </header>

      {cartToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-18 right-4 z-40 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-white px-4 py-2.5 text-xs font-medium text-emerald-700 shadow-lg dark:bg-[#121826] dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          <span>{cartToast}</span>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-10 md:pb-12">
        {activeTab === 'CATALOG' && (
          <div className="space-y-8">
            {/* Sleek Live Recent Purchases Ticker Banner */}
            {currentTicker && (
              <div
                aria-live="polite"
                className="flex min-h-[38px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-xs dark:border-white/[0.08] dark:bg-[#121826]/90 dark:text-slate-300"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <p className={`truncate ${isMm ? 'font-myanmar-safe' : ''}`}>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {currentTicker.maskedBuyer}
                    </span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      {isMm ? 'မှ' : 'just purchased'}
                    </span>{' '}
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      {isMm ? currentTicker.productTitleMm : currentTicker.productTitleEn} (
                      {isMm ? currentTicker.durationMm : currentTicker.durationEn})
                    </span>
                    {isMm ? ' ဝယ်ယူပြီးပါပြီ' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {isMm
                      ? `လွန်ခဲ့သော ${currentTicker.minutesAgo} မိနစ်`
                      : `${currentTicker.minutesAgo} ${currentTicker.minutesAgo === 1 ? 'min' : 'mins'} ago`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTickerIndex((prev) => (prev + 1) % recentPurchaseFeed.length)
                    }
                    aria-label="Next recent purchase"
                    className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#182133] dark:hover:text-slate-100 cursor-pointer"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* Hero Banner Slider & Flash Sale Timer */}
            <PreviewHeroSlider
              locale={locale}
              slides={merchantSettings.heroSlides}
              flashSaleEndsAt={merchantSettings.flashSaleEndsAt}
              flashSaleLabelEn={merchantSettings.flashSaleLabelEn}
              flashSaleLabelMm={merchantSettings.flashSaleLabelMm}
              onSelectCategory={(cat) => {
                triggerPreviewHaptic('selection');
                setCategoryFilter(cat);
              }}
              rightSlot={
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#0B0F17]/90 sm:p-5">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {isMm ? 'စမ်းသပ်ကြည့်ရှုမည့် ပတ်ဝန်းကျင်' : 'Checkout Identity Mode'}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/[0.08] dark:bg-[#121826]">
                      <button
                        type="button"
                        onClick={() => setIsTelegramMode(false)}
                        className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium cursor-pointer ${
                          !isTelegramMode
                            ? 'bg-emerald-500 text-slate-950 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Web Guest</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTelegramMode(true)}
                        className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium cursor-pointer ${
                          isTelegramMode
                            ? 'bg-emerald-500 text-slate-950 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Telegram Mini App</span>
                      </button>
                    </div>
                  </div>

                  <form
                    onSubmit={handleTrackerSearch}
                    className="border-t border-slate-200 pt-3 dark:border-white/[0.06]"
                  >
                    <label
                      htmlFor="hero-order-search"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      {isMm ? 'အော်ဒါနံပါတ်ဖြင့် စစ်ရန်' : 'Quick Order Lookup'}
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="hero-order-search"
                        type="text"
                        value={orderLookupInput}
                        onChange={(e) => setOrderLookupInput(e.target.value)}
                        placeholder={orders[0]?.orderNumber ?? 'MMK-20261115-...'}
                        className="font-mono-tabular min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-white/[0.12] dark:bg-[#121826] dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="submit"
                        className="min-h-[40px] rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-[#182133] dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        {isMm ? 'စစ်မည်' : 'Track'}
                      </button>
                    </div>
                  </form>
                </div>
              }
            />

            {/* Filter Tabs & Search */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-xs dark:border-white/[0.08] dark:bg-[#121826]">
                {(
                  [
                    { key: 'ALL', label: isMm ? 'အားလုံး' : 'All' },
                    { key: 'LICENSE_KEY', label: 'License Keys' },
                    { key: 'ACCOUNT_LOGIN', label: 'Accounts' },
                    { key: 'VPN_CONFIG', label: 'VPN' },
                  ] as Array<{ key: CategoryFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      triggerPreviewHaptic('selection');
                      setCategoryFilter(tab.key);
                    }}
                    className={`min-h-[40px] rounded-lg px-3.5 text-xs font-medium transition-colors cursor-pointer sm:text-sm ${
                      categoryFilter === tab.key
                        ? 'bg-emerald-500 text-slate-950 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#182133] dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isMm ? 'ပစ္စည်းရှာဖွေရန်...' : 'Search products...'}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* 3-Column Glassmorphism Product Catalog */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const inStock = product.availableKeys.length > 0;
                const vendor = detectPreviewVendor(product.titleEn, product.deliveryFormat);
                const flashSaleOff =
                  product.originalPriceMmk && product.originalPriceMmk > product.priceMmk
                    ? Math.round(
                        ((product.originalPriceMmk - product.priceMmk) / product.originalPriceMmk) *
                          100
                      )
                    : 0;
                return (
                  <article
                    key={product.id}
                    className="kv-glass-card group flex flex-col rounded-xl border border-slate-200 dark:border-white/[0.08]"
                  >
                    <PreviewProductVisual
                      imageUrl={product.imageUrl}
                      title={isMm ? product.titleMm : product.titleEn}
                      deliveryFormat={product.deliveryFormat}
                    />

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={`font-medium ${vendor.accentTextClass}`}>
                          {vendor.name}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{isMm ? product.categoryNameMm : product.categoryNameEn}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {isMm ? product.durationMm : product.durationEn}
                        </span>
                      </div>

                      <h2
                        className={`mt-2 text-base font-semibold text-slate-900 dark:text-slate-50 ${
                          isMm ? 'font-myanmar-safe' : ''
                        }`}
                      >
                        {isMm ? product.titleMm : product.titleEn}
                      </h2>
                      <p
                        className={`mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400 ${
                          isMm ? 'font-myanmar-safe' : 'leading-relaxed'
                        }`}
                      >
                        {isMm ? product.descriptionMm : product.descriptionEn}
                      </p>

                      <div className="mt-auto pt-5">
                        <div className="flex items-end justify-between gap-2 border-t border-slate-200 pt-4 dark:border-white/[0.06]">
                          <div>
                            {flashSaleOff > 0 && product.originalPriceMmk && (
                              <div className="mb-0.5 flex items-center gap-2 text-xs">
                                <span className="font-mono-tabular text-slate-400 line-through dark:text-slate-500">
                                  {product.originalPriceMmk.toLocaleString('en-US')} MMK
                                </span>
                                <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                                  {flashSaleOff}% OFF
                                </span>
                              </div>
                            )}
                            <span className="font-mono-tabular text-lg font-semibold text-slate-900 dark:text-slate-50">
                              {product.priceMmk.toLocaleString('en-US')} MMK
                            </span>
                          </div>
                          <span
                            className={`font-mono-tabular text-xs font-medium ${
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
                          </span>
                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                triggerPreviewHaptic('light');
                                setDetailsProduct(product);
                              }}
                              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 hover:border-emerald-500/40 hover:text-slate-900 dark:border-white/[0.12] dark:bg-[#0B0F17]/80 dark:text-slate-200 dark:hover:text-white transition-colors cursor-pointer"
                            >
                              <BookOpen
                                className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-hidden="true"
                              />
                              <span className="truncate">{isMm ? 'အသေးစိတ်' : 'Details'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={!inStock}
                              onClick={() => handleAddToCart(product)}
                              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300 cursor-pointer"
                            >
                              <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{isMm ? 'ခြင်းထည့်မည်' : 'Add to Cart'}</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!inStock}
                            onClick={() => {
                              triggerPreviewHaptic('light');
                              setCheckoutProduct(product);
                            }}
                            className="flex min-h-[42px] w-full items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 cursor-pointer"
                          >
                            {inStock
                              ? isMm
                                ? 'ချက်ချင်းဝယ်ယူမည်'
                                : 'Buy Now'
                              : isMm
                                ? 'ကုန်နေပါသည်'
                                : 'Out of Stock'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'TRACKER' && (
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderNumber(o.orderNumber)}
                    className={`font-mono-tabular rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                      activeOrder?.orderNumber === o.orderNumber
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 font-semibold dark:text-emerald-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {o.orderNumber}
                  </button>
                ))}
              </div>
              {activeOrder?.status === 'PENDING_APPROVAL' && (
                <div className="flex flex-wrap items-center gap-2">
                  {!(activeOrder.ocrTamperingFlags && activeOrder.ocrTamperingFlags.length > 0) &&
                    !activeOrder.isDuplicateTxWarning && (
                      <button
                        type="button"
                        onClick={() => {
                          const txId =
                            activeOrder.ocrExtractedTxId ||
                            `010099${activeOrder.transactionLast6 || '551199'}`;
                          handleSimulateIncomingSms({
                            provider: activeOrder.paymentProvider,
                            transactionId: txId,
                            amountMmk: activeOrder.totalMmk,
                            senderInfo: activeOrder.customerLabel,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Simulate Matching Bank SMS (Unlock Now)</span>
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('BOT')}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
                  >
                    Open Telegram Bot
                  </button>
                </div>
              )}
            </div>

            {activeOrder ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 shadow-xs dark:border-white/[0.08] dark:bg-[#121826]">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/[0.08]">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isMm ? 'အော်ဒါအခြေအနေ' : 'Order Status & Key Delivery'}
                    </p>
                    <h1 className="font-mono-tabular mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                      {activeOrder.orderNumber}
                    </h1>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Live Status</span>
                  </span>
                </div>

                {/* 3-Step 24/7 Automated Verification Pipeline */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {isMm
                        ? '24/7 အလိုအလျောက် စစ်ဆေးမှု အဆင့်များ'
                        : '24/7 Automated Verification Pipeline'}
                    </span>
                    <span className="font-mono-tabular text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {activeOrder.verificationMode}
                      {activeOrder.ocrConfidenceScore != null
                        ? ` · OCR ${Math.round(activeOrder.ocrConfidenceScore * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 text-xs">
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        activeOrder.ocrTamperingFlags && activeOrder.ocrTamperingFlags.length > 0
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      }`}
                    >
                      <ScanSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {activeOrder.ocrTamperingFlags && activeOrder.ocrTamperingFlags.length > 0
                          ? '1. AI OCR Flagged'
                          : '1. AI Receipt Scanned'}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        activeOrder.status === 'APPROVED'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                          : activeOrder.verificationMode === 'MANUAL_REVIEW'
                            ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-300'
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {activeOrder.status === 'APPROVED'
                          ? '2. Bank Ledger Verified'
                          : activeOrder.verificationMode === 'MANUAL_REVIEW'
                            ? '2. Admin Manual Review'
                            : '2. Matching Bank SMS...'}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                        activeOrder.status === 'APPROVED'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                          : 'border-slate-200 bg-white text-slate-500 dark:border-white/[0.08] dark:bg-[#121826] dark:text-slate-400'
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {activeOrder.status === 'APPROVED'
                          ? '3. Instant Key Unlocked!'
                          : '3. Key Unlock Pending'}
                      </span>
                    </div>
                  </div>
                  {activeOrder.ocrValidationNotes && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {activeOrder.ocrValidationNotes}
                    </p>
                  )}
                </div>

                {activeOrder.status === 'PENDING_APPROVAL' && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {activeOrder.verificationMode === 'MANUAL_REVIEW'
                          ? isMm
                            ? 'Admin မှ ကိုယ်တိုင်စစ်ဆေးနေဆဲ'
                            : 'Escalated to Admin Manual Review'
                          : isMm
                            ? 'ဘဏ် SMS နှင့် တိုက်ဆိုင်စစ်ဆေးနေဆဲ...'
                            : 'Awaiting Instant Bank SMS Match (60s window)'}
                      </span>
                    </div>
                    <p
                      className={`mt-1.5 text-sm text-slate-700 dark:text-slate-200 ${
                        isMm ? 'font-myanmar-safe' : ''
                      }`}
                    >
                      {activeOrder.verificationMode === 'MANUAL_REVIEW'
                        ? 'AI Vision flagged a discrepancy or duplicate Tx ID — admins in @MMKeyHubAdmins can approve/reject immediately.'
                        : isMm
                          ? 'သင့်အတွက် Key ကို ယာယီထိန်းသိမ်းထားပါသည်။ အပေါ်ရှိ "Simulate Matching Bank SMS" ကိုနှိပ်၍ 24/7 အလိုအလျောက် Key ထုတ်ပေးမှုကို စမ်းသပ်နိုင်ပါသည်။'
                          : 'Your stock item is reserved. Click "Simulate Matching Bank SMS" above or push a KPay/WavePay SMS in Telegram Bot to unlock automatically.'}
                    </p>
                  </div>
                )}

                {activeOrder.status === 'APPROVED' && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {activeOrder.verificationMode === 'AUTO_VERIFIED'
                          ? isMm
                            ? '24/7 AI + SMS အလိုအလျောက် အတည်ပြုပြီး · ပေးပို့ပြီး'
                            : 'Auto-Verified 24/7 · Key Unlocked Instantly'
                          : isMm
                            ? 'အတည်ပြုပြီး · ပေးပို့ပြီး'
                            : 'Approved · Delivered'}
                      </span>
                    </div>
                  </div>
                )}

                {activeOrder.status === 'REJECTED' && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      <span>{isMm ? 'ငွေလွှဲပယ်ချခံရသည်' : 'Payment Rejected'}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {activeOrder.rejectionReason}
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-white/[0.08] dark:bg-[#0B0F17]">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeOrder.items && activeOrder.items.length > 1 ? 'Items' : 'Product'}
                      </p>
                      <p
                        className={`mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 ${
                          isMm ? 'font-myanmar-safe' : ''
                        }`}
                      >
                        {isMm ? activeOrder.productTitleMm : activeOrder.productTitleEn} ×{' '}
                        {activeOrder.quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                      <p className="font-mono-tabular mt-0.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {activeOrder.totalMmk.toLocaleString('en-US')} MMK
                      </p>
                      {activeOrder.discountMmk > 0 && (
                        <p className="font-mono-tabular mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                          -{activeOrder.discountMmk.toLocaleString('en-US')} MMK (
                          {activeOrder.promoCode ?? 'Promo'})
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Payment</p>
                      <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">
                        {activeOrder.paymentProvider}
                        {activeOrder.transactionLast6 ? ` · #${activeOrder.transactionLast6}` : ''}
                      </p>
                    </div>
                  </div>

                  {activeOrder.items && activeOrder.items.length > 1 && (
                    <div className="border-t border-slate-200 pt-2.5 space-y-1 text-xs dark:border-white/[0.06]">
                      {activeOrder.items.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between text-slate-600 dark:text-slate-300"
                        >
                          <span className={isMm ? 'font-myanmar-safe' : ''}>
                            {isMm ? item.productTitleMm : item.productTitleEn} × {item.quantity}
                          </span>
                          <span className="font-mono-tabular">
                            {item.subtotalMmk.toLocaleString('en-US')} MMK
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {activeOrder.status === 'APPROVED' && (
                  <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-slate-50 p-5 dark:bg-[#0B0F17]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {isMm
                            ? 'သင့်ဒစ်ဂျစ်တယ် Key / Config များ'
                            : 'Unlocked Digital Credentials'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {activeOrder.deliveredKeys.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyAllKeys(activeOrder.orderNumber, activeOrder.deliveredKeys)
                            }
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 cursor-pointer"
                          >
                            {copiedAllOrderNumber === activeOrder.orderNumber ? (
                              <>
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isMm ? 'အားလုံးကူးယူပြီး' : 'All Copied'}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  {isMm
                                    ? `Key အားလုံးကူးယူမည် (${activeOrder.deliveredKeys.length})`
                                    : `Copy All Keys (${activeOrder.deliveredKeys.length})`}
                                </span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadReceiptTxt(activeOrder)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#182133] dark:text-slate-100 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span>
                            {isMm ? 'Receipt / Keys (.txt) သိမ်းမည်' : 'Download Receipt / Keys (.txt)'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {activeOrder.deliveredKeys.map((secret, idx) => (
                      <div
                        key={secret}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/[0.08] dark:bg-[#121826]"
                      >
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyKey(secret)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-white/[0.12] dark:bg-[#182133] dark:text-slate-100 cursor-pointer"
                          >
                            {copiedKey === secret ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Copy Key</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <pre className="font-mono-tabular flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-emerald-700 select-all dark:border-transparent dark:bg-[#0B0F17] dark:text-emerald-300">
                            {secret}
                          </pre>
                          {isPreviewVpnUri(secret) && (
                            <PreviewVpnQrCode value={secret} size={112} />
                          )}
                        </div>
                      </div>
                    ))}

                    <p className={`text-xs text-slate-600 dark:text-slate-400 ${isMm ? 'font-myanmar-safe' : ''}`}>
                      {isMm ? activeOrder.instructionsMm : activeOrder.instructionsEn}
                    </p>

                    {activeOrder.customerMode === 'WEB' &&
                      activeOrder.customerLabel.includes('@') && (
                        <p className="flex items-center gap-1.5 border-t border-slate-200 pt-2.5 text-xs text-emerald-700 dark:border-white/[0.06] dark:text-emerald-300">
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isMm
                              ? `Email (${activeOrder.customerLabel}) သို့လည်း Key မိတ္တူ ပေးပို့ထားပါသည်။`
                              : `Email copy dispatched via SMTP to ${activeOrder.customerLabel}.`}
                          </span>
                        </p>
                      )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'BOT' && (
          <PreviewTelegramBot
            orders={orders}
            products={products}
            dmMessages={dmMessages}
            supportTickets={supportTickets}
            incomingSmsList={incomingSmsList}
            adminGroupLogs={adminGroupLogs}
            onApproveOrder={handleApproveOrder}
            onRejectOrder={handleRejectOrder}
            onSimulateIncomingSms={handleSimulateIncomingSms}
            onEscalateOrderNow={handleEscalateOrderNow}
            onCustomerCommand={handleCustomerBotCommand}
            onSubmitSupportTicket={handleSubmitSupportTicket}
            onAdminReplyTicket={handleAdminReplyTicket}
            onOpenMiniApp={(prefillPromoCode) => {
              setIsTelegramMode(true);
              if (prefillPromoCode) {
                setPendingPromoCode(prefillPromoCode);
              }
              setActiveTab('CATALOG');
            }}
          />
        )}
      </main>

      {/* Compact Floating Telegram Support Trigger (Desktop only on mobile sticky nav handles support) */}
      <div className="fixed bottom-4 right-4 z-30 hidden flex-col items-end gap-2 md:flex">
          {supportOpen && (
            <div className="w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl space-y-3 dark:border-white/[0.12] dark:bg-[#121826]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {isMm ? 'အကူအညီနှင့် Warranty တောင်းဆိုရန်' : 'Telegram Support & Warranty'}
                  </h3>
                  <p className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${isMm ? 'font-myanmar-safe' : ''}`}>
                    {isMm
                      ? 'Key အဆင်မပြေမှု သို့မဟုတ် Warranty စစ်ဆေးလိုပါက Bot မှတစ်ဆင့် ဆက်သွယ်ပါ။'
                      : 'Need help or warranty replacement? Message @MMKeyHubBot with /support.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSupportOpen(false)}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Close support popover"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSupportOpen(false);
                    setActiveTab('BOT');
                    handleCustomerBotCommand('/support');
                  }}
                  className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isMm ? 'Bot Simulator တွင် စမ်းသပ်မည်' : 'Open Bot /support Simulator'}</span>
                </button>
                <a
                  href="https://t.me/MMKeyHubBot?start=support"
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#0B0F17] dark:text-slate-200"
                >
                  <span>t.me/MMKeyHubBot?start=support</span>
                  <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSupportOpen((prev) => !prev)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-emerald-500/35 bg-white/95 px-3.5 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur-md hover:border-emerald-400 dark:bg-[#121826]/95 dark:text-slate-100 cursor-pointer"
          >
            <LifeBuoy className="h-4 w-4 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
            <span>{isMm ? 'Telegram အကူအညီ' : 'Support'}</span>
          </button>
        </div>

      {/* Sticky Mobile Bottom Thumb-Zone Navigation (<= 15% total sticky chrome height) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-40 grid h-14 grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0B0F17]/95 md:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab('CATALOG')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeTab === 'CATALOG'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          <span>{isMm ? 'ဆိုင်' : 'Catalog'}</span>
        </button>

        <button
          type="button"
          onClick={() => setCartDrawerOpen(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
        >
          <div className="relative">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {totalCartUnits > 0 && (
              <span className="font-mono-tabular absolute -right-2.5 -top-1.5 rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-slate-950">
                {totalCartUnits}
              </span>
            )}
          </div>
          <span>{isMm ? 'စျေးခြင်း' : 'Cart'}</span>
        </button>

        <button
          type="button"
          onClick={() => setMyOrdersOpen(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
        >
          <div className="relative">
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            {savedOrders.length > 0 && (
              <span className="font-mono-tabular absolute -right-2.5 -top-1.5 rounded-full bg-slate-200 px-1 text-[9px] font-bold text-slate-900 dark:bg-white/20 dark:text-slate-100">
                {savedOrders.length}
              </span>
            )}
          </div>
          <span>{isMm ? 'အော်ဒါ' : 'Orders'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('BOT');
            handleCustomerBotCommand('/support');
          }}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeTab === 'BOT'
              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          <span>{isMm ? 'အကူအညီ' : 'Support'}</span>
        </button>
      </nav>

      <PreviewDetailsModal
        product={detailsProduct}
        locale={locale}
        isTelegramMode={isTelegramMode}
        onHaptic={triggerPreviewHaptic}
        onClose={() => setDetailsProduct(null)}
        onAddToCart={(prod) => handleAddToCart(prod)}
        onProceedToBuy={(prod) => setCheckoutProduct(prod)}
      />

      <PreviewCheckoutModal
        product={checkoutProduct}
        cartItems={cartCheckoutLines}
        locale={locale}
        isTelegramMode={isTelegramMode}
        merchantSettings={merchantSettings}
        paymentMethods={paymentMethods}
        promoCodes={promoCodes}
        existingOrders={orders}
        initialPromoCode={pendingPromoCode}
        onHaptic={triggerPreviewHaptic}
        onClose={() => {
          setCheckoutProduct(null);
          setCartCheckoutLines(null);
        }}
        onSubmitOrder={(payload) => {
          setPendingPromoCode(null);
          handleSubmitOrder(payload);
        }}
      />

      {/* Multi-Item Shopping Cart Slide-Over Drawer */}
      {cartDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping Cart"
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-[#121826]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/[0.08]">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {isMm ? 'သင့်စျေးခြင်း' : 'Shopping Cart'} ({totalCartUnits})
                </h2>
                <p className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${isMm ? 'font-myanmar-safe' : ''}`}>
                  {isMm
                    ? 'ပစ္စည်းများစွာကို အော်ဒါတစ်ခုတည်းဖြင့် စုပေါင်းငွေရှင်းနိုင်ပါသည်။'
                    : 'Bundle multiple keys, accounts & VPNs under one KPay / WavePay payment.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-white/[0.1] dark:text-slate-400 dark:hover:text-white cursor-pointer"
                aria-label="Close cart drawer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {resolvedCartLines.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 dark:border-white/[0.08] dark:bg-[#0B0F17] dark:text-slate-400">
                  {isMm
                    ? 'စျေးခြင်းထဲတွင် ပစ္စည်းမရှိသေးပါ။'
                    : 'Your cart is empty. Add items from the catalog to check out together.'}
                </div>
              ) : (
                resolvedCartLines.map((line) => (
                  <div
                    key={line.product.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 dark:border-white/[0.08] dark:bg-[#0B0F17]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {isMm ? line.product.titleMm : line.product.titleEn}
                        </p>
                        <p className="font-mono-tabular mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          {line.product.priceMmk.toLocaleString('en-US')} MMK each
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(line.product.id)}
                        aria-label={`Remove ${line.product.titleEn}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2.5 dark:border-white/[0.06]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(line.product.id, line.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className="font-mono-tabular w-5 text-center text-xs font-semibold">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={
                            line.quantity >= Math.min(10, line.product.availableKeys.length)
                          }
                          onClick={() => handleUpdateCartQty(line.product.id, line.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 dark:border-white/[0.1] dark:bg-[#121826] dark:text-slate-200 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="font-mono-tabular text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {(line.product.priceMmk * line.quantity).toLocaleString('en-US')} MMK
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {resolvedCartLines.length > 0 && (
              <div className="border-t border-slate-200 p-4 space-y-3 dark:border-white/[0.08]">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-600 dark:text-slate-300">
                    {isMm ? 'စုစုပေါင်း' : 'Subtotal'}
                  </span>
                  <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400">
                    {cartSubtotalMmk.toLocaleString('en-US')} MMK
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCartItems([])}
                    className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 hover:text-rose-500 dark:border-white/[0.1] dark:bg-[#0B0F17] dark:text-slate-300 cursor-pointer"
                  >
                    {isMm ? 'ရှင်းမည်' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCartDrawerOpen(false);
                      setCartCheckoutLines(resolvedCartLines);
                    }}
                    className="col-span-2 min-h-[42px] rounded-xl bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    {isMm
                      ? `စုပေါင်းငွေရှင်းမည် (${cartSubtotalMmk.toLocaleString('en-US')} MMK)`
                      : `Checkout Cart (${cartSubtotalMmk.toLocaleString('en-US')} MMK)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guest My Orders Slide-Over Drawer */}
      {myOrdersOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="My Recent Orders"
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-[#121826]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/[0.08]">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {isMm ? 'ကျွန်ုပ်၏အော်ဒါမှတ်တမ်း' : 'My Recent Orders'}
                </h2>
                <p className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${isMm ? 'font-myanmar-safe' : ''}`}>
                  {isMm
                    ? 'ဤစက်ပေါ်တွင် ဝယ်ယူထားသော အော်ဒါများကို တစ်ချက်နှိပ်၍ ပြန်ကြည့်နိုင်ပါသည်။'
                    : 'Saved locally on this browser for instant order & key access.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMyOrdersOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-white/[0.1] dark:text-slate-400 dark:hover:text-white cursor-pointer"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {savedOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 dark:border-white/[0.08] dark:bg-[#0B0F17] dark:text-slate-400">
                  {isMm
                    ? 'ယခုစက်ပေါ်တွင် သိမ်းဆည်းထားသော အော်ဒါမရှိသေးပါ။'
                    : 'No saved orders yet on this device. Place a test order to see it here.'}
                </div>
              ) : (
                savedOrders.map((item) => (
                  <div
                    key={item.orderNumber}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 dark:border-white/[0.08] dark:bg-[#0B0F17]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono-tabular text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.orderNumber}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.productTitle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSavedOrder(item.orderNumber)}
                        title="Remove from history"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-rose-500 dark:hover:bg-[#182133] dark:hover:text-rose-400 cursor-pointer"
                        aria-label={`Remove ${item.orderNumber}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs dark:border-white/[0.06]">
                      <span className="font-mono-tabular text-slate-700 dark:text-slate-300">
                        {item.totalMmk.toLocaleString('en-US')} MMK
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderNumber(item.orderNumber);
                          setActiveTab('TRACKER');
                          setMyOrdersOpen(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        <span>{isMm ? 'Tracker ဖွင့်ရန်' : 'Open Tracker'}</span>
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {savedOrders.length > 0 && (
              <div className="border-t border-slate-200 p-4 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={handleClearSavedOrders}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 hover:border-rose-500/40 hover:text-rose-600 dark:border-white/[0.1] dark:bg-[#0B0F17] dark:text-slate-300 dark:hover:text-rose-300 cursor-pointer"
                >
                  {isMm ? 'မှတ်တမ်းအားလုံး ဖျက်မည်' : 'Clear History'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
