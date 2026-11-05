'use client';

import {
  checkoutSchema,
  type CheckoutResult,
  computeTotals,
  formatBRL,
  type ShippingOption,
} from '@aurevi/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { shippingDays } from '@/components/shipping-estimate';

const STEPS = ['Dados e entrega', 'Frete', 'Pagamento'];
const FIELD = 'mt-1 block w-full border border-clay bg-paper p-3 aria-invalid:border-2';

type Errors = Record<string, string | undefined>;

const stepOneSchema = checkoutSchema.pick({ customer: true, address: true });

export function CheckoutForm() {
  const { cart, refresh } = useCart();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [shippingOptionId, setShippingOptionId] = useState('');
  const [notes, setNotes] = useState('');
  const details = useRef<ReturnType<typeof stepOneSchema.parse> | null>(null);
  // Same key for every retry of this checkout, so a double click cannot create two orders.
  const [checkoutKey] = useState(() => crypto.randomUUID());

  const selected = options.find((option) => option.id === shippingOptionId);
  const totals = cart
    ? computeTotals({
        subtotalCents: cart.subtotalCents,
        coupon: cart.discountCents ? { type: 'fixed', value: cart.discountCents } : null,
        shippingCents: selected?.cents ?? 0,
        pixDiscountPercent: 0,
      })
    : null;

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '');
    const parsed = stepOneSchema.safeParse({
      customer: {
        name: text('name'),
        email: text('email'),
        cpf: text('cpf'),
        phone: text('phone'),
      },
      address: {
        postalCode: text('postalCode'),
        street: text('street'),
        number: text('number'),
        complement: text('complement') || undefined,
        district: text('district'),
        city: text('city'),
        state: text('state'),
      },
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        found[String(issue.path[issue.path.length - 1])] ??= issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/cart/shipping-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postalCode: parsed.data.address.postalCode }),
      });
      if (!response.ok) throw new Error('Quote failed');
      const quoted = (await response.json()) as ShippingOption[];
      details.current = parsed.data;
      setOptions(quoted);
      setShippingOptionId(quoted[0]?.id ?? '');
      setStep(2);
    } catch {
      setFormError('Não foi possível calcular o frete. Confira o CEP e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details.current || !shippingOptionId) return;
    setFormError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutKey,
          ...details.current,
          shippingOptionId,
          notes: notes || undefined,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        (CheckoutResult & { message?: string }) | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? 'Não foi possível criar o pedido. Tente de novo.');
      }
      await refresh();
      router.replace(`/pedido/${result.accessToken}`);
    } catch (cause) {
      setFormError((cause as Error).message);
      await refresh().catch(() => {});
      setBusy(false);
    }
  }

  if (cart && cart.items.length === 0 && !busy) {
    return (
      <div className="px-gutter py-16">
        <h1 className="font-serif text-5xl">Sua sacola está vazia</h1>
        <Link href="/novidades" className="mt-4 inline-block underline underline-offset-4">
          Ver novidades
        </Link>
      </div>
    );
  }

  const field = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={FIELD}
        {...props}
      />
      {errors[name] && (
        <span id={`${name}-error`} className="mt-1 block font-medium">
          {errors[name]}
        </span>
      )}
    </label>
  );

  return (
    <div className="px-gutter pt-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] lg:gap-14">
      <div>
        <h1 className="font-serif text-5xl">Finalizar compra</h1>
        <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? 'step' : undefined}
              className={step === index + 1 ? 'font-medium underline underline-offset-4' : ''}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {formError && (
          <p role="alert" className="mt-5 bg-sand p-3 text-sm font-medium">
            {formError}
          </p>
        )}

        <details className="mt-6 border-y border-sand py-3 lg:hidden">
          <summary className="flex cursor-pointer justify-between text-sm font-medium">
            <span>Resumo do pedido</span>
            <span>{totals && formatBRL(totals.totalCents)}</span>
          </summary>
          <OrderSummary selected={selected} />
        </details>

        <form onSubmit={submitDetails} noValidate hidden={step !== 1} className="mt-6 space-y-8">
          <fieldset className="space-y-4">
            <legend className="mb-3 font-serif text-3xl">Seus dados</legend>
            {field('name', 'Nome completo', { autoComplete: 'name' })}
            {field('email', 'E-mail', { type: 'email', autoComplete: 'email' })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('cpf', 'CPF', { inputMode: 'numeric', autoComplete: 'off' })}
              {field('phone', 'Celular com DDD', { type: 'tel', autoComplete: 'tel' })}
            </div>
          </fieldset>
          <fieldset className="space-y-4">
            <legend className="mb-3 font-serif text-3xl">Entrega</legend>
            {field('postalCode', 'CEP', { inputMode: 'numeric', autoComplete: 'postal-code' })}
            {field('street', 'Rua', { autoComplete: 'address-line1' })}
            <div className="grid grid-cols-2 gap-4">
              {field('number', 'Número')}
              {field('complement', 'Complemento (opcional)', { autoComplete: 'address-line2' })}
            </div>
            {field('district', 'Bairro')}
            <div className="grid grid-cols-[1fr_5rem] gap-4">
              {field('city', 'Cidade', { autoComplete: 'address-level2' })}
              {field('state', 'UF', { autoComplete: 'address-level1', maxLength: 2 })}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-cocoa py-4 text-sm font-medium text-paper disabled:opacity-70 sm:w-auto sm:px-10"
          >
            {busy ? 'Calculando o frete' : 'Continuar para o frete'}
          </button>
        </form>

        <form onSubmit={placeOrder} hidden={step !== 2} className="mt-6 space-y-6">
          <fieldset>
            <legend className="mb-3 font-serif text-3xl">Frete</legend>
            {options.length === 0 ? (
              <p>Ainda não entregamos nesse CEP. Volte e confira o endereço.</p>
            ) : (
              <div className="space-y-2">
                {options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 border border-clay p-4 has-checked:border-2 has-checked:border-cocoa"
                  >
                    <input
                      type="radio"
                      name="shipping"
                      value={option.id}
                      checked={shippingOptionId === option.id}
                      onChange={() => setShippingOptionId(option.id)}
                      className="accent-cocoa"
                    />
                    <span className="flex-1">
                      {option.label}
                      <span className="block text-sm">Chega em {shippingDays(option)}</span>
                    </span>
                    <span className="font-medium">
                      {option.cents === 0 ? 'Grátis' : formatBRL(option.cents)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="block text-sm">
            Comentários do pedido (opcional)
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              className={FIELD}
            />
          </label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="p-3 text-sm underline underline-offset-4"
            >
              Voltar para os dados
            </button>
            <button
              type="submit"
              disabled={busy || !shippingOptionId}
              className="bg-cocoa py-4 text-sm font-medium text-paper disabled:opacity-70 sm:px-10"
            >
              {busy ? 'Criando o pedido' : 'Continuar para o pagamento'}
            </button>
          </div>
        </form>
      </div>

      <aside
        className="hidden self-start lg:sticky lg:top-24 lg:block"
        aria-label="Resumo do pedido"
      >
        <h2 className="font-serif text-3xl">Resumo</h2>
        <OrderSummary selected={selected} />
      </aside>
    </div>
  );
}

function OrderSummary({ selected }: { selected: ShippingOption | undefined }) {
  const { cart } = useCart();
  if (!cart) return null;
  const shipping = selected?.cents ?? 0;
  return (
    <div className="mt-4 text-sm">
      <ul className="space-y-2">
        {cart.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span>
              {item.quantity} × {item.productName}
              <span className="block">{item.variantLabel}</span>
            </span>
            <span>{formatBRL(item.lineCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1 border-t border-sand pt-4">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatBRL(cart.subtotalCents)}</dd>
        </div>
        {cart.discountCents > 0 && (
          <div className="flex justify-between">
            <dt>Cupom {cart.coupon?.code}</dt>
            <dd>- {formatBRL(cart.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Frete</dt>
          <dd>
            {!selected
              ? 'Calculado na próxima etapa'
              : shipping === 0
                ? 'Grátis'
                : formatBRL(shipping)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-sand pt-2 text-base font-medium">
          <dt>Total</dt>
          <dd>{formatBRL(cart.merchandiseCents + shipping)}</dd>
        </div>
      </dl>
    </div>
  );
}
