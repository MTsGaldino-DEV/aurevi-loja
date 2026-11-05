import type { StorefrontLayout } from '@aurevi/shared';
import Link from 'next/link';

export function SiteFooter({ layout }: { layout: StorefrontLayout }) {
  const { legalName, cnpj, address, email, whatsapp, instagram } = layout.storeInfo;
  return (
    <footer className="on-cocoa mt-20 bg-cocoa px-gutter py-12 text-paper">
      <div className="grid gap-10 md:grid-cols-3">
        <p className="font-serif text-3xl text-gold">Seu estilo. Sua presença.</p>
        <nav aria-label="Categorias">
          <h2 className="mb-3 text-sm font-medium">Comprar</h2>
          <ul className="space-y-2 text-sm">
            {layout.categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/categoria/${category.slug}`} className="hover:text-gold">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-sm font-medium">Atendimento</h2>
          <ul className="space-y-2 text-sm">
            {whatsapp && (
              <li>
                <a href={`https://wa.me/${whatsapp}`} className="hover:text-gold">
                  WhatsApp
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className="hover:text-gold">
                  {email}
                </a>
              </li>
            )}
            {instagram && (
              <li>
                <a href={`https://instagram.com/${instagram}`} className="hover:text-gold">
                  Instagram
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      {(legalName || cnpj || address) && (
        <p className="mt-10 text-xs">
          {[legalName, cnpj && `CNPJ ${cnpj}`, address].filter(Boolean).join(', ')}
        </p>
      )}
    </footer>
  );
}
