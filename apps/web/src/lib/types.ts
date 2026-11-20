export type DeliveryFormat = 'LICENSE_KEY' | 'ACCOUNT_LOGIN' | 'VPN_CONFIG';
export type PaymentProvider = 'KPAY' | 'WAVEPAY';
export type DiscountType = 'PERCENTAGE' | 'FIXED_MMK';
export type VerificationMode = 'AUTO_VERIFIED' | 'MANUAL_REVIEW' | 'ADMIN_APPROVED';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export interface ProductCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameMm: string;
}

export interface ProductItem {
  id: string;
  slug: string;
  titleEn: string;
  titleMm: string;
  descriptionEn: string;
  descriptionMm: string;
  deliveryInstructionsEn: string | null;
  deliveryInstructionsMm: string | null;
  priceMmk: number;
  originalPriceMmk?: number | null;
  deliveryFormat: DeliveryFormat;
  durationLabelEn: string | null;
  durationLabelMm: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  category: ProductCategory;
  availableStockCount: number;
}

export interface PaymentMethodInfo {
  id: string;
  provider: PaymentProvider;
  accountName: string;
  accountPhone: string;
  qrImageUrl: string;
  instructionsEn: string | null;
  instructionsMm: string | null;
}

export interface OrderOcrSummary {
  passedAutoChecks: boolean;
  extractedTxId: string | null;
  extractedAmountMmk: number | null;
  confidenceScore: number;
  tamperingFlags: string[];
  validationNotes: string;
}

export interface OrderCreateResponse {
  orderNumber: string;
  accessToken: string;
  status: OrderStatus;
  verificationMode?: VerificationMode;
  autoVerified?: boolean;
  ocrSummary?: OrderOcrSummary;
  subtotalMmk: number;
  discountMmk: number;
  promoCode: string | null;
  totalMmk: number;
  paymentMethod: PaymentProvider;
  receiptPath: string;
  adminNotified: boolean;
  createdAt: string;
}

export interface PromoValidationResponse {
  valid: boolean;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  subtotalMmk: number;
  discountMmk: number;
  totalMmk: number;
}

export interface PromoCodeItem {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DeliveredSecret {
  assetId: string;
  payload: string;
  regionLabel: string | null;
  expiresAt: string | null;
}

export interface OrderItemDetails {
  productId: string;
  slug: string;
  titleEn: string;
  titleMm: string;
  deliveryFormat: DeliveryFormat;
  deliveryInstructionsEn: string | null;
  deliveryInstructionsMm: string | null;
  quantity: number;
  unitPriceMmk: number;
  subtotalMmk: number;
  deliveredSecrets: DeliveredSecret[];
}

export interface OrderStatusResponse {
  orderNumber: string;
  status: OrderStatus;
  subtotalMmk: number;
  discountMmk: number;
  promoCode: string | null;
  totalMmk: number;
  locale: 'EN' | 'MM';
  paymentProof: {
    provider: PaymentProvider;
    transactionLast6: string | null;
    verificationMode?: VerificationMode;
    ocrExtractedTxId?: string | null;
    ocrExtractedAmount?: number | null;
    ocrConfidenceScore?: number | null;
    ocrTamperingFlags?: string[];
    ocrValidationNotes?: string | null;
    submittedAt: string;
  } | null;
  rejectionReason: string | null;
  requiresTokenToViewSecrets: boolean;
  createdAt: string;
  reviewedAt: string | null;
  items: OrderItemDetails[];
}

export interface SavedLocalOrder {
  orderNumber: string;
  accessToken: string;
  productTitle: string;
  totalMmk: number;
  createdAt: string;
}

export interface RecentPurchaseActivity {
  id: string;
  maskedBuyer: string;
  productTitleEn: string;
  productTitleMm: string;
  durationLabelEn: string | null;
  durationLabelMm: string | null;
  minutesAgo: number;
  approvedAt: string;
}

export interface HeroSlideItem {
  id: string;
  imageUrl: string;
  kickerEn: string;
  kickerMm: string;
  titleEn: string;
  titleMm: string;
  subtitleEn: string;
  subtitleMm: string;
  ctaLabelEn: string;
  ctaLabelMm: string;
  targetCategory?: DeliveryFormat | 'ALL';
}

export interface CartItem {
  product: ProductItem;
  quantity: number;
}

export interface ShopStatusInfo {
  isShopOpen: boolean;
  offlineNotice: string;
  brandLogoUrl?: string | null;
  flashSaleEndsAt?: string | null;
  flashSaleLabelEn?: string | null;
  flashSaleLabelMm?: string | null;
  heroSlides?: HeroSlideItem[];
  updatedAt?: string | null;
}

