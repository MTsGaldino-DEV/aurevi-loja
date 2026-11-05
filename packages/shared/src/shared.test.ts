import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sizeChartSchema } from './catalog.ts';
import { settingsSchemas } from './settings.ts';

test('size chart needs one value per column', () => {
  const columns = ['Busto', 'Cintura'];
  const parse = (values: number[]) =>
    sizeChartSchema.safeParse({ columns, rows: [{ size: 'P', values }] }).success;
  assert.equal(parse([88, 70]), true);
  assert.equal(parse([88]), false);
});

test('free shipping can be switched off with null', () => {
  assert.equal(settingsSchemas.free_shipping_threshold_cents.safeParse(null).success, true);
  assert.equal(settingsSchemas.free_shipping_threshold_cents.safeParse(0).success, false);
});
