'use client';

import { formatBRL, type ShippingOption } from '@aurevi/shared';
import { type FormEvent, useState } from 'react';

export const shippingDays = ({ minDays, maxDays }: Pick<ShippingOption, 'minDays' | 'maxDays'>) =>
  minDays === maxDays ? `${maxDays} dias úteis` : `${minDays} a ${maxDays} dias úteis`;

export function ShippingEstimate({
  endpoint = '/api/shipping/quote',
  inputId = 'cep',
}: {
  endpoint?: string;
  inputId?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [options, setOptions] = useState<ShippingOption[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    const postalCode = String(new FormData(event.currentTarget).get('cep'));
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postalCode }),
      });
      if (!response.ok) throw new Error('Quote failed');
      setOptions((await response.json()) as ShippingOption[]);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={inputId} className="text-sm">
        Calcule o frete
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          name="cep"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          pattern="\d{5}-?\d{3}"
          placeholder="00000-000"
          className="min-w-0 flex-1 border border-clay bg-paper p-2.5"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="border border-cocoa px-4 text-sm"
        >
          Calcular
        </button>
      </div>
      <div aria-live="polite" className="mt-3 text-sm">
        {status === 'error' && <p>Confira o CEP e tente de novo.</p>}
        {status === 'done' && options.length === 0 && (
          <p>Ainda não temos frete calculado para esse CEP. Fale com a gente pelo WhatsApp.</p>
        )}
        {status === 'done' && options.length > 0 && (
          <ul className="space-y-1">
            {options.map((option) => (
              <li key={option.id} className="flex justify-between gap-4">
                <span>
                  {option.label}, {shippingDays(option)}
                </span>
                <span className="font-medium">
                  {option.cents === 0 ? 'Grátis' : formatBRL(option.cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
