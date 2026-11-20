'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Flame, ShieldCheck, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DeliveryFormat, HeroSlideItem } from '@/lib/types';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram } from '@/providers/TelegramProvider';

interface HeroBannerSliderProps {
  slides?: HeroSlideItem[];
  flashSaleEndsAt?: string | null;
  flashSaleLabelEn?: string | null;
  flashSaleLabelMm?: string | null;
  onSelectCategory?: (category: DeliveryFormat | 'ALL') => void;
}

const FALLBACK_SLIDES: HeroSlideItem[] = [
  {
    id: 'flash-campaign',
    imageUrl: '/images/hero-campaign.jpg',
    kickerEn: '24/7 Instant Verification · Flash Deals',
    kickerMm: '၂၄ နာရီ အလိုအလျောက် · Flash Sale',
    titleEn: 'Software Keys & Pro Subscriptions in Kyat',
    titleMm: 'Software Key နှင့် Pro Account များ ကျပ်ငွေဖြင့် ချက်ချင်းဝယ်ယူပါ',
    subtitleEn:
      'Combine multiple items in your cart, pay once with KPay or WavePay, and unlock AES-256 encrypted keys in seconds.',
    subtitleMm:
      'ပစ္စည်းမျိုးစုံကို ခြင်းတောင်းထဲထည့်၍ KPay / WavePay ဖြင့် တစ်ကြိမ်တည်း ငွေရှင်းပြီး စက္ကန့်ပိုင်းအတွင်း Key ထုတ်ယူပါ။',
    ctaLabelEn: 'Browse Flash Deals',
    ctaLabelMm: 'ပစ္စည်းများကြည့်မည်',
    targetCategory: 'ALL',
  },
  {
    id: 'vpn-security',
    imageUrl: '/images/hero-vpn.jpg',
    kickerEn: 'Outline · V2Ray · High-Speed SG/JP Nodes',
    kickerMm: 'Outline · V2Ray · မြန်နှုန်းမြင့် VPN များ',
    titleEn: 'Instant Scannable VPN QR Configs',
    titleMm: 'QR စကန်ဖတ်ရုံဖြင့် အသုံးပြုနိုင်သော VPN Key များ',
    subtitleEn:
      'Auto-delivered with instant scannable QR codes ready for Outline and V2Ray apps across iOS, Android, and Desktop.',
    subtitleMm:
      'ဝယ်ယူပြီးသည်နှင့် Outline / V2Ray App များတွင် ချက်ချင်းစကန်ဖတ် ချိတ်ဆက်နိုင်သော QR Code များ ထုတ်ပေးပါသည်။',
    ctaLabelEn: 'Explore VPN Plans',
    ctaLabelMm: 'VPN များကြည့်မည်',
    targetCategory: 'VPN_CONFIG',
  },
];

function computeRemainingParts(endsAtIso: string): {
  expired: boolean;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const diff = new Date(endsAtIso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) {
    return { expired: true, days: '00', hours: '00', minutes: '00', seconds: '00' };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    expired: false,
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export function HeroBannerSlider({
  slides,
  flashSaleEndsAt,
  flashSaleLabelEn,
  flashSaleLabelMm,
  onSelectCategory,
}: HeroBannerSliderProps) {
  const { locale, t } = useLocale();
  const { hapticSelection } = useTelegram();
  const isMm = locale === 'mm';

  const activeSlides = useMemo(
    () => (slides && slides.length > 0 ? slides : FALLBACK_SLIDES),
    [slides]
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<ReturnType<typeof computeRemainingParts> | null>(null);

  useEffect(() => {
    setCurrentIdx(0);
  }, [activeSlides.length]);

  useEffect(() => {
    if (activeSlides.length <= 1 || paused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % activeSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [activeSlides.length, paused]);

  useEffect(() => {
    if (!flashSaleEndsAt) {
      setCountdown(null);
      return;
    }
    const update = () => setCountdown(computeRemainingParts(flashSaleEndsAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [flashSaleEndsAt]);

  const slide = activeSlides[currentIdx % activeSlides.length] ?? FALLBACK_SLIDES[0];
  const flashTitle = isMm
    ? flashSaleLabelMm || flashSaleLabelEn || 'Flash Sale Campaign'
    : flashSaleLabelEn || 'Flash Sale Campaign';

  const kicker = isMm ? slide.kickerMm || slide.kickerEn : slide.kickerEn;
  const title = isMm ? slide.titleMm || slide.titleEn : slide.titleEn;
  const subtitle = isMm ? slide.subtitleMm || slide.subtitleEn : slide.subtitleEn;
  const ctaLabel = isMm ? slide.ctaLabelMm || slide.ctaLabelEn : slide.ctaLabelEn;

  return (
    <section
      aria-label="Featured Campaigns"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-900 shadow-sm"
    >
      {/* Background artwork + readable gradient scrim */}
      <div className="relative min-h-[250px] sm:min-h-[280px] flex flex-col justify-between p-6 sm:p-8 lg:p-10">
        {slide.imageUrl && !failedImages[slide.id] ? (
          <img
            src={slide.imageUrl}
            alt={title}
            onError={() => setFailedImages((prev) => ({ ...prev, [slide.id]: true }))}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500"
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0E1829] to-emerald-950" />
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#070B12]/95 via-[#09111E]/85 to-[#09111E]/55"
        />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={isMm ? 'font-myanmar-safe' : 'tracking-wide'}>{kicker}</span>
          </div>

          {countdown && !countdown.expired && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-400/35 bg-black/55 px-3 py-1.5 backdrop-blur-md">
              <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-amber-200">{flashTitle}</span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">
                · {t.flashSaleEndsIn}
              </span>
              <div className="font-mono-tabular flex items-center gap-1 text-xs font-bold text-white">
                {countdown.days !== '00' && (
                  <>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                      {countdown.days}d
                    </span>
                    <span className="text-slate-400">:</span>
                  </>
                )}
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  {countdown.hours}
                </span>
                <span className="text-slate-400">:</span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  {countdown.minutes}
                </span>
                <span className="text-slate-400">:</span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  {countdown.seconds}
                </span>
              </div>
            </div>
          )}

          {countdown && countdown.expired && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-3 py-1 text-[11px] text-slate-300 backdrop-blur-md">
              <Timer className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{t.flashSaleExpired}</span>
            </div>
          )}
        </div>

        <div className="relative z-10 mt-5 max-w-2xl">
          <h2
            className={`text-xl font-semibold text-white sm:text-3xl ${
              isMm ? 'font-myanmar-safe' : 'tracking-tight'
            }`}
          >
            {title}
          </h2>
          <p
            className={`mt-2 text-xs text-slate-200 sm:text-sm ${
              isMm ? 'font-myanmar-safe' : 'leading-relaxed'
            }`}
          >
            {subtitle}
          </p>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              hapticSelection();
              if (onSelectCategory) {
                onSelectCategory(slide.targetCategory || 'ALL');
              }
              const targetEl = document.getElementById('catalog');
              targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer sm:text-sm"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {activeSlides.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Campaign slides">
                {activeSlides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Slide ${idx + 1}`}
                    aria-selected={idx === currentIdx}
                    onClick={() => {
                      hapticSelection();
                      setCurrentIdx(idx);
                    }}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === currentIdx ? 'w-6 bg-emerald-400' : 'w-2 bg-white/35 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => {
                    hapticSelection();
                    setCurrentIdx((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/45 text-white hover:bg-black/70 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => {
                    hapticSelection();
                    setCurrentIdx((prev) => (prev + 1) % activeSlides.length);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/45 text-white hover:bg-black/70 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
