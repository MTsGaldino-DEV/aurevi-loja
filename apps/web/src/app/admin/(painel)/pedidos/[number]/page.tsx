import { type AdminOrderDetail, formatBRL } from '@aurevi/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { OrderStatusForm } from '@/components/admin/order-status-form';
import { adminGet } from '@/lib/admin-api';
import { formatDateTime, statusLabel } from '@/lib/admin-orders';

export const metadata = { title: 'Pedido' };

// The checkout stores these as loose JSON; read every field defensively.
const text = (source: Record<string, unknown> | null | undefined, key: string) => {
  const value = source?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

const methodLabels: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão de crédito' };
const paymentStatusLabels: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  in_process: 'Em análise',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
  charged_back: 'Estornado',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? 'border-t border-clay pt-2 font-semibold' : ''}`}>
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number)) notFound();

  const order = await adminGet<AdminOrderDetail>(`orders/${number}`); // a 404 becomes notFound()

  const c = order.customerSnapshot;
  const a = order.shippingAddress;
  const m = order.shippingMethod;
  const street = [text(a, 'street'), text(a, 'number')].filter(Boolean).join(', ');
  const complement = text(a, 'complement');
  const cityLine = [text(a, 'district'), [text(a, 'city'), text(a, 'state')].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(' · ');
  const days = text(m, 'minDays') && text(m, 'maxDays') ? `${text(m, 'minDays')} a ${text(m, 'maxDays')} dias úteis` : '';
  const s = order.shipment;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
        ← Voltar para pedidos
      </Link>
      <h1 className="mt-2 font-serif text-4xl">Pedido #{order.number}</h1>
      <p className="mt-2">
        <strong className="font-semibold">{statusLabel(order.status)}</strong> · feito em{' '}
        {formatDateTime(order.createdAt)}
        {order.paidAt && <> · pago em {formatDateTime(order.paidAt)}</>}
      </p>

      <Section title="Alterar status">
        <OrderStatusForm number={order.number} status={order.status} />
      </Section>

      {order.reviewReason && (
        <Section title="Motivo de revisão">
          <p className="border-2 border-cocoa p-4">{order.reviewReason}</p>
        </Section>
      )}

      <Section title="Itens">
        <ul className="border-t border-sand">
          {order.items.map((item) => (
            <li key={`${item.sku}-${item.variantLabel}`} className="flex justify-between gap-4 border-b border-sand py-3">
              <span className="min-w-0">
                {item.productName}
                {item.variantLabel && <span className="block text-sm">{item.variantLabel}</span>}
                <span className="block text-sm text-clay">
                  SKU {item.sku} · {item.quantity} × {formatBRL(item.unitPriceCents)}
                </span>
              </span>
              <span className="shrink-0">{formatBRL(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3">
          <Line label="Subtotal" value={formatBRL(order.subtotalCents)} />
          {order.discountCents > 0 && (
            <Line
              label={order.couponCode ? `Desconto (cupom ${order.couponCode})` : 'Desconto'}
              value={`− ${formatBRL(order.discountCents)}`}
            />
          )}
          {order.pixDiscountCents > 0 && (
            <Line label="Desconto Pix" value={`− ${formatBRL(order.pixDiscountCents)}`} />
          )}
          <Line label="Frete" value={formatBRL(order.shippingCents)} />
          <Line label="Total" value={formatBRL(order.totalCents)} strong />
        </dl>
      </Section>

      <Section title="Cliente">
        <p>{text(c, 'name') || '—'}</p>
        {text(c, 'email') && <p>{text(c, 'email')}</p>}
        {text(c, 'phone') && <p>{text(c, 'phone')}</p>}
        {text(c, 'cpf') && <p>CPF {text(c, 'cpf')}</p>}
      </Section>

      <Section title="Entrega">
        <p>{street || '—'}{complement && ` — ${complement}`}</p>
        {cityLine && <p>{cityLine}</p>}
        {text(a, 'postalCode') && <p>CEP {text(a, 'postalCode')}</p>}
        <p className="mt-3">
          Frete: {text(m, 'label') || '—'}
          {days && <span className="block text-sm">{days}</span>}
        </p>
      </Section>

      <Section title="Pagamento">
        {order.payments.length === 0 ? (
          <p>Nenhum pagamento registrado.</p>
        ) : (
          <ul className="border-t border-sand">
            {order.payments.map((payment) => (
              <li key={`${payment.createdAt}-${payment.method}`} className="flex justify-between gap-4 border-b border-sand py-3">
                <span>
                  {methodLabels[payment.method] ?? payment.method}
                  {payment.installments && payment.installments > 1 && ` em ${payment.installments}x`}
                  <span className="block text-sm text-clay">
                    {paymentStatusLabels[payment.status] ?? payment.status} · {formatDateTime(payment.createdAt)}
                  </span>
                </span>
                <span className="shrink-0">{formatBRL(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {s && (
        <Section title="Envio">
          <dl>
            <Line label="Transportadora" value={s.carrier || '—'} />
            {s.service && <Line label="Serviço" value={s.service} />}
            <Line label="Código de rastreio" value={s.trackingCode || '—'} />
            <Line label="Enviado em" value={formatDateTime(s.shippedAt)} />
            <Line label="Entregue em" value={formatDateTime(s.deliveredAt)} />
          </dl>
        </Section>
      )}

      {order.notes && (
        <Section title="Observações do cliente">
          <p className="whitespace-pre-wrap">{order.notes}</p>
        </Section>
      )}
    </div>
  );
}
