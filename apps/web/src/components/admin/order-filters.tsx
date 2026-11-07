import { orderStatuses } from '@aurevi/shared';
import Link from 'next/link';
import { statusLabel } from '@/lib/admin-orders';

const FIELD = 'mt-1 block min-h-11 w-full border border-clay bg-paper px-3 py-2';

// A plain GET form: the filters live in the URL, so no client code is needed.
export function OrderFilters({
  status = '',
  from = '',
  to = '',
  q = '',
}: {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
}) {
  return (
    <form method="get" action="/admin/pedidos" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block text-sm">
        Status
        <select name="status" defaultValue={status} className={FIELD}>
          <option value="">Todos</option>
          <option value="to_ship">A enviar (pagos e em preparação)</option>
          {orderStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        De
        <input type="date" name="from" defaultValue={from} className={FIELD} />
      </label>
      <label className="block text-sm">
        Até
        <input type="date" name="to" defaultValue={to} className={FIELD} />
      </label>
      <label className="block text-sm">
        Buscar
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={80}
          placeholder="Número, nome ou e-mail"
          className={FIELD}
        />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="min-h-11 bg-cocoa px-6 py-2 text-paper">
          Filtrar
        </button>
        <Link
          href="/admin/pedidos"
          className="flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
        >
          Limpar filtros
        </Link>
      </div>
    </form>
  );
}
