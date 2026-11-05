import type { StorefrontLayout } from '@aurevi/shared';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { apiGet } from '@/lib/api';
import './globals.css';

const serif = localFont({
  src: [
    { path: '../fonts/InstrumentSerif-Regular.ttf', style: 'normal', weight: '400' },
    { path: '../fonts/InstrumentSerif-Italic.ttf', style: 'italic', weight: '400' },
  ],
  variable: '--font-instrument-serif',
});
const sans = localFont({
  src: '../fonts/DMSans.ttf',
  weight: '100 1000',
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'),
  title: { default: 'Aurevi', template: '%s | Aurevi' },
  description: 'Moda feminina Aurevi.',
};

export const viewport: Viewport = { themeColor: '#66513d' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The API is not reachable during image builds. Render per request, with the fetch cache behind it.
  await connection();
  const layout = await apiGet<StorefrontLayout>('catalog/layout');
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable}`}>
      <body className="flex min-h-svh flex-col">
        <SiteHeader layout={layout} />
        <main className="flex-1">{children}</main>
        <SiteFooter layout={layout} />
      </body>
    </html>
  );
}
