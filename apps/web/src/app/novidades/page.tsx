import type { Metadata } from 'next';
import { ProductListing } from '@/components/product-listing';

export const metadata: Metadata = { title: 'Novidades' };

export default async function NewestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductListing title="Novidades" params={await searchParams} basePath="/novidades" />;
}
