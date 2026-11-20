'use client';

import {
  ArrowRight,
  History,
  Languages,
  Moon,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAdminPortalPathname } from '@/lib/adminRoute';
import {
  clearLocalOrders,
  fetchShopStatus,
  formatMmk,
  getLocalOrders,
  removeLocalOrder,
} from '@/lib/api';
import type { SavedLocalOrder } from '@/lib/types';
import { useCart } from '@/providers/CartProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { useTheme } from '@/providers/ThemeProvider';

export function Navbar() {
  const pathname = usePathname();
  const isAdminRoute = isAdminPortalPathname(pathname);
  const { locale, toggleLocale, t } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const { cartCount, setDrawerOpen: setCartDrawerOpen } = useCart();
  const isMm = locale === 'mm';

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedOrders, setSavedOrders] = useState<SavedLocalOrder[]>([]);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const syncOrders = () => {
      setSavedOrders(getLocalOrders());
    };
    const openOrdersDrawer = () => setDrawerOpen(true);

    syncOrders();
    window.addEventListener('mmkeyhub-orders-updated', syncOrders);
    window.addEventListener('storage', syncOrders);
    window.addEventListener('mmkeyhub-open-orders-drawer', openOrdersDrawer);
    return () => {
      window.removeEventListener('mmkeyhub-orders-updated', syncOrders);
      window.removeEventListener('storage', syncOrders);
      window.removeEventListener('mmkeyhub-open-orders-drawer', openOrdersDrawer);
    };
  }, []);

  useEffect(() => {
    if (isAdminRoute) return;
    const controller = new AbortController();
    const loadBrand = () => {
      fetchShopStatus(controller.signal)
        .then((status) => {
          setBrandLogoUrl(status.brandLogoUrl ?? null);
          setLogoFailed(false);
        })
        .catch(() => {
          // ignore offline status lookup
        });
    };
    loadBrand();
    window.addEventListener('mmkeyhub-shop-status-updated', loadBrand);
    return () => {
      controller.abort();
      window.removeEventListener('mmkeyhub-shop-status-updated', loadBrand);
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  if (isAdminRoute) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:gap-8 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            {brandLogoUrl && !logoFailed ? (
              <img
                src={brandLogoUrl}
                alt={t.brand}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-7 sm:h-8 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <>
                <img
                  src="/images/mmkeyhub-icon.png"
                  alt={t.brand}
                  className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/15"
                />
                <span>{t.brand}</span>
              </>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <Link
              href="/#catalog"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navCatalog}
            </Link>
            <Link
              href="/#how-it-works"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navHowItWorks}
            </Link>
            <Link
              href="/#track-order"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navTrackOrder}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label={t.cartTitle}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingCart className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{t.mobileNavCart}</span>
              {cartCount > 0 && (
                <span className="font-mono-tabular rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-[#121826] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{t.myOrders}</span>
              {savedOrders.length > 0 && (
                <span className="font-mono-tabular rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {savedOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
              title={theme === 'dark' ? t.themeToLight : t.themeToDark}
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-[#121826] text-slate-700 dark:text-slate-200 hover:border-emerald-500/40 transition-colors shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleLocale}
              aria-label="Toggle language between English and Burmese"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-[#121826] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Languages className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{locale === 'en' ? 'EN / မြန်မာ' : 'မြန်မာ / EN'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Guest My Orders Slide-Over Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-orders-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <h2
                  id="my-orders-drawer-title"
                  className={`text-base font-semibold text-slate-900 dark:text-slate-50 ${
                    isMm ? 'font-myanmar-safe' : ''
                  }`}
                >
                  {t.myOrdersTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t.close}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-[#182133] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {savedOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17] p-6 text-center">
                  <ShoppingBag className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
                  <p
                    className={`mt-2.5 text-sm text-slate-500 dark:text-slate-400 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {t.myOrdersEmpty}
                  </p>
                </div>
              ) : (
                savedOrders.map((order) => (
                  <div
                    key={order.orderNumber}
                    className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono-tabular text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {order.orderNumber}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100 ${
                            isMm ? 'font-myanmar-safe' : ''
                          }`}
                        >
                          {order.productTitle}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLocalOrder(order.orderNumber)}
                        aria-label={`${t.removeOrder} ${order.orderNumber}`}
                        className="rounded-md p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] pt-2.5">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                          {formatMmk(order.totalMmk)}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span className="font-mono-tabular">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <Link
                        href={`/orders/${encodeURIComponent(order.orderNumber)}?token=${encodeURIComponent(order.accessToken)}`}
                        onClick={() => setDrawerOpen(false)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                      >
                        <span>{t.openTracker}</span>
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>

            {savedOrders.length > 0 && (
              <div className="border-t border-slate-200 dark:border-white/[0.08] px-5 py-3.5 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {savedOrders.length} {isMm ? 'ခု သိမ်းထားသည်' : 'saved'}
                </span>
                <button
                  type="button"
                  onClick={() => clearLocalOrders()}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-500 cursor-pointer"
                >
                  {t.clearHistory}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
