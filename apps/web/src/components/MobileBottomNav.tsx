'use client';

import { History, LayoutGrid, LifeBuoy, ShoppingCart } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { isAdminPortalPathname } from '@/lib/adminRoute';
import { useCart } from '@/providers/CartProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram } from '@/providers/TelegramProvider';

const BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'MMKeyHubBot').replace(
  /^@/,
  ''
);

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { cartCount, setDrawerOpen } = useCart();
  const { hapticSelection } = useTelegram();

  if (isAdminPortalPathname(pathname)) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md md:hidden"
    >
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          if (pathname !== '/') {
            router.push('/#catalog');
          } else {
            document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
        className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        <span>{t.mobileNavCatalog}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          hapticSelection();
          setDrawerOpen(true);
        }}
        className="relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
      >
        <div className="relative">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {cartCount > 0 && (
            <span className="font-mono-tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-slate-950">
              {cartCount}
            </span>
          )}
        </div>
        <span>{t.mobileNavCart}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          hapticSelection();
          window.dispatchEvent(new Event('mmkeyhub-open-orders-drawer'));
        }}
        className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
      >
        <History className="h-4 w-4" aria-hidden="true" />
        <span>{t.mobileNavOrders}</span>
      </button>

      <a
        href={`https://t.me/${BOT_USERNAME}?start=support`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => hapticSelection()}
        className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        <LifeBuoy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>{t.mobileNavSupport}</span>
      </a>
    </nav>
  );
}
