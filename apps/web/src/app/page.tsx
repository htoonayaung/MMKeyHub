'use client';

import { ArrowRight, BookOpen, Check, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckoutModal } from '@/components/CheckoutModal';
import { HeroBannerSlider } from '@/components/HeroBannerSlider';
import { ProductDetailsModal } from '@/components/ProductDetailsModal';
import { ProductVisual } from '@/components/ProductVisual';
import { RecentPurchasesTicker } from '@/components/RecentPurchasesTicker';
import {
  computeFlashSalePercent,
  fetchProducts,
  fetchRecentPurchases,
  fetchShopStatus,
  formatMmk,
  getLocalOrders,
} from '@/lib/api';
import type {
  DeliveryFormat,
  ProductItem,
  RecentPurchaseActivity,
  SavedLocalOrder,
  ShopStatusInfo,
} from '@/lib/types';
import { detectProductVendor } from '@/lib/vendorUtils';
import { useCart } from '@/providers/CartProvider';
import { useLocale } from '@/providers/LocaleProvider';
import { useTelegram } from '@/providers/TelegramProvider';

type CategoryFilter = 'ALL' | DeliveryFormat;

export default function StorefrontPage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { addToCart } = useCart();
  const { hapticImpact, hapticNotification, hapticSelection } = useTelegram();
  const isMm = locale === 'mm';

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentPurchaseActivity[]>([]);
  const [shopStatus, setShopStatus] = useState<ShopStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsProduct, setDetailsProduct] = useState<ProductItem | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [orderLookupInput, setOrderLookupInput] = useState('');
  const [recentOrders, setRecentOrders] = useState<SavedLocalOrder[]>([]);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, activities, status] = await Promise.all([
        fetchProducts(),
        fetchRecentPurchases().catch(() => []),
        fetchShopStatus().catch(() => null),
      ]);
      setProducts(list);
      setRecentActivities(activities);
      if (status) setShopStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorCatalog);
    } finally {
      setLoading(false);
    }
  }, [t.errorCatalog]);

  useEffect(() => {
    void loadCatalog();
    setRecentOrders(getLocalOrders());
  }, [loadCatalog]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((item) => {
      if (activeFilter !== 'ALL' && item.deliveryFormat !== activeFilter) {
        return false;
      }
      if (!query) return true;
      return (
        item.titleEn.toLowerCase().includes(query) ||
        item.titleMm.toLowerCase().includes(query) ||
        item.descriptionEn.toLowerCase().includes(query) ||
        item.descriptionMm.toLowerCase().includes(query)
      );
    });
  }, [products, activeFilter, searchQuery]);

  function handleTrackSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = orderLookupInput.trim().toUpperCase();
    if (!cleaned) return;
    router.push(`/orders/${encodeURIComponent(cleaned)}`);
  }

  function handleAddToCart(product: ProductItem) {
    addToCart(product, 1);
    hapticNotification('success');
    setRecentlyAddedId(product.id);
    window.setTimeout(() => {
      setRecentlyAddedId((prev) => (prev === product.id ? null : prev));
    }, 1500);
  }

  const filterTabs: Array<{ key: CategoryFilter; label: string }> = [
    { key: 'ALL', label: t.filterAll },
    { key: 'LICENSE_KEY', label: t.filterKeys },
    { key: 'ACCOUNT_LOGIN', label: t.filterAccounts },
    { key: 'VPN_CONFIG', label: t.filterVpn },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 sm:pt-10 md:pb-12">
      {/* Live Recent Purchases Social-Proof Ticker */}
      <RecentPurchasesTicker activities={recentActivities} />

      {/* Hero Banner Slider & Flash Sale Countdown Timer */}
      <HeroBannerSlider
        slides={shopStatus?.heroSlides}
        flashSaleEndsAt={shopStatus?.flashSaleEndsAt}
        flashSaleLabelEn={shopStatus?.flashSaleLabelEn}
        flashSaleLabelMm={shopStatus?.flashSaleLabelMm}
        onSelectCategory={(cat) => setActiveFilter(cat)}
      />

      {/* Storefront Intro + Order Quick Tracker */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] p-6 sm:p-8 shadow-xs">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p
              className={`text-xs font-medium text-emerald-600 dark:text-emerald-400 ${
                isMm ? 'font-myanmar-safe' : 'tracking-wide'
              }`}
            >
              {t.heroKicker}
            </p>
            <h1
              className={`mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50 sm:text-3xl ${
                isMm ? 'font-myanmar-safe' : 'tracking-tight'
              }`}
            >
              {t.heroTitle}
            </h1>
            <p
              className={`mt-2.5 max-w-2xl text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {t.heroSubtitle}
            </p>
          </div>

          <div
            id="track-order"
            className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0B0F17] p-4 sm:p-5 lg:col-span-5"
          >
            <label
              htmlFor="order-lookup-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.navTrackOrder}
            </label>
            <form onSubmit={handleTrackSubmit} className="mt-2 flex gap-2">
              <input
                id="order-lookup-input"
                type="text"
                value={orderLookupInput}
                onChange={(e) => setOrderLookupInput(e.target.value)}
                placeholder={t.trackPlaceholder}
                className="font-mono-tabular min-h-[44px] flex-1 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#121826] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none sm:text-sm"
              />
              <button
                type="submit"
                className="min-h-[44px] shrink-0 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer sm:text-sm"
              >
                {t.trackButton}
              </button>
            </form>

            {recentOrders.length > 0 && (
              <div className="mt-3 border-t border-slate-200 dark:border-white/[0.06] pt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.recentOrdersLabel}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {recentOrders.slice(0, 3).map((ord) => (
                    <Link
                      key={ord.orderNumber}
                      href={`/orders/${encodeURIComponent(ord.orderNumber)}?token=${encodeURIComponent(ord.accessToken)}`}
                      className="font-mono-tabular inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/50 transition-colors"
                    >
                      <span>{ord.orderNumber}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Catalog Controls: Category Filter Tabs + Search */}
      <section id="catalog" className="mt-8 sm:mt-10 scroll-mt-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Product category filters"
            className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] p-1"
          >
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    hapticSelection();
                    setActiveFilter(tab.key);
                  }}
                  className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:text-sm ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#182133] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121826] pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Catalog Grid States */}
        {loading ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((skeleton) => (
              <div
                key={skeleton}
                className="h-96 animate-pulse rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#121826]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-xl border border-rose-500/30 bg-white dark:bg-[#121826] p-8 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-100 dark:bg-[#182133] px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>{t.retry}</span>
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t.emptyCatalog}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => {
              const title = isMm ? product.titleMm : product.titleEn;
              const description = isMm ? product.descriptionMm : product.descriptionEn;
              const duration = isMm ? product.durationLabelMm : product.durationLabelEn;
              const vendor = detectProductVendor(
                `${product.slug} ${product.titleEn}`,
                product.deliveryFormat
              );
              const inStock = product.availableStockCount > 0;
              const discountPct = computeFlashSalePercent(
                product.priceMmk,
                product.originalPriceMmk
              );
              const justAdded = recentlyAddedId === product.id;

              return (
                <article
                  key={product.id}
                  className="kv-glass-card group flex flex-col rounded-xl border border-slate-200 dark:border-white/[0.08]"
                >
                  <ProductVisual
                    imageUrl={product.imageUrl}
                    title={title}
                    slug={product.slug}
                    deliveryFormat={product.deliveryFormat}
                  />

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`font-medium ${vendor.accentTextClass}`}>{vendor.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t.formatLabels[product.deliveryFormat]}</span>
                      {duration && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-700 dark:text-slate-300">{duration}</span>
                        </>
                      )}
                    </div>

                    <h2
                      className={`mt-2 text-base font-semibold text-slate-900 dark:text-slate-50 ${
                        isMm ? 'font-myanmar-safe' : ''
                      }`}
                    >
                      {title}
                    </h2>
                    <p
                      className={`mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400 ${
                        isMm ? 'font-myanmar-safe' : 'leading-relaxed'
                      }`}
                    >
                      {description}
                    </p>

                    <div className="mt-auto pt-5">
                      <div className="flex items-end justify-between gap-2 border-t border-slate-200 dark:border-white/[0.06] pt-4">
                        <div>
                          {discountPct !== null && product.originalPriceMmk && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono-tabular text-slate-400 line-through">
                                {formatMmk(product.originalPriceMmk)}
                              </span>
                              <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                                {discountPct}% {t.flashSaleOff}
                              </span>
                            </div>
                          )}
                          <span className="font-mono-tabular text-lg font-semibold text-slate-900 dark:text-slate-50">
                            {formatMmk(product.priceMmk)}
                          </span>
                        </div>
                        <span
                          className={`font-mono-tabular text-xs font-medium ${
                            inStock
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {inStock
                            ? `${t.inStock}: ${product.availableStockCount}`
                            : t.outOfStock}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              hapticImpact('light');
                              setDetailsProduct(product);
                            }}
                            className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17]/80 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500/40 transition-colors cursor-pointer"
                          >
                            <BookOpen
                              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{t.detailsButton}</span>
                          </button>

                          <button
                            type="button"
                            disabled={!inStock}
                            onClick={() => handleAddToCart(product)}
                            className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                              justAdded
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0B0F17]/80 text-slate-700 dark:text-slate-200 hover:border-emerald-500/40'
                            }`}
                          >
                            {justAdded ? (
                              <>
                                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.addedToCart}</span>
                              </>
                            ) : (
                              <>
                                <ShoppingCart
                                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{t.addToCart}</span>
                              </>
                            )}
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={!inStock}
                          onClick={() => {
                            hapticImpact('light');
                            setSelectedProduct(product);
                          }}
                          className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 transition-colors cursor-pointer"
                        >
                          {inStock ? t.buyNow : t.outOfStock}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* How Semi-Auto Delivery Works */}
      <section
        id="how-it-works"
        className="mt-14 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121826] p-6 sm:p-8 shadow-xs"
      >
        <h2
          className={`text-lg font-semibold text-slate-900 dark:text-slate-50 sm:text-xl ${
            isMm ? 'font-myanmar-safe' : ''
          }`}
        >
          {t.howItWorksTitle}
        </h2>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <div>
            <h3
              className={`text-sm font-semibold text-emerald-600 dark:text-emerald-400 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {t.step1Title}
            </h3>
            <p
              className={`mt-1.5 text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {t.step1Desc}
            </p>
          </div>
          <div>
            <h3
              className={`text-sm font-semibold text-emerald-600 dark:text-emerald-400 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {t.step2Title}
            </h3>
            <p
              className={`mt-1.5 text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {t.step2Desc}
            </p>
          </div>
          <div>
            <h3
              className={`text-sm font-semibold text-emerald-600 dark:text-emerald-400 ${
                isMm ? 'font-myanmar-safe' : ''
              }`}
            >
              {t.step3Title}
            </h3>
            <p
              className={`mt-1.5 text-sm text-slate-600 dark:text-slate-300 ${
                isMm ? 'font-myanmar-safe' : 'leading-relaxed'
              }`}
            >
              {t.step3Desc}
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-slate-200 dark:border-white/[0.06] pt-6 text-center text-xs text-slate-500">
        {t.footerNote}
      </footer>

      <ProductDetailsModal
        product={detailsProduct}
        onClose={() => setDetailsProduct(null)}
        onProceedToBuy={(prod) => setSelectedProduct(prod)}
      />

      <CheckoutModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
