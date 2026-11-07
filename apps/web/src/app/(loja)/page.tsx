import type { StorefrontHome, StorefrontLayout } from '@aurevi/shared';
import Image from 'next/image';
import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { apiGet } from '@/lib/api';
import { imageUrl, isVector } from '@/lib/images';

export default async function HomePage() {
  const [home, layout] = await Promise.all([
    apiGet<StorefrontHome>('catalog/home'),
    apiGet<StorefrontLayout>('catalog/layout'),
  ]);
  const { hero, collections, newest } = home;
  return (
    <>
      <Link href={hero.href} className="on-cocoa group relative block bg-cocoa text-paper lg:flex">
        <div className="relative aspect-[4/5] lg:order-2 lg:aspect-auto lg:h-[calc(100svh-6rem)] lg:w-1/2">
          <Image
            src={imageUrl(hero.imageKey)}
            alt={hero.alt}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            unoptimized={isVector(hero.imageKey)}
            className="object-cover object-[50%_20%]"
          />
        </div>
        <div className="relative overflow-hidden px-gutter py-8 lg:flex lg:w-1/2 lg:flex-col lg:justify-end lg:py-12">
          <Image
            src="/brand/av.svg"
            alt=""
            width={760}
            height={578}
            unoptimized
            className="absolute -top-10 -left-16 hidden opacity-10 lg:block"
          />
          <h1 className="relative font-serif text-5xl leading-none text-balance text-gold lg:text-8xl">
            {hero.title}
          </h1>
          <span className="relative mt-5 inline-block underline underline-offset-4 group-hover:text-gold">
            Ver novidades
          </span>
        </div>
      </Link>

      <section aria-labelledby="newest" className="mt-14">
        <div className="flex items-baseline justify-between px-gutter">
          <h2 id="newest" className="font-serif text-4xl">
            Novidades
          </h2>
          <Link href="/novidades" className="text-sm underline underline-offset-4">
            Ver todas
          </Link>
        </div>
        <ul className="mt-5 relative flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-gutter pb-2 [scrollbar-width:thin]">
          {newest.map((product) => (
            <li key={product.id} className="w-[62vw] shrink-0 snap-start md:w-[30vw] lg:w-[22vw]">
              <ProductCard
                product={product}
                pixDiscountPercent={layout.payment.pixDiscountPercent}
                sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 62vw"
              />
            </li>
          ))}
        </ul>
      </section>

      {collections.length > 0 && (
        <section aria-label="Coleções" className="mt-14 grid gap-3 px-gutter md:grid-cols-2">
          {collections.map((collection) => (
            <Link key={collection.href} href={collection.href} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden bg-sand">
                <Image
                  src={imageUrl(collection.imageKey)}
                  alt={collection.alt}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  unoptimized={isVector(collection.imageKey)}
                  className="object-cover"
                />
              </div>
              <h2 className="mt-2 font-serif text-3xl group-hover:underline">{collection.title}</h2>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
