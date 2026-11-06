import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminLoginSchema,
  adminOrderListQuerySchema,
  adminOrderStatusSchema,
  adminPasswordChangeSchema,
  adminTransitions,
} from './admin.ts';

test('login normalizes the email', () => {
  const parsed = adminLoginSchema.parse({ email: '  Admin@Loja.com ', password: 'x' });
  assert.equal(parsed.email, 'admin@loja.com');
  assert.equal(adminLoginSchema.safeParse({ email: 'nope', password: 'x' }).success, false);
  assert.equal(adminLoginSchema.safeParse({ email: 'a@b.co', password: '' }).success, false);
});

test('new password needs at least 10 characters', () => {
  const base = { currentPassword: 'old' };
  assert.equal(
    adminPasswordChangeSchema.safeParse({ ...base, newPassword: '123456789' }).success,
    false,
  );
  assert.equal(
    adminPasswordChangeSchema.safeParse({ ...base, newPassword: '1234567890' }).success,
    true,
  );
});

test('shipped status requires a tracking code', () => {
  assert.equal(adminOrderStatusSchema.safeParse({ status: 'shipped' }).success, false);
  assert.equal(
    adminOrderStatusSchema.safeParse({ status: 'shipped', trackingCode: 'BR123' }).success,
    true,
  );
  assert.equal(adminOrderStatusSchema.safeParse({ status: 'delivered' }).success, true);
  assert.equal(adminOrderStatusSchema.safeParse({ status: 'canceled' }).success, false);
});

test('order list query defaults page to 1', () => {
  assert.equal(adminOrderListQuerySchema.parse({}).page, 1);
  assert.equal(adminOrderListQuerySchema.parse({ page: '3' }).page, 3);
  assert.equal(adminOrderListQuerySchema.safeParse({ page: '0' }).success, false);
  assert.equal(adminOrderListQuerySchema.safeParse({ from: '05/11/2026' }).success, false);
  assert.equal(adminOrderListQuerySchema.parse({ status: 'paid', q: ' ana ' }).q, 'ana');
});

test('transitions only move an order forward', () => {
  assert.deepEqual(adminTransitions.canceled, []);
  assert.ok(adminTransitions.paid.includes('shipped'));
  assert.deepEqual(adminTransitions.preparing, ['shipped']);
  assert.deepEqual(adminTransitions.shipped, ['delivered']);
});
