import { ArrowRight, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { DeliveryFormat, PreviewHeroSlide, PreviewLocale } from '../previewData';

interface PreviewHeroSliderProps {
  locale: PreviewLocale;
  slides: PreviewHeroSlide[];
  flashSaleEndsAt: string | null;
  flashSaleLabelEn: string | null;
  flashSaleLabelMm: string | null;
  onSelectCategory: (cat: 'ALL' | DeliveryFormat) => void;
  rightSlot?: React.ReactNode;
}

interface RemainingTime {
  hours: string;
  minutes: string;
  seconds: string;
  expired: boolean;
}

function getRemainingTime(targetIso: string | null): RemainingTime | null {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return null;
  const diff = Math.max(0, targetMs - Date.now());
  if (diff <= 0) {
    return { hours: '00', minutes: '00', seconds: '00', expired: true };
  }
  const totalSec = Math.floor(diff / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return {
    hours: String(hrs).padStart(2, '0'),
    minutes: String(mins).padStart(2, '0'),
    seconds: String(secs).padStart(2, '0'),
    expired: false,
  };
}

export function PreviewHeroSlider({
  locale,
  slides,
  flashSaleEndsAt,
  flashSaleLabelEn,
  flashSaleLabelMm,
  onSelectCategory,
  rightSlot,
}: PreviewHeroSliderProps) {
  const isMm = locale === 'mm';
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<RemainingTime | null>(() =>
    getRemainingTime(flashSaleEndsAt)
  );

  const safeSlides = slides.length > 0 ? slides : [];
  const boundedIndex = safeSlides.length > 0 ? activeIndex % safeSlides.length : 0;
  const current = safeSlides[boundedIndex] ?? null;

  useEffect(() => {
    setCountdown(getRemainingTime(flashSaleEndsAt));
    if (!flashSaleEndsAt) return;
    const id = window.setInterval(() => {
      setCountdown(getRemainingTime(flashSaleEndsAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [flashSaleEndsAt]);

  useEffect(() => {
    if (safeSlides.length <= 1 || paused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safeSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [safeSlides.length, paused]);

  if (!current) return null;

  const badge = isMm ? current.badgeMm : current.badgeEn;
  const title = isMm ? current.titleMm : current.titleEn;
  const subtitle = isMm ? current.subtitleMm : current.subtitleEn;
  const ctaLabel = isMm ? current.ctaLabelMm : current.ctaLabelEn;
  const flashLabel = isMm
    ? flashSaleLabelMm || 'Flash Sale Ends In'
    : flashSaleLabelEn || 'Weekend Flash Sale';

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#121826]"
    >
      {current.imageUrl && (
        <div className="pointer-events-none absolute inset-0">
          <img
            src={current.imageUrl}
            alt=""
            className="h-full w-full object-cover opacity-20 dark:opacity-30 transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/75 dark:from-[#0B0F17] dark:via-[#121826]/92 dark:to-[#121826]/75" />
        </div>
      )}

      <div className="relative p-6 sm:p-8 lg:p-9">
        {countdown && !countdown.expired && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-50 px-3.5 py-2 text-xs dark:bg-amber-500/10">
            <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
              <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className={isMm ? 'font-myanmar-safe' : ''}>{flashLabel}</span>
            </div>
            <div className="flex items-center gap-1 font-mono-tabular font-semibold text-amber-900 dark:text-amber-200">
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5">{countdown.hours}h</span>
              <span>:</span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5">{countdown.minutes}m</span>
              <span>:</span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5">{countdown.seconds}s</span>
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p
              className={`text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {badge}
            </p>
            <h1
              className={`mt-2.5 text-2xl font-semibold text-slate-900 dark:text-slate-50 sm:text-4xl ${
                isMm ? 'font-myanmar-safe' : 'tracking-tight'
              }`}
            >
              {title}
            </h1>
            <p
              className={`mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {subtitle}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => onSelectCategory(current.targetCategory)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <span>{ctaLabel}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              {safeSlides.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous slide"
                    onClick={() =>
                      setActiveIndex((prev) => (prev - 1 + safeSlides.length) % safeSlides.length)
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#0B0F17]/80 dark:text-slate-200 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {safeSlides.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-label={`Slide ${idx + 1}`}
                        onClick={() => setActiveIndex(idx)}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === boundedIndex
                            ? 'w-5 bg-emerald-500'
                            : 'w-2 bg-slate-300 dark:bg-white/25 hover:bg-emerald-400/60'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label="Next slide"
                    onClick={() => setActiveIndex((prev) => (prev + 1) % safeSlides.length)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 hover:border-emerald-500/50 dark:border-white/[0.12] dark:bg-[#0B0F17]/80 dark:text-slate-200 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {rightSlot && <div className="lg:col-span-5">{rightSlot}</div>}
        </div>
      </div>
    </section>
  );
}
