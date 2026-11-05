'use client';

import { formatBRL, pixPriceCents } from '@aurevi/shared';
import Image from 'next/image';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { ShippingEstimate } from '@/components/shipping-estimate';
import { imageUrl, isVector } from '@/lib/images';

export function CartButton() {
  const { cart, open } = useCart();
  const count = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  return (
    <button type="button" onClick={open} className="-mr-2 p-2 text-sm">
      Sacola{count > 0 && ` (${count})`}
    </button>
  );
}

export function CartDrawer() {
  const cartState = useCart();
  const { cart, isOpen, close, setQuantity, removeItem, applyCoupon, removeCoupon } = cartState;
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    if (!isOpen && element.open) element.close();
  }, [isOpen]);

  const attempt = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const submitCoupon = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code'));
    void attempt(async () => {
      await applyCoupon(code);
      form.reset();
    });
  };

  const threshold = cart?.freeShippingThresholdCents ?? null;
  const merchandise = cart?.merchandiseCents ?? 0;
  const missing = threshold === null ? 0 : Math.max(0, threshold - merchandise);
  const hasItems = (cart?.items.length ?? 0) > 0;
  const blocked = cart?.items.some((item) => !item.available) ?? false;

  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-label="Sacola"
      className="cart-panel bg-paper text-cocoa"
      onClick={(event) => event.target === dialog.current && close()}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="font-serif text-3xl">Sacola</h2>
          <button type="button" onClick={close} className="-mr-2 p-2 text-sm">
            Fechar
          </button>
        </div>

        {!hasItems ? (
          <div className="flex-1 px-5 py-8">
            <p>Sua sacola está vazia.</p>
            <Link
              href="/novidades"
              onClick={close}
              className="mt-4 inline-block underline underline-offset-4"
            >
              Ver novidades
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {threshold !== null && (
                <div className="mb-5">
                  <p className="text-sm">
                    {missing > 0
                      ? `Faltam ${formatBRL(missing)} para o frete grátis`
                      : 'Você ganhou frete grátis'}
                  </p>
                  <progress
                    value={Math.min(merchandise, threshold)}
                    max={threshold}
                    className="mt-1 h-1 w-full accent-cocoa"
                  />
                </div>
              )}
              <ul className="space-y-5">
                {cart?.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <div className="relative aspect-[3/4] w-20 shrink-0 bg-sand">
                      {item.imageKey && (
                        <Image
                          src={imageUrl(item.imageKey)}
                          alt={item.imageAlt}
                          fill
                          sizes="80px"
                          unoptimized={isVector(item.imageKey)}
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/produto/${item.slug}`}
                        onClick={close}
                        className="font-serif text-xl leading-tight"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-sm">{item.variantLabel}</p>
                      <p className="mt-1 text-sm font-medium">{formatBRL(item.lineCents)}</p>
                      {!item.available && (
                        <p className="mt-1 text-sm font-medium">
                          Sem estoque nessa quantidade. Ajuste ou remova.
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <label className="text-sm">
                          <span className="sr-only">Quantidade de {item.productName}</span>
                          <select
                            value={item.quantity}
                            onChange={(event) =>
                              void attempt(() => setQuantity(item.id, Number(event.target.value)))
                            }
                            className="border border-clay bg-paper p-2"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((quantity) => (
                              <option key={quantity}>{quantity}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void attempt(() => removeItem(item.id))}
                          className="p-2 text-sm underline underline-offset-4"
                        >
                          Remover
                          <span className="sr-only"> {item.productName}</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-sand pt-5">
                {cart?.coupon ? (
                  <p className="flex items-center justify-between text-sm">
                    <span>
                      Cupom <span className="font-medium">{cart.coupon.code}</span> aplicado
                    </span>
                    <button
                      type="button"
                      onClick={() => void attempt(removeCoupon)}
                      className="p-2 underline underline-offset-4"
                    >
                      Remover cupom
                    </button>
                  </p>
                ) : (
                  <form onSubmit={submitCoupon}>
                    <label htmlFor="coupon" className="text-sm">
                      Cupom de desconto
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="coupon"
                        name="code"
                        required
                        autoComplete="off"
                        className="min-w-0 flex-1 border border-clay bg-paper p-2.5 uppercase"
                      />
                      <button type="submit" className="border border-cocoa px-4 text-sm">
                        Aplicar
                      </button>
                    </div>
                  </form>
                )}
                {cart?.couponProblem && <p className="mt-2 text-sm">{cart.couponProblem}</p>}
              </div>

              <div className="mt-5 border-t border-sand pt-5">
                <ShippingEstimate endpoint="/api/cart/shipping-quote" inputId="cart-cep" />
              </div>
            </div>

            <div className="border-t border-sand px-5 py-4">
              {error && (
                <p role="alert" className="mb-3 text-sm font-medium">
                  {error}
                </p>
              )}
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd>{formatBRL(cart?.subtotalCents ?? 0)}</dd>
                </div>
                {(cart?.discountCents ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <dt>Desconto</dt>
                    <dd>- {formatBRL(cart?.discountCents ?? 0)}</dd>
                  </div>
                )}
                {(cart?.pixDiscountPercent ?? 0) > 0 && (
                  <div className="flex justify-between font-medium">
                    <dt>No Pix, sem o frete</dt>
                    <dd>{formatBRL(pixPriceCents(merchandise, cart?.pixDiscountPercent ?? 0))}</dd>
                  </div>
                )}
              </dl>
              {blocked ? (
                <p className="mt-3 bg-sand p-4 text-center text-sm">
                  Ajuste a sacola para continuar
                </p>
              ) : (
                <Link
                  href="/checkout"
                  onClick={close}
                  className="mt-3 block bg-cocoa py-4 text-center text-sm font-medium text-paper"
                >
                  Finalizar compra
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
