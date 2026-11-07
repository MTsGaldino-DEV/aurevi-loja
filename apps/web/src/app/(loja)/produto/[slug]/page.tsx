import type { ProductDetail, StorefrontLayout } from '@aurevi/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/product-card';
import { ProductView } from '@/components/product-view';
import { apiGet, NotFoundError } from '@/lib/api';
import { imageUrl } from '@/lib/images';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await apiGet<ProductDetail>(`catalog/products/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  const image = product.images[0];
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description.slice(0, 160),
    alternates: { canonical: `/produto/${slug}` },
    openGraph: image ? { images: [imageUrl(image.key)] } : null,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, layout] = await Promise.all([
    load(slug),
    apiGet<StorefrontLayout>('catalog/layout'),
  ]);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images.map((image) => imageUrl(image.key)),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: (product.priceCents / 100).toFixed(2),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        // Escaped so a product text cannot close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <nav aria-label="Caminho" className="px-gutter py-3 text-sm">
        <Link href={`/categoria/${product.category.slug}`} className="underline underline-offset-4">
          {product.category.name}
        </Link>
      </nav>
      <ProductView product={product} payment={layout.payment} />
      {product.related.length > 0 && (
        <section aria-labelledby="related" className="mt-16 px-gutter">
          <h2 id="related" className="font-serif text-4xl">
            Você também pode gostar
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4">
            {product.related.map((item) => (
              <li key={item.id}>
                <ProductCard
                  product={item}
                  pixDiscountPercent={layout.payment.pixDiscountPercent}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
