import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'MMKeyHub — Restricted Admin Portal',
  description: 'Isolated operations console for MMKeyHub administrators.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0B0F17]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/images/mmkeyhub-icon.png"
              alt="MMKeyHub"
              className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/15 shrink-0"
            />
            <span className="text-sm font-semibold tracking-tight text-slate-100 truncate">
              MMKeyHub
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 shrink-0">
              <Shield className="h-3 w-3" aria-hidden="true" />
              Admin Portal
            </span>
          </div>

          <Link
            href="/"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-emerald-500/40 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Return to Storefront</span>
          </Link>
        </div>
      </header>

      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </div>
  );
}
