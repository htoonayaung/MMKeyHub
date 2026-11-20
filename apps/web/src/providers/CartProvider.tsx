'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, ProductItem } from '@/lib/types';

interface CartContextValue {
  items: CartItem[];
  cartCount: number;
  cartSubtotalMmk: number;
  drawerOpen: boolean;
  cartCheckoutOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setCartCheckoutOpen: (open: boolean) => void;
  addToCart: (product: ProductItem, qty?: number) => void;
  updateQty: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}

const CART_STORAGE_KEY = 'mmkeyhub_cart_v1';

const CartContext = createContext<CartContextValue>({
  items: [],
  cartCount: 0,
  cartSubtotalMmk: 0,
  drawerOpen: false,
  cartCheckoutOpen: false,
  setDrawerOpen: () => undefined,
  setCartCheckoutOpen: () => undefined,
  addToCart: () => undefined,
  updateQty: () => undefined,
  removeFromCart: () => undefined,
  clearCart: () => undefined,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cartCheckoutOpen, setCartCheckoutOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) {
          setItems(
            parsed.filter(
              (entry) =>
                entry &&
                entry.product &&
                typeof entry.product.id === 'string' &&
                typeof entry.quantity === 'number' &&
                entry.quantity > 0
            )
          );
        }
      }
    } catch {
      // ignore corrupted cart cache
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items, hydrated]);

  const addToCart = useCallback((product: ProductItem, qty = 1) => {
    if (product.availableStockCount <= 0) return;
    setItems((prev) => {
      const totalCurrentUnits = prev.reduce((sum, i) => sum + i.quantity, 0);
      const existing = prev.find((i) => i.product.id === product.id);
      const maxPerSku = Math.max(1, Math.min(10, product.availableStockCount));
      const roomTotal = Math.max(0, 20 - (totalCurrentUnits - (existing?.quantity ?? 0)));
      const allowedCap = Math.min(maxPerSku, roomTotal);
      if (allowedCap <= 0) return prev;

      if (existing) {
        const nextQty = Math.min(allowedCap, existing.quantity + qty);
        return prev.map((i) =>
          i.product.id === product.id ? { product, quantity: nextQty } : i
        );
      }
      return [...prev, { product, quantity: Math.min(allowedCap, Math.max(1, qty)) }];
    });
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((i) => i.product.id !== productId);
      }
      const target = prev.find((i) => i.product.id === productId);
      if (!target) return prev;
      const otherUnits = prev
        .filter((i) => i.product.id !== productId)
        .reduce((sum, i) => sum + i.quantity, 0);
      const maxPerSku = Math.max(1, Math.min(10, target.product.availableStockCount));
      const allowedCap = Math.min(maxPerSku, Math.max(1, 20 - otherUnits));
      const clamped = Math.max(1, Math.min(allowedCap, qty));
      return prev.map((i) => (i.product.id === productId ? { ...i, quantity: clamped } : i));
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const cartCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const cartSubtotalMmk = useMemo(
    () => items.reduce((sum, i) => sum + i.product.priceMmk * i.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        cartCount,
        cartSubtotalMmk,
        drawerOpen,
        cartCheckoutOpen,
        setDrawerOpen,
        setCartCheckoutOpen,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
