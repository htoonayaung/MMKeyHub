import type {
  DeliveryFormat,
  DiscountType,
  HeroSlideItem,
  OrderStatus,
  PaymentMethodInfo,
  PaymentProvider,
  PromoCodeItem,
  ShopStatusInfo,
  VerificationMode,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');

export interface AdminProductSummary {
  id: string;
  slug: string;
  titleEn: string;
  titleMm: string;
  priceMmk: number;
  originalPriceMmk: number | null;
  deliveryFormat: DeliveryFormat;
  durationLabelEn: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  category: {
    id: string;
    slug: string;
    nameEn: string;
    nameMm: string;
  };
  availableStockCount: number;
  reservedStockCount: number;
  soldStockCount: number;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotalMmk: number;
  discountMmk: number;
  promoCodeText: string | null;
  totalMmk: number;
  contactEmail: string | null;
  contactPhone: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  customer: {
    telegramId: string | null;
    telegramUsername: string | null;
    firstName: string | null;
    email: string | null;
    phone: string | null;
  };
  items: Array<{
    id: string;
    quantity: number;
    subtotalMmk: number;
    productTitleEn: string;
    deliveryFormat: DeliveryFormat;
  }>;
  paymentProof: {
    provider: PaymentProvider;
    receiptPath: string;
    transactionLast6: string | null;
    isDuplicateTxWarning?: boolean;
    duplicateTxOrderNumber?: string | null;
    isSimilarSlipWarning?: boolean;
    similarSlipOrderNumber?: string | null;
    similarSlipDistance?: number | null;
    verificationMode?: VerificationMode;
    ocrExtractedTxId?: string | null;
    ocrExtractedAmount?: number | null;
    ocrConfidenceScore?: number | null;
    ocrTamperingFlags?: string[];
    submittedAt: string;
  } | null;
}

export interface IncomingPaymentRow {
  id: string;
  provider: PaymentProvider;
  transactionId: string;
  transactionLast6: string | null;
  amountMmk: number;
  senderInfo: string | null;
  rawMessage: string;
  isMatched: boolean;
  matchedOrderId: string | null;
  matchedAt: string | null;
  receivedAt: string;
}

export interface AdminDashboardResponse {
  metrics: {
    totalRevenueMmk: number;
    pendingOrdersCount: number;
    approvedOrdersCount: number;
    lowStockCount: number;
  };
  lowStockProducts: AdminProductSummary[];
  products: AdminProductSummary[];
  recentOrders: AdminOrderRow[];
  incomingPayments?: IncomingPaymentRow[];
  paymentMethods: PaymentMethodInfo[];
  promoCodes: PromoCodeItem[];
  subscriberStats: {
    activeSubscribers: number;
    blockedSubscribers: number;
    totalSubscribers: number;
  };
  merchantSettings: ShopStatusInfo;
}

export interface CreateProductInput {
  categorySlug: string;
  categoryNameEn: string;
  categoryNameMm: string;
  slug: string;
  titleEn: string;
  titleMm: string;
  descriptionEn: string;
  descriptionMm: string;
  priceMmk: number;
  originalPriceMmk?: number | null;
  deliveryFormat: DeliveryFormat;
  durationLabelEn?: string;
  imageUrl?: string | null;
}

export interface AdminOrdersSearchResponse {
  orders: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DailySummaryReport {
  dateKey: string;
  timezone: string;
  totalRevenueMmk: number;
  approvedOrdersCount: number;
  autoVerifiedCount: number;
  autoVerifyRatePct: number;
  pendingOrdersCount: number;
  lowStockProducts: Array<{
    titleEn: string;
    availableCount: number;
  }>;
  telegramSent: boolean;
}

export interface BulkStockUploadResponse {
  productId: string;
  submittedCount: number;
  insertedCount: number;
  skippedDuplicates: number;
  availableStockCount: number;
}

async function parseAdminError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return `Admin request failed (${res.status})`;
}

export async function fetchAdminDashboard(
  adminApiKey: string,
  signal?: AbortSignal
): Promise<AdminDashboardResponse> {
  const res = await fetch(`${API_BASE}/admin/dashboard`, {
    method: 'GET',
    headers: { 'x-admin-api-key': adminApiKey },
    cache: 'no-store',
    signal,
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as AdminDashboardResponse;
}

export async function createAdminProduct(
  adminApiKey: string,
  payload: CreateProductInput
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }
}

export interface UploadedProductImageResponse {
  imageUrl: string;
  filename: string;
  width: number;
  height: number;
  fileSizeBytes: number;
}

export function resolveApiAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/')) {
    return `${API_BASE.replace(/\/api$/, '')}${url}`;
  }
  return url;
}

export async function uploadAdminProductImage(
  adminApiKey: string,
  file: File
): Promise<UploadedProductImageResponse> {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${API_BASE}/admin/products/upload-image`, {
    method: 'POST',
    headers: {
      'x-admin-api-key': adminApiKey,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as UploadedProductImageResponse;
}

export async function updateAdminProduct(
  adminApiKey: string,
  productId: string,
  payload: {
    priceMmk?: number;
    originalPriceMmk?: number | null;
    isActive?: boolean;
    titleEn?: string;
    durationLabelEn?: string | null;
    imageUrl?: string | null;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }
}

export async function uploadBulkStock(
  adminApiKey: string,
  productId: string,
  payload: {
    items: string;
    delimiter: 'newline' | 'block';
    regionLabel?: string;
  }
): Promise<BulkStockUploadResponse> {
  const res = await fetch(`${API_BASE}/admin/products/${encodeURIComponent(productId)}/stock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as BulkStockUploadResponse;
}

