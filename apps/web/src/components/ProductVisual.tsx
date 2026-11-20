'use client';

import { KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DeliveryFormat } from '@/lib/types';
import { detectProductVendor } from '@/lib/vendorUtils';

interface ProductVisualProps {
  imageUrl: string | null;
  title: string;
  slug?: string;
  deliveryFormat: DeliveryFormat;
}

export function resolveDefaultProductCover(slugOrTitle: string): string | null {
  const hay = slugOrTitle.toLowerCase();
  if (hay.includes('windows') || hay.includes('win11')) return '/images/cover-win11.jpg';
  if (hay.includes('expressvpn')) return '/images/cover-expressvpn.jpg';
  if (hay.includes('chatgpt') || hay.includes('openai')) return '/images/cover-chatgpt.jpg';
  if (hay.includes('netflix')) return '/images/cover-netflix.jpg';
  if (hay.includes('outline')) return '/images/cover-outline.jpg';
  if (hay.includes('cursor')) return '/images/cover-cursor.jpg';
  return null;
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || '/api')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

export function resolveCoverSrc(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/api/')) {
    return `${API_ORIGIN}${url}`;
  }
  return url;
}

export function ProductVisual({ imageUrl, title, slug = '', deliveryFormat }: ProductVisualProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedCoverUrl = resolveCoverSrc(
    imageUrl || resolveDefaultProductCover(`${slug} ${title}`)
  );

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedCoverUrl]);

  const vendor = detectProductVendor(`${slug} ${title}`, deliveryFormat);

  if (resolvedCoverUrl && !imgFailed) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl border-b border-slate-200 dark:border-white/[0.06] bg-[#0B0F17]">
        <img
          src={resolvedCoverUrl}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
      </div>
    );
  }

  const Icon =
    deliveryFormat === 'LICENSE_KEY'
      ? KeyRound
      : deliveryFormat === 'ACCOUNT_LOGIN'
        ? UserCheck
        : ShieldCheck;

  return (
    <div
      className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-xl bg-gradient-to-br ${vendor.accentSurfaceClass} border-b border-white/[0.06]`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.22) 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="relative flex flex-col items-center gap-2.5 px-6 text-center transition-transform duration-200 group-hover:scale-[1.03]">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-xl border ${vendor.accentBorderClass} bg-[#121826]/90 backdrop-blur-sm`}
        >
          <Icon className={`h-7 w-7 ${vendor.accentTextClass}`} aria-hidden="true" />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`font-semibold ${vendor.accentTextClass}`}>{vendor.name}</span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="font-mono-tabular text-slate-400">{vendor.monogram}</span>
        </div>
      </div>
    </div>
  );
}
