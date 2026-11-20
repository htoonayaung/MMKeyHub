import heroCampaignImg from './assets/images/hero_flash_campaign_1794880137337.jpg';
import heroVpnImg from './assets/images/hero_vpn_security_1794880137999.jpg';
import coverWin11Img from './assets/images/cover_win11_1795075367950.jpg';
import coverExpressVpnImg from './assets/images/cover_expressvpn_1795075395471.jpg';
import coverChatGptImg from './assets/images/cover_chatgpt_1795075362329.jpg';
import coverNetflixImg from './assets/images/cover_netflix_1795075361815.jpg';
import coverOutlineImg from './assets/images/cover_outline_1795075363506.jpg';
import coverCursorImg from './assets/images/cover_cursor_1795075363943.jpg';

export type PreviewLocale = 'en' | 'mm';
export type PreviewTheme = 'dark' | 'light';
export type DeliveryFormat = 'LICENSE_KEY' | 'ACCOUNT_LOGIN' | 'VPN_CONFIG';
export type PaymentProvider = 'KPAY' | 'WAVEPAY';
export type DiscountType = 'PERCENTAGE' | 'FIXED_MMK';
export type OrderStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type VerificationMode = 'AUTO_VERIFIED' | 'MANUAL_REVIEW' | 'ADMIN_APPROVED';

export interface PreviewProduct {
  id: string;
  titleEn: string;
  titleMm: string;
  descriptionEn: string;
  descriptionMm: string;
  instructionsEn: string;
  instructionsMm: string;
  categoryNameEn: string;
  categoryNameMm: string;
  durationEn: string;
  durationMm: string;
  priceMmk: number;
  originalPriceMmk?: number | null;
  deliveryFormat: DeliveryFormat;
  imageUrl?: string | null;
  isActive: boolean;
  availableKeys: string[];
  reservedCount: number;
  soldCount: number;
}

export interface PreviewPromoCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

export interface PreviewPaymentMethod {
  provider: PaymentProvider;
  accountName: string;
  accountPhone: string;
  qrImageUrl: string;
  instructionsEn: string;
  instructionsMm: string;
}

export interface PreviewHeroSlide {
  id: string;
  badgeEn: string;
  badgeMm: string;
  titleEn: string;
  titleMm: string;
  subtitleEn: string;
  subtitleMm: string;
  ctaLabelEn: string;
  ctaLabelMm: string;
  targetCategory: 'ALL' | DeliveryFormat;
  imageUrl?: string | null;
}

export interface PreviewCartItem {
  productId: string;
  quantity: number;
}

export interface PreviewMerchantSettings {
  isShopOpen: boolean;
  offlineNoticeEn: string;
  offlineNoticeMm: string;
  brandLogoUrl: string | null;
  flashSaleEndsAt: string | null;
  flashSaleLabelEn: string | null;
  flashSaleLabelMm: string | null;
  heroSlides: PreviewHeroSlide[];
}

export interface PreviewOrderItemLine {
  productId: string;
  productTitleEn: string;
  productTitleMm: string;
  deliveryFormat: DeliveryFormat;
  instructionsEn: string;
  instructionsMm: string;
  quantity: number;
  unitPriceMmk: number;
  subtotalMmk: number;
  reservedKeys: string[];
  deliveredKeys: string[];
}

export interface PreviewOrder {
  id: string;
  orderNumber: string;
  accessToken: string;
  status: OrderStatus;
  productId: string;
  productTitleEn: string;
  productTitleMm: string;
  deliveryFormat: DeliveryFormat;
  instructionsEn: string;
  instructionsMm: string;
  quantity: number;
  items?: PreviewOrderItemLine[];
  subtotalMmk: number;
  discountMmk: number;
  promoCode: string | null;
  totalMmk: number;
  paymentProvider: PaymentProvider;
  transactionLast6: string;
  receiptDataUrl: string;
  receiptHash?: string;
  isDuplicateTxWarning?: boolean;
  duplicateTxOrderNumber?: string | null;
  isSimilarSlipWarning?: boolean;
  similarSlipOrderNumber?: string | null;
  similarSlipDistance?: number | null;
  customerMode: 'WEB' | 'TELEGRAM';
  customerLabel: string;
  reservedKeys: string[];
  deliveredKeys: string[];
  rejectionReason: string | null;
  reviewedBy: string | null;
  verificationMode: VerificationMode;
  ocrExtractedTxId?: string | null;
  ocrExtractedAmount?: number | null;
  ocrConfidenceScore?: number | null;
  ocrTamperingFlags?: string[];
  ocrValidationNotes?: string | null;
  escalatedToAdminGroup?: boolean;
  warrantyExpiresAt?: string | null;
  expiryReminderSent?: boolean;
  createdAt: string;
}

