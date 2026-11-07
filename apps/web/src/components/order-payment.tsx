'use client';

import { formatBRL, type OrderView, type PayOrderInput, type PaymentView } from '@aurevi/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// The Mercado Pago script needs the browser.
const PaymentBrick = dynamic(() => import('./payment-brick'), {
  ssr: false,
  loading: () => <p className="py-6 text-sm">Carregando as formas de pagamento…</p>,
});

const POLL_MS = 5_000;

function PixPanel({ payment, onChange }: { payment: PaymentView; onChange: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const expiresAt = payment.pixExpiresAt;

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const clock =
    secondsLeft === null
      ? null
      : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div>
      <p className="text-sm">
        Pague {formatBRL(payment.amountCents)} no app do seu banco, com o QR code ou o Pix copia e
        cola. Esta página atualiza sozinha quando o pagamento chegar.
      </p>
      {payment.pixQrCodeBase64 && (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URI, nothing to optimize
        <img
          src={`data:image/png;base64,${payment.pixQrCodeBase64}`}
          alt="QR code do Pix"
          width={220}
          height={220}
          className="mt-4 bg-white p-2"
        />
      )}
      <p className="mt-4 text-sm font-medium" role="timer">
        {clock ? `Expira em ${clock}` : 'Expira em 30 minutos'}
      </p>
      <label className="mt-4 block text-sm" htmlFor="pix-code">
        Pix copia e cola
      </label>
      <input
        id="pix-code"
        readOnly
        value={payment.pixQrCode ?? ''}
        className="mt-1 block w-full border border-clay bg-paper p-3 text-sm"
        onFocus={(event) => event.target.select()}
      />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="bg-cocoa px-6 py-3 text-sm font-medium text-paper"
          onClick={async () => {
            await navigator.clipboard.writeText(payment.pixQrCode ?? '');
            setCopied(true);
          }}
        >
          {copied ? 'Código copiado' : 'Copiar código'}
        </button>
        <button type="button" className="text-sm underline" onClick={onChange}>
          Pagar com cartão
        </button>
      </div>
    </div>
  );
}

export function OrderPayment({ token, order }: { token: string; order: OrderView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  // A card token works once, so every attempt gets a fresh form.
  const [formKey, setFormKey] = useState(0);
  const { payment, paymentOptions: options, payerEmail } = order;

  const pixOpen = payment?.method === 'pix' && payment.status === 'pending';
  const waiting =
    pixOpen ||
    payment?.status === 'in_process' ||
    payment?.status === 'creating' ||
    (payment?.method === 'credit_card' && payment.status === 'pending');

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, router]);

  const pay = useCallback(
    async (input: PayOrderInput) => {
      setError(null);
      const response = await fetch(`/api/orders/${encodeURIComponent(token)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).catch(() => null);
      if (!response?.ok) {
        const data = (await response?.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? 'Não foi possível enviar o pagamento. Tente de novo.');
      }
      setChanging(false);
      setFormKey((key) => key + 1);
      router.refresh();
    },
    [token, router],
  );

  const showPix = pixOpen && !changing;
  const showForm = !showPix && !(waiting && !pixOpen);

  return (
    <section className="mt-8 bg-sand p-5">
      <h2 className="font-serif text-3xl">Pagamento</h2>
      <div aria-live="polite">
        {error && <p className="mt-3 text-sm font-medium">{error}</p>}
        {!error && payment?.message && (
          <p className="mt-3 text-sm font-medium">{payment.message}</p>
        )}
      </div>
      {showPix && (
        <div className="mt-3">
          <PixPanel payment={payment} onChange={() => setChanging(true)} />
        </div>
      )}
      {showForm && (
        <>
          <p className="mt-3 text-sm">
            Cartão: {formatBRL(options.cardTotalCents)}, em até {options.maxInstallments}x.
            {options.pixDiscountCents > 0 &&
              ` Pix: ${formatBRL(options.pixTotalCents)}, com ${options.pixDiscountPercent}% de desconto nas peças.`}
          </p>
          <div className="mt-4">
            <PaymentBrick
              key={formKey}
              amountCents={options.cardTotalCents}
              payerEmail={payerEmail}
              maxInstallments={options.maxInstallments}
              onPay={pay}
            />
          </div>
        </>
      )}
    </section>
  );
}
