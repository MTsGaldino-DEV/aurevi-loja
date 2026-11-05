import type { StorefrontLayout } from '@aurevi/shared';
import Image from 'next/image';
import Link from 'next/link';
import { CartButton } from '@/components/cart-drawer';

export function SiteHeader({ layout }: { layout: StorefrontLayout }) {
  return (
    <header className="on-cocoa sticky top-0 z-30 bg-cocoa text-paper">
      {layout.announcementMessages.length > 0 && (
        <ul className="flex snap-x gap-8 overflow-x-auto bg-paper px-gutter py-1.5 text-xs whitespace-nowrap text-cocoa [scrollbar-width:none] md:justify-center">
          {layout.announcementMessages.map((message) => (
            <li key={message} className="snap-start">
              {message}
            </li>
          ))}
        </ul>
      )}
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-gutter">
        <div className="flex items-center gap-8">
          <button
            type="button"
            popoverTarget="site-menu"
            className="-ml-2 p-2 text-sm lg:hidden"
            aria-label="Abrir menu"
          >
            Menu
          </button>
          <nav aria-label="Categorias" className="hidden gap-7 text-sm lg:flex">
            <Link href="/novidades" className="py-2 hover:text-gold">
              Novidades
            </Link>
            {layout.categories.map((category) => (
              <Link
                key={category.slug}
                href={`/categoria/${category.slug}`}
                className="py-2 hover:text-gold"
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/" aria-label="Aurevi, página inicial">
          <Image
            src="/brand/logo-horizontal.svg"
            alt=""
            width={162}
            height={45}
            unoptimized
            priority
          />
        </Link>
        <div className="flex justify-end">
          <CartButton />
        </div>
      </div>

      <div id="site-menu" popover="auto" className="menu-panel bg-paper p-6 text-cocoa">
        <button
          type="button"
          popoverTarget="site-menu"
          popoverTargetAction="hide"
          className="-ml-2 p-2 text-sm"
        >
          Fechar
        </button>
        <nav aria-label="Categorias" className="mt-6 font-serif text-3xl">
          <ul className="space-y-4">
            <li>
              <Link href="/novidades">Novidades</Link>
            </li>
            {layout.categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/categoria/${category.slug}`}>{category.name}</Link>
                {category.children.length > 0 && (
                  <ul className="mt-2 space-y-2 font-sans text-base">
                    {category.children.map((child) => (
                      <li key={child.slug}>
                        <Link href={`/categoria/${child.slug}`}>{child.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