export interface PreviewIncomingSms {
  id: string;
  provider: PaymentProvider;
  transactionId: string;
  transactionLast6: string;
  amountMmk: number;
  senderInfo: string;
  rawMessage: string;
  isMatched: boolean;
  matchedOrderNumber: string | null;
  receivedAt: string;
}

export interface PreviewAdminGroupLog {
  id: string;
  orderNumber: string;
  provider: PaymentProvider;
  amountMmk: number;
  transactionId: string;
  confidenceScore: number | null;
  productTitleEn: string;
  quantity: number;
  dmSent: boolean;
  timestamp: string;
}

export interface BotDmMessage {
  id: string;
  sender: 'BOT' | 'USER';
  text: string;
  codeBlocks?: string[];
  orderNumberTag?: string;
  promoCodeCta?: string | null;
  photoUrl?: string | null;
  timestamp: string;
}

export interface PreviewBotSubscriber {
  id: string;
  telegramUserId: string;
  username: string;
  firstName: string;
  source: 'BOT' | 'MINI_APP';
  isBlocked: boolean;
  lastActiveAt: string;
}

export interface PreviewSupportTicket {
  id: string;
  ticketNumber: string;
  customerLabel: string;
  orderNumber: string | null;
  message: string;
  status: 'OPEN' | 'REPLIED';
  adminReply: string | null;
  repliedBy: string | null;
  createdAt: string;
}

