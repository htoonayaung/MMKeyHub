import crypto from 'node:crypto';
import {
  AssetStatus,
  DeliveryFormat,
  DiscountType,
  PaymentProvider,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

function encryptForSeed(plaintext: string): {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyFingerprint: string;
} {
  const rawKey = (process.env.ENCRYPTION_KEY ?? process.env.ENCRYPTION_MASTER_KEY ?? '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      'ENCRYPTION_KEY (64 hex chars) must be set in environment before seeding encrypted stock.'
    );
  }
  const key = Buffer.from(rawKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const keyFingerprint = crypto.createHash('sha256').update(plaintext.trim(), 'utf8').digest('hex');

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyFingerprint,
  };
}

async function main() {
  console.log('[Seed] Seeding MMKeyHub payment methods, categories, sample products, and promo codes...');

  // 1. Payment Methods (KPay & WavePay)
  await prisma.paymentMethod.upsert({
    where: { provider: PaymentProvider.KPAY },
    update: {},
    create: {
      provider: PaymentProvider.KPAY,
      accountName: 'MMKeyHub Merchant (KBZPay)',
      accountPhone: '09777000111',
      qrImageUrl: '',
      instructionsEn: 'Transfer the exact MMK amount via KBZPay and upload your slip screenshot.',
      instructionsMm: 'ကျသင့်ငွေအတိအကျကို KBZPay ဖြင့်လွှဲပြီး ပြေစာပုံတင်ပေးပါ။',
      isActive: true,
      sortOrder: 1,
    },
  });

  await prisma.paymentMethod.upsert({
    where: { provider: PaymentProvider.WAVEPAY },
    update: {},
    create: {
      provider: PaymentProvider.WAVEPAY,
      accountName: 'MMKeyHub Merchant (WavePay)',
      accountPhone: '09777000222',
      qrImageUrl: '',
      instructionsEn: 'Transfer the exact MMK amount via WavePay and upload your receipt screenshot.',
      instructionsMm: 'ကျသင့်ငွေအတိအကျကို WavePay ဖြင့်လွှဲပြီး ပြေစာပုံတင်ပေးပါ။',
      isActive: true,
      sortOrder: 2,
    },
  });

  await prisma.merchantSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      isShopOpen: true,
      offlineNotice:
        'Night Mode is active. Admin approvals may be delayed until morning (08:00 AM MMT). You can still submit orders to reserve stock.',
    },
  });

  // 2. Categories
  const catKeys = await prisma.category.upsert({
    where: { slug: 'license-keys' },
    update: {},
    create: {
      slug: 'license-keys',
      nameEn: 'License Keys',
      nameMm: 'Software License Keys',
      sortOrder: 1,
    },
  });

  const catAccounts = await prisma.category.upsert({
    where: { slug: 'accounts' },
    update: {},
    create: {
      slug: 'accounts',
      nameEn: 'Premium Accounts',
      nameMm: 'Premium Accounts',
      sortOrder: 2,
    },
  });

  const catVpn = await prisma.category.upsert({
    where: { slug: 'vpn' },
    update: {},
    create: {
      slug: 'vpn',
      nameEn: 'VPN Configs',
      nameMm: 'VPN Config များ',
      sortOrder: 3,
    },
  });

  // 3. Sample Products
  const sampleProducts = [
    {
      categoryId: catKeys.id,
      slug: 'windows-11-pro-retail-key',
      titleEn: 'Windows 11 Pro Retail Key',
      titleMm: 'Windows 11 Pro တရားဝင် Retail Key',
      descriptionEn: 'Genuine 25-character retail activation key for 1 PC. Supports clean install and upgrade.',
      descriptionMm: 'PC ၁ လုံးအတွက် ၂၅ လုံးပါ တရားဝင် Retail Activation Key ဖြစ်ပါသည်။',
      deliveryInstructionsEn: 'Go to Settings > System > Activation > Change product key and enter your 25-digit code.',
      deliveryInstructionsMm: 'Settings > System > Activation > Change product key တွင် ထည့်သွင်းအသုံးပြုပါ။',
      priceMmk: 25000,
      originalPriceMmk: 35000,
      deliveryFormat: DeliveryFormat.LICENSE_KEY,
      imageUrl: '/images/cover-win11.jpg',
      durationLabelEn: 'Lifetime',
      durationLabelMm: 'တစ်သက်တာ',
      isFeatured: true,
      sortOrder: 1,
      demoSecrets: ['DEMO1-WIN11-PRO01-KEY01-AAAAA', 'DEMO2-WIN11-PRO02-KEY02-BBBBB'],
    },
    {
      categoryId: catVpn.id,
      slug: 'expressvpn-activation-1m',
      titleEn: 'ExpressVPN Activation Code',
      titleMm: 'ExpressVPN ၁ လသုံး Activation Code',
      descriptionEn: 'High-speed encrypted VPN subscription for PC, Mac, iOS & Android with unlimited bandwidth.',
      descriptionMm: 'ဖုန်းနှင့် ကွန်ပျူတာများတွင် မြန်နှုန်းမြင့် အသုံးပြုနိုင်သော ExpressVPN ၁ လသုံး ကုဒ်ဖြစ်ပါသည်။',
      deliveryInstructionsEn: 'Download ExpressVPN on your device, choose Sign In with Activation Code, and paste your unlocked code.',
      deliveryInstructionsMm: 'ExpressVPN App ကိုဖွင့်ပြီး Activation Code ဖြင့် Sign In ဝင်ကာ ရရှိသောကုဒ်ကို ထည့်သွင်းပါ။',
      priceMmk: 18500,
      originalPriceMmk: 24000,
      deliveryFormat: DeliveryFormat.VPN_CONFIG,
      imageUrl: '/images/cover-expressvpn.jpg',
      durationLabelEn: '1 Month',
      durationLabelMm: '၁ လ',
      isFeatured: true,
      sortOrder: 2,
      demoSecrets: ['EXP-MM94-821K-QPLZ-1190', 'EXP-MM94-552J-WERT-4402'],
    },
    {
      categoryId: catAccounts.id,
      slug: 'chatgpt-plus-private-1m',
      titleEn: 'ChatGPT Plus Private Account',
      titleMm: 'ChatGPT Plus ကိုယ်ပိုင်အကောင့် (၁ လ)',
      descriptionEn: 'Dedicated 1-month Plus account with GPT-4o, voice mode, and priority access included.',
      descriptionMm: 'GPT-4o နှင့် Priority Access အပြည့်အစုံပါဝင်သော ၁ လသုံး ကိုယ်ပိုင် ChatGPT Plus အကောင့် ဖြစ်ပါသည်။',
      deliveryInstructionsEn: 'Open chatgpt.com and sign in with the email and password provided.',
      deliveryInstructionsMm: 'chatgpt.com တွင် ပေးထားသော Email နှင့် Password ဖြင့် Login ဝင်ရောက်အသုံးပြုပါ။',
      priceMmk: 59000,
      originalPriceMmk: null,
      deliveryFormat: DeliveryFormat.ACCOUNT_LOGIN,
      imageUrl: '/images/cover-chatgpt.jpg',
      durationLabelEn: '1 Month',
      durationLabelMm: '၁ လ',
      isFeatured: true,
      sortOrder: 3,
      demoSecrets: ['gpt-demo-01@mmkeyhub.example | VaultGpt#2026'],
    },
    {
      categoryId: catAccounts.id,
      slug: 'netflix-4k-private-profile-1m',
      titleEn: 'Netflix 4K UHD Private Profile',
      titleMm: 'Netflix 4K UHD ကိုယ်ပိုင် Profile (၁ လ)',
      descriptionEn: '1 dedicated PIN-locked 4K HDR profile on a private billing account. Works on TV, Mobile, and Laptop.',
      descriptionMm: 'PIN ပါဝင်သော 4K UHD ကိုယ်ပိုင် Profile ၁ ခု ဖြစ်ပါသည်။ TV နှင့် ဖုန်းတို့တွင် အသုံးပြုနိုင်ပါသည်။',
      deliveryInstructionsEn: 'Sign in with the provided email/password and select your assigned Profile + PIN.',
      deliveryInstructionsMm: 'ပေးထားသော Email/Password ဖြင့်ဝင်ပြီး သင့် Profile နံပါတ်နှင့် PIN ကိုရွေးချယ်ပါ။',
      priceMmk: 16500,
      originalPriceMmk: null,
      deliveryFormat: DeliveryFormat.ACCOUNT_LOGIN,
      imageUrl: '/images/cover-netflix.jpg',
      durationLabelEn: '1 Month',
      durationLabelMm: '၁ လ',
      isFeatured: true,
      sortOrder: 4,
      demoSecrets: ['nf-demo-01@mmkeyhub.example | Pass#2026! | Profile 2 (PIN: 4411)'],
    },
    {
      categoryId: catVpn.id,
      slug: 'outline-vpn-singapore-1m',
      titleEn: 'Outline VPN Singapore High-Speed',
      titleMm: 'Outline VPN စင်ကာပူ High-Speed (၁ လ)',
      descriptionEn: 'Low-latency Singapore Shadowsocks key optimized for Myanmar fiber and mobile networks. 200 GB monthly quota.',
      descriptionMm: 'မြန်မာအင်တာနက်လိုင်းများအတွက် မြန်နှုန်းမြင့် စင်ကာပူ Outline VPN Key (200 GB) ဖြစ်ပါသည်။',
      deliveryInstructionsEn: 'Copy the ss:// access key and paste it into the Outline Client app on iOS, Android, Windows, or macOS.',
      deliveryInstructionsMm: 'ss:// Key ကိုကူးယူပြီး Outline App ထဲတွင် Add Server နှိပ်၍ ထည့်သွင်းပါ။',
      priceMmk: 8000,
      originalPriceMmk: 10000,
      deliveryFormat: DeliveryFormat.VPN_CONFIG,
      imageUrl: '/images/cover-outline.jpg',
      durationLabelEn: '1 Month · 200 GB',
      durationLabelMm: '၁ လ · 200 GB',
      isFeatured: true,
      sortOrder: 5,
      demoSecrets: [
        'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXNlY3JldC0wMQ@sg01.example.com:8443/?outline=1',
        'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXNlY3JldC0wMg@sg01.example.com:8443/?outline=1',
      ],
    },
    {
      categoryId: catAccounts.id,
      slug: 'cursor-pro-ai-dev-1m',
      titleEn: 'Cursor Pro / AI Dev Seat',
      titleMm: 'Cursor Pro AI Dev အကောင့် (၁ လ)',
      descriptionEn: 'Private 1-month Pro workspace credentials with fast premium model quota ready for immediate use.',
      descriptionMm: '၁ လသုံး ကိုယ်ပိုင် Cursor Pro အကောင့် ဖြစ်ပါသည်။',
      deliveryInstructionsEn: 'Open cursor.com or the Cursor desktop editor and sign in with the email and password provided.',
      deliveryInstructionsMm: 'cursor.com သို့မဟုတ် Cursor Editor တွင် ပေးထားသော Email/Password ဖြင့် ဝင်ရောက်အသုံးပြုပါ။',
      priceMmk: 68000,
      originalPriceMmk: null,
      deliveryFormat: DeliveryFormat.ACCOUNT_LOGIN,
      imageUrl: '/images/cover-cursor.jpg',
      durationLabelEn: '1 Month',
      durationLabelMm: '၁ လ',
      isFeatured: true,
      sortOrder: 6,
      demoSecrets: ['devseat-demo-01@mmkeyhub.example | Cur$or2026!'],
    },
  ];

  const hasEncryptionKey = /^[0-9a-fA-F]{64}$/.test(
    (process.env.ENCRYPTION_KEY ?? process.env.ENCRYPTION_MASTER_KEY ?? '').trim()
  );

  for (const item of sampleProducts) {
    const { demoSecrets, ...productData } = item;
    const product = await prisma.product.upsert({
      where: { slug: productData.slug },
      update: {},
      create: productData,
    });

    if (hasEncryptionKey) {
      const assets = demoSecrets.map((secret) => {
        const envData = encryptForSeed(secret);
        return {
          productId: product.id,
          status: AssetStatus.AVAILABLE,
          encryptedPayload: envData.encryptedPayload,
          iv: envData.iv,
          authTag: envData.authTag,
          keyFingerprint: envData.keyFingerprint,
          regionLabel: product.deliveryFormat === DeliveryFormat.VPN_CONFIG ? 'SG-01' : null,
        };
      });

      await prisma.digitalAsset.createMany({
        data: assets,
        skipDuplicates: true,
      });
    }
  }

  // 4. Sample Promo Codes
  await prisma.promoCode.upsert({
    where: { code: 'KYAT10' },
    update: {},
    create: {
      code: 'KYAT10',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      maxUses: 100,
      isActive: true,
    },
  });

  await prisma.promoCode.upsert({
    where: { code: 'WELCOME2000' },
    update: {},
    create: {
      code: 'WELCOME2000',
      discountType: DiscountType.FIXED_MMK,
      discountValue: 2000,
      maxUses: 50,
      isActive: true,
    },
  });

  console.log('[Seed] Done.');
}

main()
  .catch((err) => {
    console.error('[Seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
