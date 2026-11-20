'use client';

import { ArrowRight, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { CheckoutModal } from '@/components/CheckoutModal';
import { isAdminPortalPathname } from '@/lib/adminRoute';
import { formatMmk } from '@/lib/api';
import { useCart } from '@/providers/CartProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram, useTelegramBackButton } from '@/providers/TelegramProvider';

export function CartDrawer() {
  const pathname = usePathname();
  const isAdminRoute = isAdminPortalPathname(pathname);
  const { locale, t } = useLocale();
  const {
    items,
    cartCount,
    cartSubtotalMmk,
    drawerOpen,
    cartCheckoutOpen,
    setDrawerOpen,
    setCartCheckoutOpen,
    updateQty,
    removeFromCart,
    clearCart,
  } = useCart();
  const { hapticImpact, hapticSelection } = useTelegram();
  const isMm = locale === 'mm';

  useTelegramBackButton(drawerOpen && !cartCheckoutOpen, () => setDrawerOpen(false));

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  if (isAdminRoute) {
    return null;
  }

  return (
    <>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cart-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <h2
                  id="cart-drawer-title"
                  className={`text-base font-semibold text-slate-900 dark:text-slate-50 ${
                    isMm ? 'font-myanmar-safe' : ''
                  }`}
                >
                  {t.cartTitle}
                </h2>
                {cartCount > 0 && (
                  <span className="font-mono-tabular rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {cartCount}
                  </span>
                )}
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
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17] p-6 text-center">
                  <ShoppingCart className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
                  <p
                    className={`mt-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {t.cartEmptyTitle}
                  </p>
                  <p
                    className={`mt-1 text-xs text-slate-500 dark:text-slate-400 ${
                      isMm ? 'font-myanmar-safe' : ''
                    }`}
                  >
                    {t.cartEmptyDesc}
                  </p>
                </div>
              ) : (
                items.map(({ product, quantity }) => {
                  const title = isMm ? product.titleMm : product.titleEn;
                  const maxQty = Math.max(1, Math.min(10, product.availableStockCount));
                  return (
                    <div
                      key={product.id}
                      className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-3.5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold text-slate-900 dark:text-slate-100 ${
                              isMm ? 'font-myanmar-safe' : ''
                            }`}
                          >
                            {title}
                          </p>
                          <p className="font-mono-tabular mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {formatMmk(product.priceMmk)} × {quantity} ={' '}
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatMmk(product.priceMmk * quantity)}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            hapticSelection();
                            removeFromCart(product.id);
                          }}
                          aria-label={`Remove ${title}`}
                          className="rounded-md p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] pt-2.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t.formatLabels[product.deliveryFormat]}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              hapticSelection();
                              updateQty(product.id, quantity - 1);
                            }}
                            aria-label="Decrease cart quantity"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="font-mono-tabular w-5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            disabled={quantity >= maxQty || cartCount >= 20}
                            onClick={() => {
                              hapticSelection();
                              updateQty(product.id, quantity + 1);
                            }}
                            aria-label="Increase cart quantity"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17]/60 px-5 py-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">
                    {t.promoSubtotal} ({cartCount} {t.cartItemsLabel})
                  </span>
                  <span className="font-mono-tabular text-base font-semibold text-slate-900 dark:text-slate-50">
                    {formatMmk(cartSubtotalMmk)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      clearCart();
                    }}
                    className="min-h-[44px] rounded-xl border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#182133] px-3.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-500 cursor-pointer"
                  >
                    {t.clearCart}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setDrawerOpen(false);
                      setCartCheckoutOpen(true);
                    }}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
                  >
                    <span>{t.proceedToCartCheckout}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CheckoutModal
        cartItems={cartCheckoutOpen ? items : null}
        onClose={() => setCartCheckoutOpen(false)}
        onCartSuccess={() => {
          clearCart();
          setCartCheckoutOpen(false);
        }}
      />
    </>
  );
}
