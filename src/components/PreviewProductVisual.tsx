import { KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DeliveryFormat } from '../previewData';
import { detectPreviewVendor } from '../utils/previewUtils';

interface PreviewProductVisualProps {
  imageUrl?: string | null;
  title: string;
  deliveryFormat: DeliveryFormat;
}

export function PreviewProductVisual({
  imageUrl,
  title,
  deliveryFormat,
}: PreviewProductVisualProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const vendor = detectPreviewVendor(title, deliveryFormat);

  if (imageUrl && !imgFailed) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl border-b border-slate-200 bg-[#0B0F17] dark:border-white/[0.06]">
        <img
          src={imageUrl}
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
      className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl border-b border-slate-200 bg-slate-900/95 bg-gradient-to-br dark:border-white/[0.06] dark:bg-transparent ${vendor.accentSurfaceClass}`}
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
      <div className="relative flex flex-col items-center gap-2.5 transition-transform duration-200 group-hover:scale-[1.03]">
        <div
          className={`flex h-13 w-13 items-center justify-center rounded-xl border ${vendor.accentBorderClass} bg-[#121826]/90 backdrop-blur-sm`}
        >
          <Icon className={`h-6 w-6 ${vendor.accentTextClass}`} aria-hidden="true" />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`font-semibold ${vendor.accentTextClass}`}>{vendor.name}</span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="font-mono-tabular text-slate-300">{vendor.monogram}</span>
        </div>
      </div>
    </div>
  );
}
