import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export function isPreviewVpnUri(value: string): boolean {
  return /^(ss|vmess|vless|trojan):\/\//i.test(value.trim());
}

interface PreviewVpnQrCodeProps {
  value: string;
  size?: number;
}

export function PreviewVpnQrCode({ value, size = 112 }: PreviewVpnQrCodeProps) {
  const trimmed = value.trim();
  if (!isPreviewVpnUri(trimmed)) return null;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-white p-2.5 shadow-sm">
      <QRCodeSVG value={trimmed} size={size} level="M" includeMargin={false} />
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-800">
        <QrCode className="h-3 w-3 text-emerald-700" aria-hidden="true" />
        <span>Scan in Outline / V2Ray</span>
      </span>
    </div>
  );
}
