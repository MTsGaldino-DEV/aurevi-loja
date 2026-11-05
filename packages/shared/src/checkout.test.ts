import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTotals, couponProblem, isValidCpf, type CouponRule } from './checkout.ts';

const coupon = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  type: 'percent',
  value: 10,
  minOrderCents: 0,
  startsAt: null,
  expiresAt: null,
  maxUses: null,
  usesCount: 0,
  isActive: true,
  ...overrides,
});
const now = new Date('2026-11-05T12:00:00Z');

test('percent coupon rounds the discount down', () => {
  const totals = computeTotals({
    subtotalCents: 999,
    coupon: coupon(),
    shippingCents: 0,
    pixDiscountPercent: 0,
  });
  assert.equal(totals.discountCents, 99);
  assert.equal(totals.totalCents, 900);
});

test('fixed coupon cannot exceed the subtotal', () => {
  const totals = computeTotals({
    subtotalCents: 500,
    coupon: coupon({ type: 'fixed', value: 900 }),
    shippingCents: 1000,
    pixDiscountPercent: 0,
  });
  assert.equal(totals.discountCents, 500);
  assert.equal(totals.totalCents, 1000);
});

test('pix discount applies after the coupon and never to shipping', () => {
  const totals = computeTotals({
    subtotalCents: 10000,
    coupon: coupon(),
    shippingCents: 2000,
    pixDiscountPercent: 5,
  });
  assert.equal(totals.discountCents, 1000);
  assert.equal(totals.pixDiscountCents, 450);
  assert.equal(totals.totalCents, 10550);
});

test('free shipping coupon gives no discount on products', () => {
  const totals = computeTotals({
    subtotalCents: 10000,
    coupon: coupon({ type: 'free_shipping', value: 0 }),
    shippingCents: 0,
    pixDiscountPercent: 0,
  });
  assert.equal(totals.discountCents, 0);
  assert.equal(totals.totalCents, 10000);
});

test('coupon rules', () => {
  assert.equal(couponProblem(coupon(), 1000, now), null);
  assert.ok(couponProblem(coupon({ isActive: false }), 1000, now));
  assert.ok(couponProblem(coupon({ minOrderCents: 2000 }), 1000, now));
  assert.ok(couponProblem(coupon({ expiresAt: new Date('2026-11-05T11:59:59Z') }), 1000, now));
  assert.ok(couponProblem(coupon({ startsAt: new Date('2026-11-06T00:00:00Z') }), 1000, now));
  assert.ok(couponProblem(coupon({ maxUses: 1, usesCount: 1 }), 1000, now));
  assert.equal(couponProblem(coupon({ maxUses: 2, usesCount: 1 }), 1000, now), null);
});

test('CPF check digits', () => {
  assert.equal(isValidCpf('123.456.789-09'), true);
  assert.equal(isValidCpf('12345678900'), false);
  assert.equal(isValidCpf('11111111111'), false);
  assert.equal(isValidCpf('123'), false);
});
