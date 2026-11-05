import { formatBRL, type OrderView } from '@aurevi/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Seu pedido',
  robots: { index: false, follow: false },
};

const apiUrl = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

const statusText: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pagamento aprovado',
  preparing: 'Em preparação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  canceled: 'Cancelado',
  refunded: 'Estornado',
};

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Order lookup returned ${response.status}`);
  const order = (await response.json()) as OrderView;
  const address = order.shippingAddress;

  return (
    <div className="px-gutter pt-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] lg:gap-14">
      <div>
        <h1 className="font-serif text-5xl">Pedido #{order.number}</h1>
        <p className="mt-2 font-medium">{statusText[order.status] ?? order.status}</p>

        {order.status === 'pending_payment' && (
          <section className="mt-8 bg-sand p-5">
            <h2 className="font-serif text-3xl">Pagamento</h2>
            <p className="mt-2 text-sm">
              Suas peças estão reservadas. O pagamento por Pix e cartão entra com as credenciais de
              teste do Mercado Pago.
            </p>
          </section>
        )}

        <section className="mt-8 text-sm">
          <h2 className="font-serif text-3xl">Entrega</h2>
          <p className="mt-2">
            {address.street}, {address.number}
            {address.complement && `, ${address.complement}`}
            <br />
            {address.district}, {address.city}, {address.state}
            <br />
            CEP {address.postalCode}
          </p>
          <p className="mt-2">{order.shippingMethod.label}</p>
        </section>
      </div>

      <aside className="mt-8 self-start text-sm lg:mt-0" aria-label="Resumo do pedido">
        <h2 className="font-serif text-3xl">Resumo</h2>
        <ul className="mt-4 space-y-2">
          {order.items.map((item) => (
            <li
              key={`${item.productName}-${item.variantLabel}`}
              className="flex justify-between gap-4"
            >
              <span>
                {item.quantity} × {item.productName}
                <span className="block">{item.variantLabel}</span>
              </span>
              <span>{formatBRL(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-sand pt-4">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatBRL(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between">
              <dt>Cupom {order.couponCode}</dt>
              <dd>- {formatBRL(order.discountCents)}</dd>
            </div>
          )}
          {order.pixDiscountCents > 0 && (
            <div className="flex justify-between">
              <dt>Desconto no Pix</dt>
              <dd>- {formatBRL(order.pixDiscountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Frete</dt>
            <dd>{order.shippingCents === 0 ? 'Grátis' : formatBRL(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-sand pt-2 text-base font-medium">
            <dt>Total</dt>
            <dd>{formatBRL(order.totalCents)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
