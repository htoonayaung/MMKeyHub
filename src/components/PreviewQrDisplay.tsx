import { Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import type { PaymentProvider } from '../previewData';

interface PreviewQrDisplayProps {
  provider: PaymentProvider;
  accountName: string;
  accountPhone: string;
  qrImageUrl?: string;
  amountMmk?: number;
  size?: number;
  saveLabel?: string;
  hideSaveButton?: boolean;
  onSaved?: () => void;
}

export function PreviewQrDisplay({
  provider,
  accountName,
  accountPhone,
  qrImageUrl,
  amountMmk,
  size = 112,
  saveLabel = 'Save QR Image',
  hideSaveButton = false,
  onSaved,
}: PreviewQrDisplayProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const qrBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [qrImageUrl, provider]);

  const trimmed = qrImageUrl?.trim() ?? '';
  const cleanPhone = accountPhone.replace(/\s+/g, '');
  const payload = `${provider}:${cleanPhone}|${accountName}${amountMmk ? `|${amountMmk}MMK` : ''}`;
  const isCustomImage = Boolean(trimmed && !imgFailed);

  async function triggerPngDownload(sourceUrl: string) {
    const link = document.createElement('a');
    link.href = sourceUrl;
    link.download = `${provider.toLowerCase()}-qr-${cleanPhone || 'mmkeyhub'}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onSaved?.();
  }

  async function renderBitmapToCardCanvas(img: HTMLImageElement): Promise<string> {
    const canvasSize = 600;
    const cardHeight = 680;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = cardHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasSize, cardHeight);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      provider === 'KPAY' ? 'KBZPay (KPay) · MMKeyHub' : 'WavePay · MMKeyHub',
      canvasSize / 2,
      46
    );

    const qrDrawSize = 460;
    const qrX = (canvasSize - qrDrawSize) / 2;
    const qrY = 74;
    ctx.drawImage(img, qrX, qrY, qrDrawSize, qrDrawSize);

    ctx.fillStyle = '#334155';
    ctx.font = '600 22px sans-serif';
    ctx.fillText(`${accountName} · ${accountPhone}`, canvasSize / 2, 585);

    if (amountMmk && amountMmk > 0) {
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`Amount: ${amountMmk.toLocaleString('en-US')} MMK`, canvasSize / 2, 628);
    }

    return canvas.toDataURL('image/png');
  }

  async function handleSaveQrImage() {
    if (saving) return;
    setSaving(true);
    try {
      if (isCustomImage) {
        if (trimmed.startsWith('data:image/')) {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = trimmed;
          });
          const pngUrl = await renderBitmapToCardCanvas(img);
          await triggerPngDownload(pngUrl);
          return;
        }
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('CORS blocked'));
            img.src = trimmed;
          });
          const pngUrl = await renderBitmapToCardCanvas(img);
          await triggerPngDownload(pngUrl);
          return;
        } catch {
          const link = document.createElement('a');
          link.href = trimmed;
          link.download = `${provider.toLowerCase()}-qr.png`;
          link.target = '_blank';
          link.rel = 'noreferrer';
          document.body.appendChild(link);
          link.click();
          link.remove();
          onSaved?.();
          return;
        }
      }

      const svgEl = qrBoxRef.current?.querySelector('svg');
      if (!svgEl) return;
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('SVG render failed'));
          img.src = svgUrl;
        });
        const pngUrl = await renderBitmapToCardCanvas(img);
        await triggerPngDownload(pngUrl);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch {
      // Ignore silent canvas failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={qrBoxRef}
        className="flex flex-col items-center justify-center rounded-xl border border-white/[0.1] bg-white p-2.5 text-slate-900 shadow-sm"
      >
        {isCustomImage ? (
          <img
            src={trimmed}
            alt={`${provider} Merchant QR`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            style={{ width: size, height: size }}
            className="object-contain"
          />
        ) : (
          <QRCodeSVG
            value={payload}
            size={size}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#0F172A"
            includeMargin={false}
          />
        )}
        <span className="font-mono-tabular mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {isCustomImage ? `${provider} QR` : `${provider} · AUTO QR`}
        </span>
      </div>

      {!hideSaveButton && (
        <button
          type="button"
          onClick={() => void handleSaveQrImage()}
          disabled={saving}
          className="inline-flex min-h-[32px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-emerald-500/50 hover:text-emerald-700 dark:border-white/[0.12] dark:bg-[#121826] dark:text-slate-200 dark:hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Download className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>{saving ? '...' : saveLabel}</span>
        </button>
      )}
    </div>
  );
}
