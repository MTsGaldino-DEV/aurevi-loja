'use client';

import type { PayOrderInput } from '@aurevi/shared';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { useCallback, useMemo } from 'react';

initMercadoPago(process.env['NEXT_PUBLIC_MP_PUBLIC_KEY'] ?? '', { locale: 'pt-BR' });

type Props = {
  amountCents: number;
  payerEmail: string;
  maxInstallments: number;
  onPay: (input: PayOrderInput) => Promise<void>;
};

// The Brick rebuilds itself whenever these objects change, so they must stay stable.
export default function PaymentBrick({ amountCents, payerEmail, maxInstallments, onPay }: Props) {
  const initialization = useMemo(
    () => ({ amount: amountCents / 100, payer: { email: payerEmail } }),
    [amountCents, payerEmail],
  );
  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: 'all' as const,
        bankTransfer: ['pix'],
        maxInstallments,
      },
      visual: {
        style: {
          theme: 'default' as const,
          customVariables: { baseColor: '#66513d', borderRadiusMedium: '2px' },
        },
      },
    }),
    [maxInstallments],
  );
  const onSubmit = useCallback(
    ({
      selectedPaymentMethod,
      formData,
    }: Parameters<typeof Payment>[0] extends {
      onSubmit: (param: infer P, ...rest: never[]) => unknown;
    }
      ? P
      : never) => {
      if (selectedPaymentMethod === 'bank_transfer') return onPay({ method: 'pix' });
      const { token, payment_method_id, issuer_id, installments, payer } = formData;
      return onPay({
        method: 'credit_card',
        token,
        paymentMethodId: payment_method_id,
        issuerId: issuer_id ? String(issuer_id) : undefined,
        installments: Number(installments),
        payer: {
          email: payer.email ?? payerEmail,
          identification: {
            type: payer.identification?.type ?? 'CPF',
            number: payer.identification?.number ?? '',
          },
        },
      });
    },
    [onPay, payerEmail],
  );
  return (
    <Payment
      initialization={initialization}
      customization={customization}
      locale="pt"
      onSubmit={onSubmit}
    />
  );
}