export async function approveAdminOrder(adminApiKey: string, orderId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/orders/${encodeURIComponent(orderId)}/approve`, {
    method: 'POST',
    headers: { 'x-admin-api-key': adminApiKey },
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }
}

export async function rejectAdminOrder(
  adminApiKey: string,
  orderId: string,
  reason: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/orders/${encodeURIComponent(orderId)}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }
}

export async function saveAdminPaymentMethod(
  adminApiKey: string,
  provider: PaymentProvider,
  payload: {
    accountName: string;
    accountPhone: string;
    qrImageUrl?: string;
    instructionsEn?: string;
    instructionsMm?: string;
    isActive?: boolean;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/payment-methods/${encodeURIComponent(provider)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }
}

export async function fetchAdminReceiptBlobUrl(
  adminApiKey: string,
  receiptPath: string
): Promise<string> {
  const targetUrl = receiptPath.startsWith('/api')
    ? `${API_BASE.replace(/\/api$/, '')}${receiptPath}`
    : receiptPath;

  const res = await fetch(targetUrl, {
    method: 'GET',
    headers: { 'x-admin-api-key': adminApiKey },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function createAdminPromoCode(
  adminApiKey: string,
  payload: {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    maxUses?: number | null;
    expiresAt?: string | null;
  }
): Promise<PromoCodeItem> {
  const res = await fetch(`${API_BASE}/admin/promo-codes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const data = (await res.json()) as { promoCode: PromoCodeItem };
  return data.promoCode;
}

export async function updateAdminPromoCode(
  adminApiKey: string,
  promoId: string,
  payload: {
    isActive?: boolean;
    maxUses?: number | null;
  }
): Promise<PromoCodeItem> {
  const res = await fetch(`${API_BASE}/admin/promo-codes/${encodeURIComponent(promoId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const data = (await res.json()) as { promoCode: PromoCodeItem };
  return data.promoCode;
}

export interface BroadcastResponse {
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
}

export async function sendAdminBroadcast(
  adminApiKey: string,
  payload: {
    message: string;
    photoUrl?: string | null;
    promoCode?: string | null;
  }
): Promise<BroadcastResponse> {
  const res = await fetch(`${API_BASE}/admin/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as BroadcastResponse;
}

export async function downloadSalesCsv(
  adminApiKey: string,
  month?: string
): Promise<{ blob: Blob; filename: string }> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await fetch(`${API_BASE}/admin/orders/export-csv${query}`, {
    method: 'GET',
    headers: { 'x-admin-api-key': adminApiKey },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const blob = await res.blob();
  const filename = month ? `mmkeyhub-sales-${month}.csv` : 'mmkeyhub-sales-all.csv';
  return { blob, filename };
}

export async function updateAdminMerchantSettings(
  adminApiKey: string,
  payload: {
    isShopOpen: boolean;
    offlineNotice?: string;
    brandLogoUrl?: string | null;
    flashSaleEndsAt?: string | null;
    flashSaleLabelEn?: string | null;
    flashSaleLabelMm?: string | null;
    heroSlides?: HeroSlideItem[];
  }
): Promise<ShopStatusInfo> {
  const res = await fetch(`${API_BASE}/admin/merchant-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': adminApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const data = (await res.json()) as { merchantSettings: ShopStatusInfo };
  return data.merchantSettings;
}

export async function fetchAdminOrders(
  adminApiKey: string,
  params: {
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal
): Promise<AdminOrdersSearchResponse> {
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.status && params.status !== 'ALL') sp.set('status', params.status);
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));

  const query = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE}/admin/orders${query}`, {
    method: 'GET',
    headers: { 'x-admin-api-key': adminApiKey },
    cache: 'no-store',
    signal,
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as AdminOrdersSearchResponse;
}

export async function linkAdminIncomingPayment(
  adminApiKey: string,
  incomingPaymentId: string,
  orderId: string
): Promise<{
  orderId: string;
  orderNumber: string;
  incomingPaymentId: string;
  transactionId: string;
  status: OrderStatus;
}> {
  const res = await fetch(
    `${API_BASE}/admin/incoming-payments/${encodeURIComponent(incomingPaymentId)}/link`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-api-key': adminApiKey,
      },
      body: JSON.stringify({ orderId }),
    }
  );

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as {
    orderId: string;
    orderNumber: string;
    incomingPaymentId: string;
    transactionId: string;
    status: OrderStatus;
  };
}

export async function triggerAdminDailySummary(adminApiKey: string): Promise<DailySummaryReport> {
  const res = await fetch(`${API_BASE}/admin/daily-summary/send`, {
    method: 'POST',
    headers: { 'x-admin-api-key': adminApiKey },
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  const data = (await res.json()) as { report: DailySummaryReport };
  return data.report;
}

export interface AuditLogEntry {
  id: string;
  actorType: 'ADMIN' | 'SYSTEM' | 'WEBHOOK' | 'CUSTOMER';
  actorId: string;
  actorIp: string | null;
  action: string;
  entityType: string;
  entityId: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchAdminAuditLogs(
  adminApiKey: string,
  params: {
    action?: string;
    actorType?: string;
    page?: number;
    limit?: number;
  },
  signal?: AbortSignal
): Promise<AdminAuditLogsResponse> {
  const sp = new URLSearchParams();
  if (params.action && params.action !== 'ALL') sp.set('action', params.action);
  if (params.actorType && params.actorType !== 'ALL') sp.set('actorType', params.actorType);
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));

  const query = sp.toString() ? `?${sp.toString()}` : '';
  const res = await fetch(`${API_BASE}/admin/audit-logs${query}`, {
    method: 'GET',
    headers: { 'x-admin-api-key': adminApiKey },
    cache: 'no-store',
    signal,
  });

  if (!res.ok) {
    throw new Error(await parseAdminError(res));
  }

  return (await res.json()) as AdminAuditLogsResponse;
}


