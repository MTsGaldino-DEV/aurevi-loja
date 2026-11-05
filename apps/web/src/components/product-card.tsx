import { formatBRL, pixPriceCents, type ProductCard as Card } from '@aurevi/shared';
import Image from 'next/image';
import Link from 'next/link';
import { imageUrl, isVector } from '@/lib/images';

export function ProductCard({
  product,
  pixDiscountPercent,
  sizes = '(min-width: 1024px) 25vw, 50vw',
}: {
  product: Card;
  pixDiscountPercent: number;
  sizes?: string;
}) {
  const onSale =
    product.compareAtPriceCents !== null && product.compareAtPriceCents > product.priceCents;
  return (
    <Link href={`/produto/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {product.image && (
          <Image
            src={imageUrl(product.image.key)}
            alt={product.image.alt}
            fill
            sizes={sizes}
            unoptimized={isVector(product.image.key)}
            className="object-cover"
          />
        )}
        {!product.inStock && (
          <span className="absolute bottom-2 left-2 bg-paper px-2 py-0.5 text-xs">Esgotado</span>
        )}
      </div>
      <h3 className="mt-2 font-serif text-xl leading-tight group-hover:underline">
        {product.name}
      </h3>
      <p className="mt-1 text-sm">
        {onSale && (
          <>
            <span className="sr-only">De </span>
            <s className="mr-1.5">{formatBRL(product.compareAtPriceCents!)}</s>
            <span className="sr-only">por </span>
          </>
        )}
        {formatBRL(product.priceCents)}
      </p>
      {pixDiscountPercent > 0 && (
        <p className="text-sm font-medium">
          {formatBRL(pixPriceCents(product.priceCents, pixDiscountPercent))} no Pix
        </p>
      )}
    </Link>
  );
}