export interface PreviewAuditLogEntry {
  id: string;
  actorType: 'ADMIN' | 'SYSTEM' | 'WEBHOOK' | 'CUSTOMER';
  actorId: string;
  actorIp: string | null;
  action: string;
  entityType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RecentPurchaseSeed {
  id: string;
  maskedBuyer: string;
  productTitleEn: string;
  productTitleMm: string;
  durationEn: string;
  durationMm: string;
  minutesAgo: number;
}

export const INITIAL_HERO_SLIDES: PreviewHeroSlide[] = [
  {
    id: 'flash-promo',
    badgeEn: 'FLASH SALE · MMK INSTANT DELIVERY',
    badgeMm: 'FLASH SALE · ချက်ချင်းပို့ဆောင်မှု',
    titleEn: 'Software Keys, VPNs & AI Seats Paid in Kyat',
    titleMm: 'Software Key၊ VPN နှင့် AI အကောင့်များ ကျပ်ငွေဖြင့် ဝယ်ယူပါ',
    subtitleEn:
      'Auto-verified in seconds with KBZPay & WavePay. Combine items in one cart and unlock credentials immediately.',
    subtitleMm:
      'KBZPay / WavePay ဖြင့် ငွေလွှဲပြီး စက္ကန့်ပိုင်းအတွင်း AI + ဘဏ် SMS စနစ်ဖြင့် Key ချက်ချင်းရယူပါ။',
    ctaLabelEn: 'Shop Flash Deals',
    ctaLabelMm: 'Flash Deals ကြည့်ရန်',
    targetCategory: 'ALL',
    imageUrl: heroCampaignImg,
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
    imageUrl: heroVpnImg,
  },
];

export const INITIAL_MERCHANT_SETTINGS: PreviewMerchantSettings = {
  isShopOpen: true,
  offlineNoticeEn:
    'Night Mode Active: Orders placed now are queued safely and will be approved starting at 8:00 AM MMT.',
  offlineNoticeMm:
    'ညပိုင်းအချိန် ဖြစ်ပါသဖြင့် ယခုတင်သောအော်ဒါများကို မနက် ၈ နာရီတွင် အမြန်ဆုံး စစ်ဆေးပေးပို့ပေးပါမည်။',
  brandLogoUrl: null,
  flashSaleEndsAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
  flashSaleLabelEn: 'Weekend Flash Sale · Up to 28% OFF',
  flashSaleLabelMm: 'Weekend Flash Sale · ၂၈% အထိ လျှော့ဈေး',
  heroSlides: INITIAL_HERO_SLIDES,
};

export const INITIAL_PAYMENT_METHODS: Record<PaymentProvider, PreviewPaymentMethod> = {
  KPAY: {
    provider: 'KPAY',
    accountName: 'MMKeyHub Merchant (KBZPay)',
    accountPhone: '09777000111',
    qrImageUrl: '',
    instructionsEn: 'Transfer the exact MMK amount via KBZPay and upload your slip screenshot.',
    instructionsMm: 'ကျသင့်ငွေအတိအကျကို KBZPay ဖြင့်လွှဲပြီး ပြေစာပုံတင်ပေးပါ။',
  },
  WAVEPAY: {
    provider: 'WAVEPAY',
    accountName: 'MMKeyHub Merchant (WavePay)',
    accountPhone: '09777000222',
    qrImageUrl: '',
    instructionsEn: 'Transfer the exact MMK amount via WavePay and upload your receipt screenshot.',
    instructionsMm: 'ကျသင့်ငွေအတိအကျကို WavePay ဖြင့်လွှဲပြီး ပြေစာပုံတင်ပေးပါ။',
  },
};

export const INITIAL_PRODUCTS: PreviewProduct[] = [
  {
    id: 'prod-win11',
    titleEn: 'Windows 11 Pro Retail Key',
    titleMm: 'Windows 11 Pro တရားဝင် Retail Key',
    descriptionEn:
      'Genuine 25-character retail activation key for 1 PC. Supports clean install and upgrade.',
    descriptionMm: 'PC ၁ လုံးအတွက် ၂၅ လုံးပါ တရားဝင် Retail Activation Key ဖြစ်ပါသည်။',
    instructionsEn:
      'Open Windows Settings > System > Activation. Click Change product key, paste your 25-character key, and click Activate.',
    instructionsMm:
      'Settings > System > Activation ကိုဖွင့်ပါ။ Change product key ကိုနှိပ်ပြီး ၂၅ လုံးပါ Key ကိုထည့်၍ Activate လုပ်ပါ။',
    categoryNameEn: 'License Keys',
    categoryNameMm: 'Software Keys',
    durationEn: 'Lifetime',
    durationMm: 'တစ်သက်တာ',
    priceMmk: 25000,
    originalPriceMmk: 35000,
    deliveryFormat: 'LICENSE_KEY',
    imageUrl: coverWin11Img,
    isActive: true,
    availableKeys: [
      'W269N-WFGWX-YVC9B-4J6C9-T83GX',
      'VK7JG-NPHTM-C97JM-9MPGT-3V66T',
      'NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J',
      'MH37W-N47XK-V7XM9-C7227-GCQG9',
      '8N67H-M3CY9-QT7C4-2TR7M-TXYCV',
      '2B87N-8KFHP-DKV6R-Y2C8J-PKCKT',
    ],
    reservedCount: 0,
    soldCount: 1,
  },
  {
    id: 'prod-expressvpn',
    titleEn: 'ExpressVPN Activation Code',
    titleMm: 'ExpressVPN ၁ လသုံး Activation Code',
    descriptionEn:
      'High-speed encrypted VPN subscription for PC, Mac, iOS & Android with unlimited bandwidth.',
    descriptionMm: 'ဖုန်းနှင့် ကွန်ပျူတာများတွင် မြန်နှုန်းမြင့် အသုံးပြုနိုင်သော ExpressVPN ၁ လသုံး ကုဒ်ဖြစ်ပါသည်။',
    instructionsEn:
      'Download ExpressVPN on your device, choose Sign In with Activation Code, and paste your unlocked code.',
    instructionsMm:
      'ExpressVPN App ကိုဖွင့်ပြီး Activation Code ဖြင့် Sign In ဝင်ကာ ရရှိသောကုဒ်ကို ထည့်သွင်းပါ။',
    categoryNameEn: 'VPN',
    categoryNameMm: 'VPN Configs',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    priceMmk: 18500,
    originalPriceMmk: 24000,
    deliveryFormat: 'VPN_CONFIG',
    imageUrl: coverExpressVpnImg,
    isActive: true,
    availableKeys: [
      'EXP-MM94-821K-QPLZ-1190',
      'EXP-MM94-552J-WERT-4402',
      'EXP-MM94-773M-ASDF-9910',
    ],
    reservedCount: 0,
    soldCount: 2,
  },
  {
    id: 'prod-chatgpt',
    titleEn: 'ChatGPT Plus Private Account',
    titleMm: 'ChatGPT Plus ကိုယ်ပိုင်အကောင့် (၁ လ)',
    descriptionEn:
      'Dedicated 1-month Plus account with GPT-4o, voice mode, and priority access included.',
    descriptionMm: 'GPT-4o နှင့် Priority Access အပြည့်အစုံပါဝင်သော ၁ လသုံး ကိုယ်ပိုင် ChatGPT Plus အကောင့် ဖြစ်ပါသည်။',
    instructionsEn:
      'Open chatgpt.com and sign in with the email and password provided. Do not share the credentials across multiple users.',
    instructionsMm:
      'chatgpt.com တွင် ပေးထားသော Email နှင့် Password ဖြင့် Login ဝင်ရောက်အသုံးပြုပါ။',
    categoryNameEn: 'Accounts',
    categoryNameMm: 'Premium Accounts',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    priceMmk: 59000,
    deliveryFormat: 'ACCOUNT_LOGIN',
    imageUrl: coverChatGptImg,
    isActive: true,
    availableKeys: [
      'gpt-mm-01@mmkeyhub.shop | VaultGpt#2026',
      'gpt-mm-02@mmkeyhub.shop | VaultGpt#8841',
    ],
    reservedCount: 0,
    soldCount: 1,
  },
  {
    id: 'prod-netflix',
    titleEn: 'Netflix 4K UHD Private Profile',
    titleMm: 'Netflix 4K UHD ကိုယ်ပိုင် Profile (၁ လ)',
    descriptionEn:
      '1 dedicated PIN-locked 4K HDR profile on a private billing account. Works on TV and Mobile.',
    descriptionMm: 'PIN ပါဝင်သော 4K UHD ကိုယ်ပိုင် Profile ၁ ခု ဖြစ်ပါသည်။ TV နှင့် ဖုန်းတို့တွင် အသုံးပြုနိုင်ပါသည်။',
    instructionsEn:
      'Sign in on Netflix with the email & password below, then open your assigned Profile + 4-digit PIN.',
    instructionsMm:
      'ပေးထားသော Email/Password ဖြင့်ဝင်ပြီး သင့် Profile နှင့် PIN ကိုရွေးချယ်အသုံးပြုပါ။',
    categoryNameEn: 'Accounts',
    categoryNameMm: 'Premium Accounts',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    priceMmk: 16500,
    deliveryFormat: 'ACCOUNT_LOGIN',
    imageUrl: coverNetflixImg,
    isActive: true,
    availableKeys: [
      'nf-mm-01@mmkeyhub.shop | Vault#8821 | Profile 2 (PIN: 4411)',
      'nf-mm-02@mmkeyhub.shop | Vault#9930 | Profile 3 (PIN: 7820)',
      'nf-mm-03@mmkeyhub.shop | Vault#5512 | Profile 1 (PIN: 1904)',
    ],
    reservedCount: 0,
    soldCount: 0,
  },
  {
    id: 'prod-outline',
    titleEn: 'Outline VPN Singapore High-Speed',
    titleMm: 'Outline VPN စင်ကာပူ High-Speed (၁ လ)',
    descriptionEn:
      'Low-latency Singapore Shadowsocks key tuned for Myanmar fiber and mobile data. 200 GB quota.',
    descriptionMm: 'မြန်မာအင်တာနက်လိုင်းများအတွက် မြန်နှုန်းမြင့် စင်ကာပူ Outline VPN Key (200 GB) ဖြစ်ပါသည်။',
    instructionsEn:
      'Copy the ss:// access key, open Outline Client, tap the + button, and paste your key to connect.',
    instructionsMm:
      'ss:// Key ကိုကူးယူပြီး Outline App ထဲတွင် Add Server (+) နှိပ်၍ ထည့်သွင်းချိတ်ဆက်ပါ။',
    categoryNameEn: 'VPN',
    categoryNameMm: 'VPN Configs',
    durationEn: '1 Month · 200 GB',
    durationMm: '၁ လ · 200 GB',
    priceMmk: 8000,
    originalPriceMmk: 10000,
    deliveryFormat: 'VPN_CONFIG',
    imageUrl: coverOutlineImg,
    isActive: true,
    availableKeys: [
      'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTprdjAx@sg01.mmkeyhub.net:8443/?outline=1',
      'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTprdjAy@sg01.mmkeyhub.net:8443/?outline=1',
      'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTprdjAz@sg01.mmkeyhub.net:8443/?outline=1',
      'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTprdjA0@sg01.mmkeyhub.net:8443/?outline=1',
    ],
    reservedCount: 0,
    soldCount: 0,
  },
  {
    id: 'prod-cursor',
    titleEn: 'Cursor Pro / AI Dev Seat',
    titleMm: 'Cursor Pro AI Dev အကောင့် (၁ လ)',
    descriptionEn:
      'Private 1-month Pro workspace credentials with fast premium model quota ready for immediate use.',
    descriptionMm: '၁ လသုံး ကိုယ်ပိုင် Cursor Pro အကောင့် ဖြစ်ပါသည်။',
    instructionsEn:
      'Open cursor.com or the Cursor desktop editor and sign in with the email and password provided.',
    instructionsMm:
      'cursor.com သို့မဟုတ် Cursor Editor တွင် ပေးထားသော Email/Password ဖြင့် ဝင်ရောက်အသုံးပြုပါ။',
    categoryNameEn: 'Accounts',
    categoryNameMm: 'Premium Accounts',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    priceMmk: 68000,
    deliveryFormat: 'ACCOUNT_LOGIN',
    imageUrl: coverCursorImg,
    isActive: true,
    availableKeys: ['devseat-01@mmkeyhub.shop | Cur$or2026!'],
    reservedCount: 0,
    soldCount: 0,
  },
];

export const INITIAL_ORDERS: PreviewOrder[] = [
  {
    id: 'ord-demo-approved',
    orderNumber: 'MMK-20261115-DEMO01',
    accessToken: 'demo-token-01',
    status: 'APPROVED',
    productId: 'prod-win11',
    productTitleEn: 'Windows 11 Pro Retail Key',
    productTitleMm: 'Windows 11 Pro တရားဝင် Retail Key',
    deliveryFormat: 'LICENSE_KEY',
    instructionsEn:
      'Open Windows Settings > System > Activation. Click Change product key, paste your 25-character key, and click Activate.',
    instructionsMm:
      'Settings > System > Activation ကိုဖွင့်ပါ။ Change product key ကိုနှိပ်ပြီး ၂၅ လုံးပါ Key ကိုထည့်၍ Activate လုပ်ပါ။',
    quantity: 1,
    subtotalMmk: 25000,
    discountMmk: 0,
    promoCode: null,
    totalMmk: 25000,
    paymentProvider: 'KPAY',
    transactionLast6: '482910',
    receiptDataUrl: '',
    customerMode: 'TELEGRAM',
    customerLabel: '@kyaw_dev (TG: 704118290)',
    reservedKeys: [],
    deliveredKeys: ['J84KM-92PLQ-77VXC-41RTB-90DFG'],
    rejectionReason: null,
    reviewedBy: '@admin_mgmg',
    verificationMode: 'ADMIN_APPROVED',
    ocrExtractedTxId: '010099482910',
    ocrExtractedAmount: 25000,
    ocrConfidenceScore: 0.99,
    ocrTamperingFlags: [],
    ocrValidationNotes: 'Verified exact amount and receiver match.',
    escalatedToAdminGroup: true,
    warrantyExpiresAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    expiryReminderSent: false,
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-demo-vpn',
    orderNumber: 'MMK-20261115-VPN02',
    accessToken: 'demo-token-02',
    status: 'APPROVED',
    productId: 'prod-outline',
    productTitleEn: 'Outline VPN Singapore High-Speed',
    productTitleMm: 'Outline VPN စင်ကာပူ High-Speed (၁ လ)',
    deliveryFormat: 'VPN_CONFIG',
    instructionsEn:
      'Copy the ss:// access key or scan the QR code inside Outline Client to connect immediately.',
    instructionsMm:
      'ss:// Key ကိုကူးယူပါ သို့မဟုတ် Outline App ဖြင့် QR Code ကို Scan ဖတ်၍ ချိတ်ဆက်ပါ။',
    quantity: 1,
    subtotalMmk: 8000,
    discountMmk: 0,
    promoCode: null,
    totalMmk: 8000,
    paymentProvider: 'WAVEPAY',
    transactionLast6: '991204',
    receiptDataUrl: '',
    customerMode: 'TELEGRAM',
    customerLabel: '@su_myat (TG: 812904311)',
    reservedKeys: [],
    deliveredKeys: [
      'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTprdjAwQHNnMDEua3lhdHZhdWx0Lm5ldDo4NDQzLz9vdXRsaW5lPTE=',
    ],
    rejectionReason: null,
    reviewedBy: 'SYSTEM_AUTO',
    verificationMode: 'AUTO_VERIFIED',
    ocrExtractedTxId: 'WP882991204',
    ocrExtractedAmount: 8000,
    ocrConfidenceScore: 0.98,
    ocrTamperingFlags: [],
    ocrValidationNotes: 'Auto-matched with WavePay incoming SMS #WP882991204.',
    escalatedToAdminGroup: false,
    warrantyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    expiryReminderSent: false,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
];

export const INITIAL_INCOMING_SMS: PreviewIncomingSms[] = [
  {
    id: 'sms-pre-unmatched',
    provider: 'KPAY',
    transactionId: '010099771122',
    transactionLast6: '771122',
    amountMmk: 25000,
    senderInfo: 'Aung Aung (09798811223)',
    rawMessage:
      'KBZPay: Received 25,000.00 MMK from Aung Aung (09798811223). Trans ID: 010099771122.',
    isMatched: false,
    matchedOrderNumber: null,
    receivedAt: new Date(Date.now() - 90 * 1000).toISOString(),
  },
  {
    id: 'sms-seed-vpn',
    provider: 'WAVEPAY',
    transactionId: 'WP882991204',
    transactionLast6: '991204',
    amountMmk: 8000,
    senderInfo: 'Su Myat (09420099112)',
    rawMessage:
      'WavePay: You received 8,000 MMK from 09420099112. Ref ID: WP882991204.',
    isMatched: true,
    matchedOrderNumber: 'MMK-20261115-VPN02',
    receivedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
];

export const INITIAL_PROMO_CODES: PreviewPromoCode[] = [
  {
    id: 'promo-kyat10',
    code: 'KYAT10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    maxUses: 100,
    usedCount: 4,
    expiresAt: null,
    isActive: true,
  },
  {
    id: 'promo-welcome2000',
    code: 'WELCOME2000',
    discountType: 'FIXED_MMK',
    discountValue: 2000,
    maxUses: 50,
    usedCount: 12,
    expiresAt: null,
    isActive: true,
  },
  {
    id: 'promo-flash15',
    code: 'FLASH15',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    maxUses: 25,
    usedCount: 2,
    expiresAt: null,
    isActive: true,
  },
];

export const INITIAL_RECENT_PURCHASES: RecentPurchaseSeed[] = [
  {
    id: 'rp-1',
    maskedBuyer: 'Mg***',
    productTitleEn: 'ExpressVPN Activation Code',
    productTitleMm: 'ExpressVPN ၁ လသုံး Activation Code',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    minutesAgo: 2,
  },
  {
    id: 'rp-2',
    maskedBuyer: 'Su***',
    productTitleEn: 'ChatGPT Plus Private Account',
    productTitleMm: 'ChatGPT Plus ကိုယ်ပိုင်အကောင့်',
    durationEn: '1 Month',
    durationMm: '၁ လ',
    minutesAgo: 5,
  },
  {
    id: 'rp-3',
    maskedBuyer: '09***48',
    productTitleEn: 'Outline VPN Singapore High-Speed',
    productTitleMm: 'Outline VPN စင်ကာပူ High-Speed',
    durationEn: '1 Month · 200 GB',
    durationMm: '၁ လ · 200 GB',
    minutesAgo: 9,
  },
];

export const INITIAL_SUBSCRIBERS: PreviewBotSubscriber[] = [
  {
    id: 'sub-1',
    telegramUserId: '704118290',
    username: '@kyaw_dev',
    firstName: 'Kyaw',
    source: 'MINI_APP',
    isBlocked: false,
    lastActiveAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  },
  {
    id: 'sub-2',
    telegramUserId: '812904311',
    username: '@su_myat',
    firstName: 'Su Myat',
    source: 'BOT',
    isBlocked: false,
    lastActiveAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
  },
  {
    id: 'sub-3',
    telegramUserId: '639118004',
    username: '@mgmg_tech',
    firstName: 'Mg Mg',
    source: 'MINI_APP',
    isBlocked: false,
    lastActiveAt: new Date(Date.now() - 190 * 60 * 1000).toISOString(),
  },
  {
    id: 'sub-4',
    telegramUserId: '501993812',
    username: '@thiha_vpn',
    firstName: 'Thiha',
    source: 'BOT',
    isBlocked: true,
    lastActiveAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
];

export const INITIAL_SUPPORT_TICKETS: PreviewSupportTicket[] = [
  {
    id: 'tkt-demo-1',
    ticketNumber: 'TKT-892410',
    customerLabel: '@su_myat (TG: 812904311)',
    orderNumber: 'MMK-20261115-DEMO01',
    message: 'Need a quick re-activation check for my Windows key after motherboard swap.',
    status: 'REPLIED',
    adminReply: 'We verified your retail key — please run slmgr /ato or retry activation now.',
    repliedBy: '@admin_mgmg',
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  },
];

export const INITIAL_AUDIT_LOGS: PreviewAuditLogEntry[] = [
  {
    id: 'audit-seed-1',
    actorType: 'SYSTEM',
    actorId: 'auto-fulfillment',
    actorIp: '10.0.4.12',
    action: 'ORDER_APPROVED',
    entityType: 'Order',
    targetId: 'MMK-20261115-VPN02',
    metadata: { verificationMode: 'AUTO_VERIFIED', matchedTxId: 'WP882991204' },
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: 'audit-seed-2',
    actorType: 'WEBHOOK',
    actorId: 'payment-sms-webhook',
    actorIp: '103.89.44.19',
    action: 'WEBHOOK_INGESTED',
    entityType: 'IncomingPayment',
    targetId: 'WP882991204',
    metadata: { provider: 'WAVEPAY', amountMmk: 8000, authMode: 'hmac-sha256' },
    createdAt: new Date(Date.now() - 8 * 60 * 1000 - 2000).toISOString(),
  },
  {
    id: 'audit-seed-3',
    actorType: 'ADMIN',
    actorId: 'web-admin',
    actorIp: '172.18.0.1',
    action: 'STOCK_UPLOADED',
    entityType: 'Product',
    targetId: 'prod-outline-sg',
    metadata: { insertedCount: 15, skippedDuplicates: 0 },
    createdAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
  },
];


