import type { StorefrontLayout } from '@aurevi/shared';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { CartProvider } from '@/components/cart-context';
import { CartDrawer } from '@/components/cart-drawer';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { apiGet } from '@/lib/api';

export default async function LojaLayout({ children }: { children: ReactNode }) {
  // The API is not reachable during image builds. Render per request, with the fetch cache behind it.
  await connection();
  const layout = await apiGet<StorefrontLayout>('catalog/layout');
  return (
    <CartProvider>
      <SiteHeader layout={layout} />
      <main className="flex-1">{children}</main>
      <SiteFooter layout={layout} />
      <CartDrawer />
    </CartProvider>
  );
}
