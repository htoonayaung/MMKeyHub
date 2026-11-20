import type { DeliveryFormat, PreviewLocale } from '../previewData';

export interface PreviewCompressedImage {
  dataUrl: string;
  filename: string;
  originalBytes: number;
  compressedBytes: number;
  wasCompressed: boolean;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode image'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(srcUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = srcUrl;
  });
}

export async function compressPreviewImage(
  file: File,
  options: { maxDimension?: number; quality?: number; skipUnderBytes?: number } = {}
): Promise<PreviewCompressedImage> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.82;
  const skipUnderBytes = options.skipUnderBytes ?? 120 * 1024;

  const originalDataUrl = await readAsDataUrl(file);
  if (file.size <= skipUnderBytes || file.type === 'image/svg+xml') {
    return {
      dataUrl: originalDataUrl,
      filename: file.name,
      originalBytes: file.size,
      compressedBytes: file.size,
      wasCompressed: false,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        dataUrl: originalDataUrl,
        filename: file.name,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
      };
    }

    ctx.drawImage(img, 0, 0, width, height);
    const mime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));

    if (!blob || blob.size >= file.size) {
      return {
        dataUrl: originalDataUrl,
        filename: file.name,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
      };
    }

    const compressedDataUrl = await readAsDataUrl(blob);
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';

    return {
      dataUrl: compressedDataUrl,
      filename: `${baseName}.${ext}`,
      originalBytes: file.size,
      compressedBytes: blob.size,
      wasCompressed: true,
    };
  } catch {
    return {
      dataUrl: originalDataUrl,
      filename: file.name,
      originalBytes: file.size,
      compressedBytes: file.size,
      wasCompressed: false,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface PreviewVendorMeta {
  name: string;
  monogram: string;
  accentTextClass: string;
  accentBorderClass: string;
  accentSurfaceClass: string;
}

export function detectPreviewVendor(
  titleOrId: string,
  deliveryFormat: DeliveryFormat
): PreviewVendorMeta {
  const value = titleOrId.toLowerCase();

  if (value.includes('windows') || value.includes('microsoft')) {
    return {
      name: 'Windows',
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
  if (value.includes('cursor')) {
    return {
      name: 'Cursor',
      monogram: 'CUR',
      accentTextClass: 'text-teal-300',
      accentBorderClass: 'border-teal-400/25',
      accentSurfaceClass: 'from-teal-500/20 via-slate-900/70 to-[#0E1420]',
    };
  }

  return {
    name:
      deliveryFormat === 'LICENSE_KEY'
        ? 'License Key'
        : deliveryFormat === 'ACCOUNT_LOGIN'
          ? 'Premium Seat'
          : 'VPN Access',
    monogram:
      deliveryFormat === 'LICENSE_KEY'
        ? 'KEY'
        : deliveryFormat === 'ACCOUNT_LOGIN'
          ? 'ACC'
          : 'VPN',
    accentTextClass: 'text-emerald-300',
    accentBorderClass: 'border-emerald-400/25',
    accentSurfaceClass: 'from-emerald-500/15 via-slate-900/70 to-[#0E1420]',
  };
}

export function buildPreviewActivationSteps(
  rawInstructions: string,
  locale: PreviewLocale
): string[] {
  const cleaned = rawInstructions.trim();
  const split = cleaned
    .split(/\r?\n|(?<=[.?!။])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (split.length >= 2) return split;

  if (locale === 'mm') {
    return [
      'KPay သို့မဟုတ် WavePay ဖြင့် ငွေလွှဲပြီး ပြေစာပုံတင်သွင်းပါ။',
      cleaned || 'Admin အတည်ပြုပြီးသည်နှင့် Key ကို Order Tracker နှင့် Telegram DM တွင် ရရှိပါမည်။',
      'သက်ဆိုင်ရာ App / Settings ထဲတွင် Key ကို ထည့်သွင်းအသုံးပြုပါ။',
    ];
  }

  return [
    'Transfer exact MMK via KPay or WavePay and submit your payment receipt.',
    cleaned || 'Copy your decrypted key once approved on Web Tracker or Telegram DM.',
    'Follow the activation prompt inside your app to complete setup immediately.',
  ];
}
