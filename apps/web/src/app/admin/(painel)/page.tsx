import type { AdminDashboard } from '@aurevi/shared';
import { formatBRL } from '@aurevi/shared';
import Link from 'next/link';
import { adminGet } from '@/lib/admin-api';

export const metadata = { title: 'Início' };

function Card({ label, cents, highlight }: { label: string; cents: number; highlight?: boolean }) {
  return (
    <div className={`p-5 ${highlight ? 'border-2 border-cocoa bg-sand/30' : 'border border-sand'}`}>
      <h2 className="text-sm tracking-[0.15em] uppercase">{label}</h2>
      <p className={`mt-2 font-serif ${highlight ? 'text-5xl' : 'text-4xl'}`}>{formatBRL(cents)}</p>
    </div>
  );
}

function Row({ count, one, many, empty, href }: {
  count: number;
  one: string;
  many: string;
  empty: string;
  href?: string;
}) {
  const body =
    count === 0 ? (
      <>
        <span className="text-clay">{empty}</span>
        <span className="text-sm text-clay">Nada pendente</span>
      </>
    ) : (
      <>
        <span>
          <strong className="font-semibold">{count}</strong> {count === 1 ? one : many}
        </span>
        {href && <span aria-hidden>→</span>}
      </>
    );
  const cls = 'flex min-h-14 items-center justify-between gap-4 px-4 py-3';
  return (
    <li className="border-b border-sand last:border-b-0">
      {href && count > 0 ? (
        <Link
          href={href}
          className={`${cls} hover:bg-sand/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cocoa`}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export default async function AdminHome() {
  const d = await adminGet<AdminDashboard>('dashboard');
  return (
    <>
      <h1 className="font-serif text-4xl">Início</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card label="Esta semana" cents={d.weekCents} highlight />
        <Card label="Este mês" cents={d.monthCents} />
        <Card label="Total" cents={d.totalCents} />
      </div>

      <h2 className="mt-10 font-serif text-2xl">Para resolver agora</h2>
      <ul className="mt-4 max-w-2xl border border-sand">
        <Row
          count={d.toShipCount}
          one="pedido pago para enviar"
          many="pedidos pagos para enviar"
          empty="Pedidos pagos para enviar"
          href="/admin/pedidos?status=to_ship"
        />
        <Row
          count={d.pendingPaymentCount}
          one="aguardando pagamento"
          many="aguardando pagamento"
          empty="Pedidos aguardando pagamento"
          href="/admin/pedidos?status=pending_payment"
        />
        <Row
          count={d.lowStockCount}
          one="produto com estoque baixo"
          many="produtos com estoque baixo"
          empty="Produtos com estoque baixo"
        />
      </ul>
    </>
  );
}
