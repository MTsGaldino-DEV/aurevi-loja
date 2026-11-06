'use client';

import {
  formatBRL,
  installmentPlan,
  pixPriceCents,
  type ProductDetail,
  type StorefrontLayout,
} from '@aurevi/shared';
import Image from 'next/image';
import { useMemo, useRef, useState } from 'react';
import { useCart } from '@/components/cart-context';
import { ShippingEstimate } from '@/components/shipping-estimate';
import { imageUrl, isVector } from '@/lib/images';
import { cn } from '@/lib/utils';

export function ProductView({
  product,
  payment,
}: {
  product: ProductDetail;
  payment: StorefrontLayout['payment'];
}) {
  const colorOption = product.options.find((option) => option.name === 'Cor');
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    // Color may start selected, because the photos show one. Size never does.
    const first = colorOption?.values[0];
    return colorOption && first ? { [colorOption.name]: first.id } : {};
  });
  const [missingOptions, setMissingOptions] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { addItem } = useCart();
  const optionsRef = useRef<HTMLDivElement>(null);

  const selectedIds = Object.values(selection);
  const isComplete = selectedIds.length === product.options.length;
  const variant = isComplete
    ? product.variants.find((v) => selectedIds.every((id) => v.optionValueIds.includes(id)))
    : undefined;

  const isPossible = (optionName: string, valueId: string) => {
    const others = Object.entries(selection)
      .filter(([name]) => name !== optionName)
      .map(([, id]) => id);
    return product.variants.some(
      (v) =>
        v.available &&
        v.optionValueIds.includes(valueId) &&
        others.every((id) => v.optionValueIds.includes(id)),
    );
  };

  const selectedColorId = colorOption ? selection[colorOption.name] : undefined;
  const images = useMemo(() => {
    const colorIds = new Set(colorOption?.values.map((value) => value.id));
    return product.images.filter(
      (image) =>
        !image.optionValueId ||
        !colorIds.has(image.optionValueId) ||
        image.optionValueId === selectedColorId,
    );
  }, [product.images, colorOption, selectedColorId]);

  const priceCents = variant?.priceCents ?? product.priceCents;
  const plan = installmentPlan(priceCents, {
    maxInstallments: payment.maxInstallments,
    minInstallmentCents: payment.minInstallmentCents,
  });
  const onSale = product.compareAtPriceCents !== null && product.compareAtPriceCents > priceCents;

  async function chooseToBuy() {
    if (!variant) {
      setMissingOptions(true);
      optionsRef.current?.scrollIntoView({ block: 'center' });
      return;
    }
    setBuyError(null);
    setAdding(true);
    try {
      await addItem(variant.id);
    } catch (cause) {
      setBuyError((cause as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const buyDisabled = isComplete && !variant?.available;
  const buyLabel = buyDisabled
    ? 'Esgotado'
    : isComplete
      ? 'Adicionar à sacola'
      : 'Escolha o tamanho';

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)] lg:gap-10 lg:px-gutter">
      <ul
        aria-label="Fotos do produto"
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:gap-3 lg:overflow-visible"
      >
        {images.map((image, index) => (
          <li
            key={`${image.key}-${index}`}
            className="relative aspect-[3/4] w-[88vw] shrink-0 snap-start bg-sand lg:w-auto"
          >
            <Image
              src={imageUrl(image.key)}
              alt={image.alt}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 30vw, 88vw"
              unoptimized={isVector(image.key)}
              className="object-cover"
            />
          </li>
        ))}
      </ul>

      <div className="px-gutter pt-5 lg:sticky lg:top-24 lg:self-start lg:px-0 lg:pt-0">
        <h1 className="font-serif text-4xl leading-tight lg:text-5xl">{product.name}</h1>
        <p className="mt-3 text-lg">
          {onSale && (
            <>
              <span className="sr-only">De </span>
              <s className="mr-2 text-base">{formatBRL(product.compareAtPriceCents!)}</s>
              <span className="sr-only">por </span>
            </>
          )}
          {formatBRL(priceCents)}
        </p>
        {payment.pixDiscountPercent > 0 && (
          <p className="font-medium">
            {formatBRL(pixPriceCents(priceCents, payment.pixDiscountPercent))} no Pix
          </p>
        )}
        {/* "Sem juros" appears only after the Mercado Pago setup is confirmed in Phase 5. */}
        {plan.count > 1 && (
          <p className="text-sm">
            ou em até {plan.count}x de {formatBRL(plan.valueCents)} no cartão
          </p>
        )}

        <div ref={optionsRef} className="mt-6 space-y-5">
          {product.options.map((option) => (
            <fieldset key={option.name}>
              <legend className="mb-2 text-sm">
                {option.name}
                {selection[option.name] && (
                  <span className="font-medium">
                    : {option.values.find((value) => value.id === selection[option.name])?.value}
                  </span>
                )}
              </legend>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const possible = isPossible(option.name, value.id);
                  const checked = selection[option.name] === value.id;
                  return (
                    <label
                      key={value.id}
                      className={cn(
                        'relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 border border-clay px-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2',
                        checked && 'bg-cocoa text-paper',
                        !possible && 'cursor-not-allowed border-dune line-through opacity-70',
                      )}
                    >
                      <input
                        type="radio"
                        name={option.name}
                        value={value.id}
                        checked={checked}
                        disabled={!possible}
                        onChange={() => {
                          setSelection((current) => ({ ...current, [option.name]: value.id }));
                          setMissingOptions(false);
                        }}
                        className="sr-only"
                      />
                      {value.hex && (
                        <span
                          aria-hidden
                          className={cn(
                            'size-3.5 rounded-full border',
                            checked ? 'border-paper' : 'border-clay',
                          )}
                          style={{ background: value.hex }}
                        />
                      )}
                      {value.value}
                      {!possible && <span className="sr-only"> (esgotado)</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {missingOptions && (
          <p role="alert" className="mt-3 text-sm font-medium">
            Escolha o tamanho para continuar.
          </p>
        )}

        {buyError && (
          <p role="alert" className="mt-3 text-sm font-medium">
            {buyError}
          </p>
        )}

        {/* Fixed on phones, so buying never depends on scrolling back. */}
        <div className="buy-bar fixed inset-x-0 bottom-0 z-20 border-t border-sand bg-paper p-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
          <button
            type="button"
            onClick={chooseToBuy}
            disabled={buyDisabled || adding}
            className="w-full bg-cocoa py-4 text-sm font-medium text-paper disabled:bg-dune disabled:text-cocoa"
          >
            {buyLabel}
          </button>
        </div>

        <div className="mt-8 border-t border-sand pt-6">
          <ShippingEstimate
            variantId={variant?.id ?? product.variants.find((v) => v.available)?.id}
          />
        </div>

        <div className="mt-8 space-y-4 border-t border-sand pt-6 leading-relaxed">
          <p>{product.description}</p>
          {product.composition && (
            <p>
              <span className="font-medium">Composição:</span> {product.composition}
            </p>
          )}
          {product.modelInfo && (
            <p>
              <span className="font-medium">Modelo:</span> {product.modelInfo}
            </p>
          )}
        </div>

        {product.sizeChart && (
          <div className="mt-8 border-t border-sand pt-6">
            <h2 className="font-serif text-2xl">Medidas</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-clay">
                  <th scope="col" className="py-2 pr-2 font-medium">
                    Tamanho
                  </th>
                  {product.sizeChart.columns.map((column) => (
                    <th key={column} scope="col" className="py-2 pr-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.sizeChart.rows.map((row) => (
                  <tr key={row.size} className="border-b border-sand">
                    <th scope="row" className="py-2 pr-2 font-medium">
                      {row.size}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={index} className="py-2 pr-2">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
