import type { StorefrontLayout } from '@aurevi/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductListing } from '@/components/product-listing';
import { apiGet, NotFoundError } from '@/lib/api';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function categoryName(slug: string) {
  const { categories } = await apiGet<StorefrontLayout>('catalog/layout');
  const all = categories.flatMap((category) => [category, ...category.children]);
  return all.find((category) => category.slug === slug)?.name;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = await categoryName((await params).slug);
  return name
    ? { title: name, alternates: { canonical: `/categoria/${(await params).slug}` } }
    : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const name = await categoryName(slug);
  if (!name) notFound();
  try {
    return await ProductListing({
      title: name,
      category: slug,
      params: await searchParams,
      basePath: `/categoria/${slug}`,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
