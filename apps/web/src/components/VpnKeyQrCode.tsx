'use client';

import { QRCodeSVG } from 'qrcode.react';

const VPN_URI_PREFIX_RE = /^(ss|vmess|vless|trojan):\/\//i;

export function isVpnUriPayload(value: string): boolean {
  return VPN_URI_PREFIX_RE.test(value.trim());
}

interface VpnKeyQrCodeProps {
  value: string;
  size?: number;
  label?: string;
}

export function VpnKeyQrCode({
  value,
  size = 112,
  label = 'Scan in Outline / V2Ray',
}: VpnKeyQrCodeProps) {
  const cleanValue = value.trim();
  if (!isVpnUriPayload(cleanValue)) return null;

  return (
    <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/[0.1] bg-white p-2.5 text-slate-900 shadow-sm">
      <QRCodeSVG
        value={cleanValue}
        size={size}
        level="M"
        bgColor="#FFFFFF"
        fgColor="#0F172A"
        includeMargin={false}
      />
      <span className="mt-1.5 text-[10px] font-semibold tracking-wide text-slate-600">
        {label}
      </span>
    </div>
  );
}
