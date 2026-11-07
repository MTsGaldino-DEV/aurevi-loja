const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatBRL = (cents: number) => brl.format(cents / 100);

export const pixPriceCents = (priceCents: number, discountPercent: number) =>
  priceCents - Math.floor((priceCents * discountPercent) / 100);

export function installmentPlan(
  totalCents: number,
  rules: { maxInstallments: number; minInstallmentCents: number },
) {
  const byValue = Math.floor(totalCents / rules.minInstallmentCents);
  const count = Math.max(1, Math.min(rules.maxInstallments, byValue));
  return { count, valueCents: Math.ceil(totalCents / count) };
}

// First five digits of the postal code, per Correios ranges.
const ufRanges: [number, number, string][] = [
  [1000, 19999, 'SP'],
  [20000, 28999, 'RJ'],
  [29000, 29999, 'ES'],
  [30000, 39999, 'MG'],
  [40000, 48999, 'BA'],
  [49000, 49999, 'SE'],
  [50000, 56999, 'PE'],
  [57000, 57999, 'AL'],
  [58000, 58999, 'PB'],
  [59000, 59999, 'RN'],
  [60000, 63999, 'CE'],
  [64000, 64999, 'PI'],
  [65000, 65999, 'MA'],
  [66000, 68899, 'PA'],
  [68900, 68999, 'AP'],
  [69000, 69299, 'AM'],
  [69300, 69399, 'RR'],
  [69400, 69899, 'AM'],
  [69900, 69999, 'AC'],
  [70000, 72799, 'DF'],
  [72800, 72999, 'GO'],
  [73000, 73699, 'DF'],
  [73700, 76799, 'GO'],
  [76800, 76999, 'RO'],
  [77000, 77999, 'TO'],
  [78000, 78899, 'MT'],
  [79000, 79999, 'MS'],
  [80000, 87999, 'PR'],
  [88000, 89999, 'SC'],
  [90000, 99999, 'RS'],
];

export const allUfs = [...new Set(ufRanges.map(([, , uf]) => uf))];

export function ufFromPostalCode(postalCode: string) {
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const prefix = Number(digits.slice(0, 5));
  return ufRanges.find(([from, to]) => prefix >= from && prefix <= to)?.[2] ?? null;
}

export function applyFreeShipping<T extends { cents: number }>(
  options: T[],
  eligibleCents: number,
  thresholdCents: number | null,
): T[] {
  if (thresholdCents === null || eligibleCents < thresholdCents || options.length === 0) {
    return options;
  }
  const cheapest = Math.min(...options.map((option) => option.cents));
  const index = options.findIndex((option) => option.cents === cheapest);
  return options.map((option, i) => (i === index ? { ...option, cents: 0 } : option));
}

// What each payment method costs for an order. The Pix discount applies to merchandise, not shipping.
export function orderPaymentOptions(
  order: { subtotalCents: number; discountCents: number; shippingCents: number },
  rules: { pixDiscountPercent: number; maxInstallments: number; minInstallmentCents: number },
) {
  const merchandiseCents = order.subtotalCents - order.discountCents;
  const pixMerchandiseCents = pixPriceCents(merchandiseCents, rules.pixDiscountPercent);
  const cardTotalCents = merchandiseCents + order.shippingCents;
  return {
    cardTotalCents,
    pixTotalCents: pixMerchandiseCents + order.shippingCents,
    pixDiscountCents: merchandiseCents - pixMerchandiseCents,
    pixDiscountPercent: rules.pixDiscountPercent,
    maxInstallments: installmentPlan(cardTotalCents, rules).count,
  };
}
