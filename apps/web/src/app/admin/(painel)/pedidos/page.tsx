import { type AdminOrderList, formatBRL, orderStatuses } from '@aurevi/shared';
import Link from 'next/link';
import { OrderFilters } from '@/components/admin/order-filters';
import { adminGet } from '@/lib/admin-api';
import { formatDateTime, statusLabel } from '@/lib/admin-orders';

export const metadata = { title: 'Pedidos' };

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

// Keeps only values the API would accept, so a hand-edited URL shows a list instead of an error.
function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) ? value : '';
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const status = [...orderStatuses, 'to_ship'].includes(first(raw['status'])) ? first(raw['status']) : '';
  const from = validDay(first(raw['from']));
  const to = validDay(first(raw['to']));
  const q = first(raw['q']).trim().slice(0, 80);
  const page = Math.min(100000, Math.max(1, Math.floor(Number(first(raw['page']))) || 1)); // API caps page at 100000

  const filters = { status, from, to, q };
  const hasFilters = Object.values(filters).some(Boolean);
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    if (target > 1) query.set('page', String(target));
    const text = query.toString();
    return `/admin/pedidos${text ? `?${text}` : ''}`;
  };

  const reversed = Boolean(from && to && from > to);
  const list = reversed
    ? null
    : await adminGet<AdminOrderList>(
        `orders?${new URLSearchParams({ ...(status && { status }), ...(from && { from }), ...(to && { to }), ...(q && { q }), page: String(page) })}`,
      );
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <>
      <h1 className="font-serif text-4xl">Pedidos</h1>
      <OrderFilters {...filters} />

      {reversed && (
        <p role="status" className="mt-8">
          A data inicial é posterior à data final. Corrija o período.
        </p>
      )}

      {list && list.items.length === 0 && (
        <p className="mt-8 border border-sand p-6">
          {list.total > 0
            ? 'Esta página não existe. Volte para a primeira.'
            : hasFilters
              ? 'Nenhum pedido encontrado com esses filtros.'
              : 'Ainda não há pedidos na loja.'}
        </p>
      )}

      {list && list.items.length > 0 && (
        <>
          <p className="mt-8 text-sm">
            {list.total} {list.total === 1 ? 'pedido' : 'pedidos'}
          </p>

          <table className="mt-2 hidden w-full text-left md:table">
            <thead>
              <tr className="border-b border-clay text-sm">
                <th scope="col" className="py-2 pr-4 font-medium">Pedido</th>
                <th scope="col" className="py-2 pr-4 font-medium">Cliente</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Data</th>
                <th scope="col" className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((order) => (
                <tr key={order.number} className="border-b border-sand hover:bg-sand/30">
                  <td className="py-1 pr-4">
                    <Link
                      href={`/admin/pedidos/${order.number}`}
                      className={`flex min-h-11 items-center underline ${FOCUS}`}
                    >
                      #{order.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{order.customerName}</td>
                  <td className="py-2 pr-4">{statusLabel(order.status)}</td>
                  <td className="py-2 pr-4">{formatDateTime(order.createdAt)}</td>
                  <td className="py-2 text-right">{formatBRL(order.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-2 border-t border-sand md:hidden">
            {list.items.map((order) => (
              <li key={order.number} className="border-b border-sand">
                <Link
                  href={`/admin/pedidos/${order.number}`}
                  className={`block min-h-11 px-1 py-3 hover:bg-sand/30 focus-visible:-outline-offset-2 ${FOCUS}`}
                >
                  <span className="flex items-baseline justify-between gap-4">
                    <strong className="font-semibold">#{order.number}</strong>
                    <span>{formatBRL(order.totalCents)}</span>
                  </span>
                  <span className="mt-1 block">{order.customerName}</span>
                  <span className="mt-1 flex justify-between gap-4 text-sm">
                    <span>{statusLabel(order.status)}</span>
                    <span>{formatDateTime(order.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {list && list.total > 0 && (
        <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={href(Math.min(page - 1, pages))} className={`flex min-h-11 items-center underline ${FOCUS}`}>
              Anterior
            </Link>
          ) : (
            <span aria-hidden className="min-w-16" />
          )}
          <span className="text-sm">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className={`flex min-h-11 items-center underline ${FOCUS}`}>
              Próxima
            </Link>
          ) : (
            <span aria-hidden className="min-w-16" />
          )}
        </nav>
      )}
    </>
  );
}
