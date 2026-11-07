import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable}`}>
      <body className="flex min-h-svh flex-col">{children}</body>
    </html>
  );
}
