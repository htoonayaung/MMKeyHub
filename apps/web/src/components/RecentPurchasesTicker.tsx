'use client';

import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RecentPurchaseActivity } from '@/lib/types';
import { useLocale } from '@/providers/LocaleProvider';

interface RecentPurchasesTickerProps {
  activities: RecentPurchaseActivity[];
}

export function RecentPurchasesTicker({ activities }: RecentPurchasesTickerProps) {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (activities.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % activities.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [activities.length]);

  if (activities.length === 0) return null;

  const current = activities[index % activities.length];
  const productTitle = locale === 'mm' ? current.productTitleMm : current.productTitleEn;
  const duration = locale === 'mm' ? current.durationLabelMm : current.durationLabelEn;
  const timeText =
    locale === 'mm'
      ? `လွန်ခဲ့သော ${current.minutesAgo} မိနစ်`
      : `${current.minutesAgo} ${current.minutesAgo === 1 ? 'min' : 'mins'} ago`;

  return (
    <div
      aria-live="polite"
      className="mb-6 flex min-h-[38px] items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#121826]/90 px-4 py-2 text-xs text-slate-600 dark:text-slate-300 shadow-xs"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <p className={`truncate ${locale === 'mm' ? 'font-myanmar-safe' : ''}`}>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {current.maskedBuyer}
          </span>{' '}
          <span className="text-slate-500 dark:text-slate-400">
            {locale === 'mm' ? 'မှ' : 'just purchased'}
          </span>{' '}
          <span className="font-medium text-emerald-700 dark:text-emerald-300">
            {productTitle}
            {duration ? ` (${duration})` : ''}
          </span>
          {locale === 'mm' ? ' ဝယ်ယူပြီးပါပြီ' : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {timeText}
        </span>
        {activities.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % activities.length)}
            aria-label="Next recent purchase"
            className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182133] hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
