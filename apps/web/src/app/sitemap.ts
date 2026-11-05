import type { MetadataRoute } from 'next';
import { apiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

const site = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

type Entry = { slug: string; updatedAt: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { categories, products } = await apiGet<{ categories: Entry[]; products: Entry[] }>(
    'catalog/sitemap',
  );
  return [
    { url: site },
    { url: `${site}/novidades` },
    ...categories.map((c) => ({ url: `${site}/categoria/${c.slug}`, lastModified: c.updatedAt })),
    ...products.map((p) => ({ url: `${site}/produto/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
