'use client';

import type { CartView } from '@aurevi/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type CartContextValue = {
  cart: CartView | null;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
  addItem: (variantId: string) => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart needs CartProvider');
  return value;
};

// Throws the API's message, which is written for the customer.
async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(`/api/cart${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    (CartView & { message?: string }) | null;
  if (!response.ok || !data) {
    throw new Error(data?.message ?? 'Não foi possível atualizar a sacola. Tente de novo.');
  }
  return data;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(async () => {
    setCart(await request('', 'GET'));
  }, []);

  useEffect(() => {
    let active = true;
    request('', 'GET')
      .then((data) => {
        if (active) setCart(data);
      })
      .catch(() => {
        // The bag stays empty until the next action, which reports its own error.
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      refresh,
      addItem: async (variantId) => {
        setCart(await request('/items', 'POST', { variantId, quantity: 1 }));
        setIsOpen(true);
      },
      setQuantity: async (itemId, quantity) => {
        setCart(await request(`/items/${itemId}`, 'PATCH', { quantity }));
      },
      removeItem: async (itemId) => {
        setCart(await request(`/items/${itemId}`, 'DELETE'));
      },
      applyCoupon: async (code) => {
        setCart(await request('/coupon', 'POST', { code }));
      },
      removeCoupon: async () => {
        setCart(await request('/coupon', 'DELETE'));
      },
    }),
    [cart, isOpen, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
