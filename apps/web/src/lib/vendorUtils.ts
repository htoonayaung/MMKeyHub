import type { UiLocale } from '@/i18n/dictionary';
import type { DeliveryFormat } from './types';

export interface VendorMeta {
  name: string;
  monogram: string;
  accentTextClass: string;
  accentBorderClass: string;
  accentSurfaceClass: string;
}

export function detectProductVendor(
  titleOrSlug: string,
  deliveryFormat: DeliveryFormat
): VendorMeta {
  const value = titleOrSlug.toLowerCase();

  if (value.includes('windows') || value.includes('microsoft') || value.includes('office')) {
    return {
      name: 'Windows / MS',
      monogram: 'WIN',
      accentTextClass: 'text-sky-300',
      accentBorderClass: 'border-sky-400/25',
      accentSurfaceClass: 'from-sky-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('netflix')) {
    return {
      name: 'Netflix',
      monogram: 'NFX',
      accentTextClass: 'text-rose-300',
      accentBorderClass: 'border-rose-400/25',
      accentSurfaceClass: 'from-rose-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('chatgpt') || value.includes('openai')) {
    return {
      name: 'ChatGPT',
      monogram: 'GPT',
      accentTextClass: 'text-emerald-300',
      accentBorderClass: 'border-emerald-400/25',
      accentSurfaceClass: 'from-emerald-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('cursor')) {
    return {
      name: 'Cursor',
      monogram: 'CUR',
      accentTextClass: 'text-teal-300',
      accentBorderClass: 'border-teal-400/25',
      accentSurfaceClass: 'from-teal-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('expressvpn')) {
    return {
      name: 'ExpressVPN',
      monogram: 'EXP',
      accentTextClass: 'text-amber-300',
      accentBorderClass: 'border-amber-400/25',
      accentSurfaceClass: 'from-amber-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('outline')) {
    return {
      name: 'Outline',
      monogram: 'OUT',
      accentTextClass: 'text-emerald-300',
      accentBorderClass: 'border-emerald-400/25',
      accentSurfaceClass: 'from-emerald-500/18 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (value.includes('spotify')) {
    return {
      name: 'Spotify',
      monogram: 'SPT',
      accentTextClass: 'text-emerald-300',
      accentBorderClass: 'border-emerald-400/25',
      accentSurfaceClass: 'from-emerald-500/18 via-slate-900/70 to-[#0E1420]',
    };
  }

  if (deliveryFormat === 'LICENSE_KEY') {
    return {
      name: 'Software Key',
      monogram: 'KEY',
      accentTextClass: 'text-emerald-300',
      accentBorderClass: 'border-emerald-400/25',
      accentSurfaceClass: 'from-emerald-500/15 via-slate-900/70 to-[#0E1420]',
    };
  }
  if (deliveryFormat === 'ACCOUNT_LOGIN') {
    return {
      name: 'Premium Seat',
      monogram: 'ACC',
      accentTextClass: 'text-sky-300',
      accentBorderClass: 'border-sky-400/25',
      accentSurfaceClass: 'from-sky-500/15 via-slate-900/70 to-[#0E1420]',
    };
  }
  return {
    name: 'VPN Access',
    monogram: 'VPN',
    accentTextClass: 'text-amber-300',
    accentBorderClass: 'border-amber-400/25',
    accentSurfaceClass: 'from-amber-500/15 via-slate-900/70 to-[#0E1420]',
  };
}

export function buildActivationSteps(
  rawInstructions: string | null | undefined,
  deliveryFormat: DeliveryFormat,
  locale: UiLocale
): string[] {
  const cleaned = rawInstructions?.trim() ?? '';
  if (cleaned) {
    const split = cleaned
      .split(/\r?\n|(?<=[.?!။])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length >= 2) {
      return split;
    }
    if (locale === 'mm') {
      return [
        'KPay သို့မဟုတ် WavePay ဖြင့် ငွေလွှဲပြီး ပြေစာတင်သွင်းပါ။',
        cleaned,
        'Admin အတည်ပြုပြီးသည်နှင့် Order Page နှင့် Telegram DM တွင် Key ချက်ချင်းပေါ်လာပါမည်။',
      ];
    }
    return [
      'Complete payment via KPay or WavePay and submit your receipt screenshot.',
      cleaned,
      'Once verified, copy your unlocked credential directly from your Order page or Telegram DM.',
    ];
  }

  if (locale === 'mm') {
    if (deliveryFormat === 'LICENSE_KEY') {
      return [
        'KPay / WavePay ဖြင့် ငွေလွှဲပြေစာတင်ပြီး အတည်ပြုချက်စောင့်ဆိုင်းပါ။',
        'ရရှိလာသော ၂၅ လုံးပါ Activation Key ကို ကူးယူပါ။',
        'သက်ဆိုင်ရာ Software Settings > Activation ထဲတွင် ထည့်သွင်းအသုံးပြုပါ။',
      ];
    }
    if (deliveryFormat === 'ACCOUNT_LOGIN') {
      return [
        'KPay / WavePay ဖြင့် ငွေလွှဲပြေစာတင်ပြီး အတည်ပြုချက်စောင့်ဆိုင်းပါ။',
        'ပေးပို့ထားသော Email၊ Password နှင့် Profile PIN ကို ကူးယူပါ။',
        'သက်ဆိုင်ရာ App ထဲသို့ Login ဝင်၍ သင့် Profile ကို ရွေးချယ်အသုံးပြုပါ။',
      ];
    }
    return [
      'KPay / WavePay ဖြင့် ငွေလွှဲပြေစာတင်ပြီး အတည်ပြုချက်စောင့်ဆိုင်းပါ။',
      'ရရှိလာသော Access Key (ss:// သို့မဟုတ် Config) ကို ကူးယူပါ။',
      'Outline Client / VPN App ထဲတွင် Add Server နှိပ်၍ ချိတ်ဆက်အသုံးပြုပါ။',
    ];
  }

  if (deliveryFormat === 'LICENSE_KEY') {
    return [
      'Pay with KPay or WavePay and upload your transfer receipt.',
      'Copy the decrypted license key once your order status switches to Approved.',
      'Paste the key into your software activation screen to verify immediately.',
    ];
  }
  if (deliveryFormat === 'ACCOUNT_LOGIN') {
    return [
      'Pay with KPay or WavePay and upload your transfer receipt.',
      'Retrieve your encrypted email, password, and assigned profile PIN.',
      'Sign in using the official app and select your dedicated profile.',
    ];
  }
  return [
    'Pay with KPay or WavePay and upload your transfer receipt.',
    'Copy the unlocked VPN access key or configuration link.',
    'Import it into Outline Client or your VPN app and tap Connect.',
  ];
}
