import { z } from 'zod';

export type CouponRule = {
  type: 'percent' | 'fixed' | 'free_shipping';
  value: number;
  minOrderCents: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  isActive: boolean;
};

export function couponProblem(coupon: CouponRule, subtotalCents: number, now: Date) {
  if (!coupon.isActive) return 'Este cupom não está disponível.';
  if (coupon.startsAt && now < coupon.startsAt) return 'Este cupom ainda não está valendo.';
  if (coupon.expiresAt && now > coupon.expiresAt) return 'Este cupom expirou.';
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) {
    return 'Este cupom já foi totalmente usado.';
  }
  if (subtotalCents < coupon.minOrderCents) {
    return 'O valor da compra não atinge o mínimo deste cupom.';
  }
  return null;
}

// Rules in docs/ARCHITECTURE.md, section 7. Discounts round down, in favor of the store.
export function computeTotals(input: {
  subtotalCents: number;
  coupon: Pick<CouponRule, 'type' | 'value'> | null;
  shippingCents: number;
  pixDiscountPercent: number;
}) {
  const { subtotalCents, coupon, shippingCents, pixDiscountPercent } = input;
  const discountCents = !coupon
    ? 0
    : coupon.type === 'percent'
      ? Math.floor((subtotalCents * coupon.value) / 100)
      : coupon.type === 'fixed'
        ? Math.min(coupon.value, subtotalCents)
        : 0;
  const merchandiseCents = subtotalCents - discountCents;
  const pixDiscountCents = Math.floor((merchandiseCents * pixDiscountPercent) / 100);
  return {
    discountCents,
    merchandiseCents,
    pixDiscountCents,
    totalCents: merchandiseCents - pixDiscountCents + shippingCents,
  };
}

export function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    );
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export const checkoutSchema = z.object({
  checkoutKey: z.uuid(),
  customer: z.object({
    name: z.string().trim().min(3, 'Informe seu nome completo').max(120),
    email: z.email('Informe um e-mail válido').max(200),
    cpf: z.string().transform(digitsOnly).refine(isValidCpf, 'Confira o CPF'),
    phone: z
      .string()
      .transform(digitsOnly)
      .pipe(z.string().regex(/^\d{10,11}$/, 'Confira o telefone com DDD')),
  }),
  address: z.object({
    postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'Informe um CEP com 8 dígitos'),
    street: z.string().trim().min(2, 'Informe a rua').max(160),
    number: z.string().trim().min(1, 'Informe o número').max(20),
    complement: z.string().trim().max(80).optional(),
    district: z.string().trim().min(2, 'Informe o bairro').max(80),
    city: z.string().trim().min(2, 'Informe a cidade').max(80),
    state: z.string().trim().length(2, 'Informe a UF').toUpperCase(),
  }),
  shippingOptionId: z.string().min(1, 'Escolha uma opção de frete').max(60),
  notes: z.string().trim().max(500).optional(),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;

export const addCartItemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(10).default(1),
});
export const updateCartItemSchema = z.object({ quantity: z.number().int().min(1).max(10) });
export const applyCouponSchema = z.object({ code: z.string().trim().min(1).max(40) });

export type CartView = {
  items: {
    id: string;
    variantId: string;
    productName: string;
    slug: string;
    variantLabel: string;
    unitPriceCents: number;
    quantity: number;
    lineCents: number;
    imageKey: string | null;
    imageAlt: string;
    available: boolean;
  }[];
  subtotalCents: number;
  discountCents: number;
  merchandiseCents: number;
  coupon: { code: string; type: CouponRule['type'] } | null;
  couponProblem: string | null;
  freeShippingThresholdCents: number | null;
  pixDiscountPercent: number;
  maxInstallments: number;
  minInstallmentCents: number;
};

export type CheckoutResult = { orderNumber: number; accessToken: string };

export type OrderView = {
  number: number;
  status: string;
  createdAt: string;
  reservationExpiresAt: string | null;
  subtotalCents: number;
  discountCents: number;
  pixDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  couponCode: string | null;
  shippingMethod: { label: string; minDays: number; maxDays: number };
  shippingAddress: Omit<CheckoutData['address'], 'postalCode'> & { postalCode: string };
  items: {
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPriceCents: number;
    imageKey: string | null;
  }[];
};
