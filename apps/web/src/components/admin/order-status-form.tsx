'use client';

import { adminTransitions, type OrderStatus } from '@aurevi/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { statusLabel } from '@/lib/admin-orders';

const FIELD = 'mt-1 block min-h-11 w-full border border-clay bg-paper px-3 py-2';

export function OrderStatusForm({ number, status }: { number: number; status: OrderStatus }) {
  const router = useRouter();
  const options = adminTransitions[status];
  const [choice, setChoice] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;

  if (options.length === 0) {
    return <p className="mt-4">Não há mudança de status disponível para este pedido.</p>;
  }

  // After a save the page refreshes with a new status, so the old choice may no longer be offered.
  const selected = options.find((option) => option === choice) ?? options[0]!;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const trackingCode = String(data.get('trackingCode') ?? '').trim();
    const carrier = String(data.get('carrier') ?? '').trim();
    if (selected === 'shipped' && !trackingCode) {
      setMessage('Informe o código de rastreio.');
      return;
    }
    setSending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${number}/status`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // Empty strings would fail validation on transitions that do not need them.
        body: JSON.stringify({
          status: selected,
          ...(selected === 'shipped' && trackingCode && { trackingCode }),
          ...(selected === 'shipped' && carrier && { carrier }),
        }),
      });
      if (response.ok) {
        setMessage(`Status alterado para ${statusLabel(selected).toLowerCase()}.`);
        startRefresh(() => router.refresh());
      } else {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        setMessage(
          typeof body?.message === 'string'
            ? body.message
            : 'Não foi possível alterar o status. Confira os dados e tente de novo.',
        );
      }
    } catch {
      setMessage('Sem conexão com o servidor. Tente de novo.');
    }
    setSending(false);
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-sm space-y-5">
      <label className="block">
        Novo status
        <select
          value={selected}
          onChange={(event) => {
            setChoice(event.target.value);
            setMessage('');
          }}
          className={FIELD}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {statusLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {selected === 'shipped' && (
        <>
          <label className="block">
            Código de rastreio
            <input name="trackingCode" maxLength={60} aria-required autoComplete="off" className={FIELD} />
          </label>
          <label className="block">
            Transportadora (opcional)
            <input name="carrier" maxLength={60} autoComplete="off" className={FIELD} />
          </label>
        </>
      )}
      <p role="status" aria-live="polite" className="min-h-6 text-sm font-medium text-cocoa">
        {message}
      </p>
      <button type="submit" disabled={busy} className="min-h-11 w-full bg-cocoa px-6 py-2 text-paper disabled:opacity-60">
        {busy ? 'Salvando…' : 'Salvar status'}
      </button>
    </form>
  );
}
