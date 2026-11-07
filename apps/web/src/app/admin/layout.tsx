import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s | Painel Aurevi' },
  robots: { index: false, follow: false },
};

// No storefront header or footer: the panel brings its own navigation.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
