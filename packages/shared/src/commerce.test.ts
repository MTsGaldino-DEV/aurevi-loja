import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyFreeShipping,
  formatBRL,
  installmentPlan,
  pixPriceCents,
  ufFromPostalCode,
} from './commerce.ts';

const onlyDigitsAndComma = (text: string) => text.replace(/[^\d,.]/g, '');

test('formatBRL uses Brazilian separators', () => {
  assert.equal(onlyDigitsAndComma(formatBRL(123456)), '1.234,56');
});

test('pix price rounds the discount down, in favor of the store', () => {
  assert.equal(pixPriceCents(10000, 5), 9500);
  assert.equal(pixPriceCents(999, 5), 950);
  assert.equal(pixPriceCents(10000, 0), 10000);
});

test('installments respect both the maximum and the minimum value', () => {
  const rules = { maxInstallments: 5, minInstallmentCents: 3000 };
  assert.deepEqual(installmentPlan(50000, rules), { count: 5, valueCents: 10000 });
  assert.deepEqual(installmentPlan(9000, rules), { count: 3, valueCents: 3000 });
  assert.deepEqual(installmentPlan(10000, rules), { count: 3, valueCents: 3334 });
  assert.deepEqual(installmentPlan(1000, rules), { count: 1, valueCents: 1000 });
});

test('postal code resolves to a state', () => {
  assert.equal(ufFromPostalCode('01001-000'), 'SP');
  assert.equal(ufFromPostalCode('30130010'), 'MG');
  assert.equal(ufFromPostalCode('70040010'), 'DF');
  assert.equal(ufFromPostalCode('72800000'), 'GO');
  assert.equal(ufFromPostalCode('69900000'), 'AC');
  assert.equal(ufFromPostalCode('99999999'), 'RS');
  assert.equal(ufFromPostalCode('1234'), null);
  assert.equal(ufFromPostalCode('00000000'), null);
});

test('free shipping zeroes only the cheapest option, and only at the threshold', () => {
  const options = [
    { id: 'a', cents: 2000 },
    { id: 'b', cents: 1000 },
  ];
  assert.deepEqual(applyFreeShipping(options, 29999, 30000), options);
  assert.deepEqual(applyFreeShipping(options, 30000, null), options);
  assert.deepEqual(applyFreeShipping(options, 30000, 30000), [
    { id: 'a', cents: 2000 },
    { id: 'b', cents: 0 },
  ]);
});
