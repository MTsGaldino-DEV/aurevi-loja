import type { Metadata } from 'next';
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

export const metadata: Metadata = { title: 'Aurevi', description: 'Moda feminina.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
