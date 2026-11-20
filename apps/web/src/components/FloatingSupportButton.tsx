'use client';

import { ExternalLink, LifeBuoy, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isAdminPortalPathname } from '@/lib/adminRoute';
import { useLocale } from '@/providers/LocaleProvider';

const BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'MMKeyHubBot').replace(
  /^@/,
  ''
);

export function FloatingSupportButton() {
  const pathname = usePathname();
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);

  if (isAdminPortalPathname(pathname)) {
    return null;
  }

  const supportHref = `https://t.me/${BOT_USERNAME}?start=support`;
  const isMm = locale === 'mm';

  return (
    <div className="fixed bottom-4 right-4 z-30 hidden md:flex flex-col items-end gap-2.5">
      {open && (
        <div
          role="dialog"
          aria-label={t.supportTitle}
          className="w-72 rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#121826] p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className={`text-sm font-semibold text-slate-900 dark:text-slate-50 ${isMm ? 'font-myanmar-safe' : ''}`}>
                {t.supportTitle}
              </h2>
              <p className="font-mono-tabular text-xs text-emerald-600 dark:text-emerald-400">
                @{BOT_USERNAME}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p
            className={`mt-2.5 text-xs text-slate-600 dark:text-slate-300 ${
              isMm ? 'font-myanmar-safe leading-relaxed' : 'leading-relaxed'
            }`}
          >
            {t.supportBody}
          </p>

          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3.5 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
          >
            <span>{t.supportCta}</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/35 bg-white/95 dark:bg-[#121826]/95 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 shadow-lg backdrop-blur-md hover:border-emerald-400 transition-colors whitespace-nowrap cursor-pointer"
      >
        <LifeBuoy className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
        <span>{t.supportButtonLabel}</span>
      </button>
    </div>
  );
}
