import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { adminGet } from '@/lib/admin-api';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { admin } = await adminGet<{ admin: { email: string } }>('auth/me');
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
