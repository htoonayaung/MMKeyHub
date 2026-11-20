import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const paymentMethodsRouter = Router();

const DEFAULT_OFFLINE_NOTICE =
  'Night Mode is active. Admin approvals may be delayed until morning (08:00 AM MMT). You can still submit orders to reserve stock.';

const DEFAULT_HERO_SLIDES = [
  {
    id: 'slide-flash',
    badgeEn: 'Instant Delivery · 24/7 AI + SMS Auto-Verify',
    badgeMm: '၂၄ နာရီ AI + ဘဏ် SMS အလိုအလျောက် Key ထုတ်ပေးမှု',
    titleEn: 'Software Keys, Premium Accounts & VPNs in Kyat',
    titleMm: 'Software Key၊ Account နှင့် VPN များကို ကျပ်ငွေဖြင့် ချက်ချင်းဝယ်ယူပါ',
    subtitleEn:
      'Pay via KBZPay or WavePay. Our AI receipt verifier and live bank SMS matcher unlock encrypted digital keys in seconds.',
    subtitleMm:
      'KBZPay သို့မဟုတ် WavePay ဖြင့် ငွေလွှဲပြီး စက္ကန့်ပိုင်းအတွင်း Key များ ရယူနိုင်ပါသည်။',
    ctaLabelEn: 'Shop Flash Deals',
    ctaLabelMm: 'လျှော့ဈေးများ ကြည့်မည်',
    targetCategory: 'ALL',
    imageUrl: '/images/hero-campaign.jpg',
  },
  {
    id: 'slide-vpn',
    badgeEn: 'High-Speed Singapore & Express Nodes',
    badgeMm: 'မြန်နှုန်းမြင့် စင်ကာပူ VPN နှင့် Stream အကောင့်များ',
    titleEn: 'Unrestricted VPN Keys with Instant QR Scan',
    titleMm: 'QR Code Scan ဖတ်ရုံဖြင့် ချိတ်ဆက်နိုင်သော VPN Key များ',
    subtitleEn:
      'Every Outline & Shadowsocks order includes a scannable mobile QR code and offline text receipt backup.',
    subtitleMm:
      'Outline နှင့် Shadowsocks Key များကို App ထဲတွင် QR Code ဖြင့် တိုက်ရိုက် Scan ဖတ်နိုင်ပါသည်။',
    ctaLabelEn: 'Browse VPN Configs',
    ctaLabelMm: 'VPN များကြည့်မည်',
    targetCategory: 'VPN_CONFIG',
    imageUrl: '/images/hero-vpn.jpg',
  },
];

async function getPublicShopStatus() {
  const settings = await prisma.merchantSettings.findUnique({
    where: { id: 'default' },
    select: {
      isShopOpen: true,
      offlineNotice: true,
      brandLogoUrl: true,
      flashSaleEndsAt: true,
      flashSaleLabelEn: true,
      flashSaleLabelMm: true,
      heroSlides: true,
      updatedAt: true,
    },
  });

  const slides =
    Array.isArray(settings?.heroSlides) && settings.heroSlides.length > 0
      ? settings.heroSlides
      : DEFAULT_HERO_SLIDES;

  return {
    isShopOpen: settings?.isShopOpen ?? true,
    offlineNotice: settings?.offlineNotice ?? DEFAULT_OFFLINE_NOTICE,
    brandLogoUrl: settings?.brandLogoUrl ?? null,
    flashSaleEndsAt: settings?.flashSaleEndsAt ?? null,
    flashSaleLabelEn: settings?.flashSaleLabelEn ?? 'Flash Sale Ends In',
    flashSaleLabelMm: settings?.flashSaleLabelMm ?? 'အထူးလျှော့ဈေး ပြီးဆုံးရန်',
    heroSlides: slides,
    updatedAt: settings?.updatedAt ?? null,
  };
}

/**
 * GET /api/payment-methods
 * Public endpoint returning active KPay and WavePay merchant QR & phone instructions
 * along with the current shop operating status (Online / Night Mode).
 */
paymentMethodsRouter.get('/payment-methods', async (_req: Request, res: Response) => {
  try {
    const [methods, shopStatus] = await Promise.all([
      prisma.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          provider: true,
          accountName: true,
          accountPhone: true,
          qrImageUrl: true,
          instructionsEn: true,
          instructionsMm: true,
        },
      }),
      getPublicShopStatus(),
    ]);

    res.json({ paymentMethods: methods, shopStatus });
  } catch (err) {
    console.error('[GET /api/payment-methods] Error:', err);
    res.status(500).json({ error: 'Failed to load payment methods' });
  }
});

/**
 * GET /api/shop-status
 * Public endpoint returning Online / Night Mode operating status and delay notice.
 */
paymentMethodsRouter.get('/shop-status', async (_req: Request, res: Response) => {
  try {
    const shopStatus = await getPublicShopStatus();
    res.json(shopStatus);
  } catch (err) {
    console.error('[GET /api/shop-status] Error:', err);
    res.status(500).json({ error: 'Failed to load shop status' });
  }
});
