import type {
  OrderCreateResponse,
  OrderStatusResponse,
  PaymentMethodInfo,
  ProductItem,
  PromoValidationResponse,
  RecentPurchaseActivity,
  SavedLocalOrder,
  ShopStatusInfo,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');
const LOCAL_ORDERS_KEY = 'mmkeyhub_recent_orders_v1';

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    if (json?.error) return json.error;
  } catch {
    // ignore JSON parse failure
  }
  return `Request failed (${response.status})`;
}

export function formatMmk(amount: number): string {
  return `${amount.toLocaleString('en-US')} MMK`;
}

export function computeFlashSalePercent(
  priceMmk: number,
  originalPriceMmk?: number | null
): number | null {
  if (!originalPriceMmk || originalPriceMmk <= priceMmk) return null;
  const pct = Math.round(((originalPriceMmk - priceMmk) / originalPriceMmk) * 100);
  return pct > 0 ? pct : null;
}

export async function fetchProducts(signal?: AbortSignal): Promise<ProductItem[]> {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const data = (await res.json()) as { products: ProductItem[] };
  return data.products ?? [];
}

export async function fetchPaymentMethods(signal?: AbortSignal): Promise<PaymentMethodInfo[]> {
  const res = await fetch(`${API_BASE}/payment-methods`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const data = (await res.json()) as { paymentMethods: PaymentMethodInfo[] };
  return data.paymentMethods ?? [];
}

export async function fetchShopStatus(signal?: AbortSignal): Promise<ShopStatusInfo> {
  const res = await fetch(`${API_BASE}/shop-status`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    return {
      isShopOpen: true,
      offlineNotice: '',
    };
  }
  return (await res.json()) as ShopStatusInfo;
}

export async function fetchRecentPurchases(
  signal?: AbortSignal
): Promise<RecentPurchaseActivity[]> {
  const res = await fetch(`${API_BASE}/orders/recent-activity`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { activities?: RecentPurchaseActivity[] };
  return data.activities ?? [];
}

export async function validatePromoCode(payload: {
  code: string;
  productId?: string;
  quantity?: number;
  items?: Array<{ productId: string; quantity: number }>;
}): Promise<PromoValidationResponse> {
  const res = await fetch(`${API_BASE}/promo/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  return (await res.json()) as PromoValidationResponse;
}

export async function submitOrder(
  formData: FormData,
  initDataRaw?: string | null
): Promise<OrderCreateResponse> {
  const headers: Record<string, string> = {};
  if (initDataRaw) {
    headers['X-Telegram-Init-Data'] = initDataRaw;
  }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  return (await res.json()) as OrderCreateResponse;
}

export async function fetchOrderStatus(
  orderNumber: string,
  options?: {
    token?: string | null;
    initDataRaw?: string | null;
    signal?: AbortSignal;
  }
): Promise<OrderStatusResponse> {
  const query = options?.token ? `?token=${encodeURIComponent(options.token)}` : '';
  const headers: Record<string, string> = {};
  if (options?.initDataRaw) {
    headers['X-Telegram-Init-Data'] = options.initDataRaw;
  }
  if (options?.token) {
    headers['X-Order-Token'] = options.token;
  }

  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderNumber)}${query}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  return (await res.json()) as OrderStatusResponse;
}

function notifyLocalOrdersUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('mmkeyhub-orders-updated'));
}

export function saveLocalOrder(entry: SavedLocalOrder): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalOrders().filter((item) => item.orderNumber !== entry.orderNumber);
    const updated = [entry, ...existing].slice(0, 12);
    window.localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(updated));
    notifyLocalOrdersUpdated();
  } catch {
    // ignore storage errors
  }
}

export function removeLocalOrder(orderNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    const updated = getLocalOrders().filter((item) => item.orderNumber !== orderNumber);
    window.localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(updated));
    notifyLocalOrdersUpdated();
  } catch {
    // ignore storage errors
  }
}

export function clearLocalOrders(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_ORDERS_KEY);
    notifyLocalOrdersUpdated();
  } catch {
    // ignore storage errors
  }
}

export function getLocalOrders(): SavedLocalOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLocalOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSavedTokenForOrder(orderNumber: string): string | null {
  const match = getLocalOrders().find((item) => item.orderNumber === orderNumber);
  return match?.accessToken ?? null;
}
