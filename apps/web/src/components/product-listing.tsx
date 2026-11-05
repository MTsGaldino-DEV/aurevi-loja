import {
  PRODUCT_PAGE_SIZE,
  type ProductList,
  productQuerySchema,
  type StorefrontLayout,
} from '@aurevi/shared';
import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { apiGet } from '@/lib/api';

type RawParams = Record<string, string | string[] | undefined>;

const facetParam: Record<string, string> = { Cor: 'cor', Tamanho: 'tamanho' };

function toSearch(params: RawParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      search.append(key, item);
    }
  }
  return search;
}

// Reais in the form, cents in the API.
function toApiParams(params: RawParams): RawParams {
  const cents = (value: RawParams[string]) => {
    const reais = Number(Array.isArray(value) ? value[0] : value);
    return value && Number.isFinite(reais) && reais >= 0
      ? String(Math.round(reais * 100))
      : undefined;
  };
  return { ...params, min: cents(params['min']), max: cents(params['max']) };
}

export async function ProductListing({
  title,
  category,
  params,
  basePath,
}: {
  title: string;
  category?: string;
  params: RawParams;
  basePath: string;
}) {
  // Invalid values from a hand-edited URL fall back to the defaults, instead of an error page.
  const parsed = productQuerySchema.safeParse(toApiParams(params));
  const query = parsed.success ? parsed.data : productQuerySchema.parse({});
  const apiSearch = toSearch({
    cor: query.cor,
    tamanho: query.tamanho,
    ordem: query.ordem,
    pagina: String(query.pagina),
    categoria: category,
    min: query.min?.toString(),
    max: query.max?.toString(),
  });
  const [list, layout] = await Promise.all([
    apiGet<ProductList>(`catalog/products?${apiSearch}`),
    apiGet<StorefrontLayout>('catalog/layout'),
  ]);
  const selected = (name: string) => query[facetParam[name] as 'cor' | 'tamanho'] ?? [];
  const nextPage = toSearch({ ...params, pagina: String(query.pagina + 1) });

  const filters = (
    <form method="get" className="space-y-6">
      <label className="block text-sm">
        Ordenar por
        <select
          name="ordem"
          defaultValue={query.ordem}
          className="mt-1 block w-full border border-clay bg-paper p-2.5"
        >
          <option value="novidades">Novidades</option>
          <option value="menor-preco">Menor preço</option>
          <option value="maior-preco">Maior preço</option>
        </select>
      </label>
      {list.facets.map((facet) => (
        <fieldset key={facet.name}>
          <legend className="mb-2 text-sm font-medium">{facet.name}</legend>
          <div className="flex flex-wrap gap-2">
            {facet.values.map((value) => (
              <label
                key={value.value}
                className="flex cursor-pointer items-center gap-2 border border-clay px-3 py-2 text-sm has-checked:bg-cocoa has-checked:text-paper"
              >
                <input
                  type="checkbox"
                  name={facetParam[facet.name]}
                  value={value.value}
                  defaultChecked={selected(facet.name).includes(value.value)}
                  className="sr-only"
                />
                {value.hex && (
                  <span
                    aria-hidden
                    className="size-3 rounded-full border border-clay"
                    style={{ background: value.hex }}
                  />
                )}
                {value.value}
                <span className="sr-only">, {value.count} produtos</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Preço em reais</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            De
            <input
              type="number"
              name="min"
              min="0"
              inputMode="numeric"
              defaultValue={query.min === undefined ? undefined : query.min / 100}
              className="mt-1 block w-full border border-clay bg-paper p-2.5"
            />
          </label>
          <label className="text-sm">
            Até
            <input
              type="number"
              name="max"
              min="0"
              inputMode="numeric"
              defaultValue={query.max === undefined ? undefined : query.max / 100}
              className="mt-1 block w-full border border-clay bg-paper p-2.5"
            />
          </label>
        </div>
      </fieldset>
      <div className="flex items-center gap-4">
        <button type="submit" className="bg-cocoa px-5 py-3 text-sm text-paper">
          Aplicar filtros
        </button>
        <Link href={basePath} className="text-sm underline underline-offset-4">
          Limpar
        </Link>
      </div>
    </form>
  );

  return (
    <div className="px-gutter pt-8">
      <h1 className="font-serif text-5xl">{title}</h1>
      <div className="mt-6 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <details className="mb-6 lg:hidden">
          <summary className="cursor-pointer border border-clay px-4 py-3 text-sm">
            Filtrar e ordenar
          </summary>
          <div className="mt-4">{filters}</div>
        </details>
        <aside className="hidden lg:block">{filters}</aside>
        <div>
          <p className="mb-4 text-sm" role="status">
            {list.total === 1 ? '1 produto' : `${list.total} produtos`}
          </p>
          {list.items.length === 0 ? (
            <p>
              Nenhum produto com esses filtros.{' '}
              <Link href={basePath} className="underline underline-offset-4">
                Limpar filtros
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {list.items.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    pixDiscountPercent={layout.payment.pixDiscountPercent}
                  />
                </li>
              ))}
            </ul>
          )}
          {list.total > query.pagina * PRODUCT_PAGE_SIZE && (
            <Link
              href={`${basePath}?${nextPage}`}
              scroll={false}
              className="mx-auto mt-10 block w-fit border border-cocoa px-6 py-3 text-sm"
            >
              Mostrar mais produtos
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
