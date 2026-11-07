import { notFound } from 'next/navigation';

// Without this, unknown /admin URLs would fall into the storefront catch-all.
export default function UnmatchedAdminPage() {
  notFound();
}
