// Integration tests against real Postgres: filters, search escaping and conditional transitions.
import { PrismaPg } from '@prisma/adapter-pg';
import { BadRequestException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

process.loadEnvFile('.env');
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { AdminOrdersService } = await import('../src/admin/admin-orders.service.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const orders = new AdminOrdersService(prisma as unknown as PrismaService);

let customerId: string;

const addCustomer = (name: string, email: string) =>
  prisma.customer.create({ data: { name, email, cpf: '12345678901', phone: '11999999999' } });

const addOrder = (status: string, createdAt?: string, cId = customerId) =>
  prisma.order.create({
    data: {
      customerId: cId,
      status: status as never,
      subtotalCents: 10000,
      shippingCents: 0,
      totalCents: 10000,
      customerSnapshot: { cpf: '12345678901' },
      shippingAddress: { street: 'Rua X' },
      shippingMethod: { label: 'PAC', minDays: 3, maxDays: 5 },
      checkoutKey: randomUUID(),
      accessTokenHash: randomUUID(),
      ...(createdAt && { createdAt: new Date(createdAt) }),
    },
  });

before(() => prisma.$connect());

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE payments, shipments, order_items, orders, customers, product_variants, products, categories, admin_sessions, admin_users CASCADE',
  );
  customerId = (await addCustomer('Maria Souza', 'maria@example.com')).id;
});

after(() => prisma.$disconnect());

test('list filters by status', async () => {
  await addOrder('paid');
  await addOrder('pending_payment');
  const res = await orders.list({ status: 'paid', page: 1 });
  assert.equal(res.total, 1);
  assert.equal(res.items[0]?.status, 'paid');
});

test('list status to_ship matches paid and preparing only', async () => {
  const a = await addOrder('paid');
  const b = await addOrder('preparing');
  await addOrder('pending_payment');
  await addOrder('shipped');
  const res = await orders.list({ status: 'to_ship', page: 1 });
  assert.deepEqual(res.items.map((i) => i.number).sort(), [a.number, b.number].sort());
  assert.equal(res.total, 2);
});

test('list filters by date range in Sao Paulo days, inclusive of the last day', async () => {
  await addOrder('paid', '2026-11-01T02:59:59Z'); // 10-31 23:59 in SP: out
  const a = await addOrder('paid', '2026-11-01T03:00:00Z'); // 11-01 00:00 in SP: in
  const b = await addOrder('paid', '2026-11-03T02:59:59Z'); // 11-02 23:59 in SP: in
  await addOrder('paid', '2026-11-03T03:00:00Z'); // 11-03 00:00 in SP: out
  const res = await orders.list({ from: '2026-11-01', to: '2026-11-02', page: 1 });
  assert.deepEqual(res.items.map((i) => i.number).sort(), [a.number, b.number].sort());
  const onlyFrom = await orders.list({ from: '2026-11-03', page: 1 });
  assert.equal(onlyFrom.total, 1);
});

test('list rejects impossible dates and from after to with a 400', async () => {
  await assert.rejects(orders.list({ from: '2026-13-45', page: 1 }), BadRequestException);
  await assert.rejects(orders.list({ to: '2026-02-30', page: 1 }), BadRequestException);
  await assert.rejects(
    orders.list({ from: '2026-11-05', to: '2026-11-04', page: 1 }),
    BadRequestException,
  );
});

test('list searches by exact number, customer name and e-mail', async () => {
  const other = await addCustomer('Joana Lima', 'joana@example.com');
  const mine = await addOrder('paid');
  await addOrder('paid', undefined, other.id);

  const byNumber = await orders.list({ q: String(mine.number), page: 1 });
  assert.deepEqual(byNumber.items.map((i) => i.number), [mine.number]);
  assert.equal((await orders.list({ q: String(mine.number).slice(0, -1), page: 1 })).total, 0);

  const byName = await orders.list({ q: 'MARIA sou', page: 1 });
  assert.equal(byName.total, 1);
  assert.equal(byName.items[0]?.customerName, 'Maria Souza');

  const byEmail = await orders.list({ q: 'JOANA@', page: 1 });
  assert.equal(byEmail.total, 1);
  assert.equal(byEmail.items[0]?.customerName, 'Joana Lima');
});

test('list q treats % and _ literally', async () => {
  await addOrder('paid');
  assert.equal((await orders.list({ q: '%', page: 1 })).total, 0);
  assert.equal((await orders.list({ q: '_', page: 1 })).total, 0);
  assert.equal((await orders.list({ q: 'M_ria', page: 1 })).total, 0);
  assert.equal((await orders.list({ q: 'Maria%', page: 1 })).total, 0);
  const pct = await addCustomer('100% Algodao', 'pct@example.com');
  await addOrder('paid', undefined, pct.id);
  assert.equal((await orders.list({ q: '100%', page: 1 })).total, 1);
});

test('list paginates 20 per page, newest first, and a far page is empty with the real total', async () => {
  for (let i = 0; i < 21; i++) await addOrder('paid', new Date(Date.UTC(2026, 10, 1, 12, i)).toISOString());
  const p1 = await orders.list({ page: 1 });
  assert.equal(p1.items.length, 20);
  assert.equal(p1.pageSize, 20);
  assert.equal(p1.total, 21);
  const p2 = await orders.list({ page: 2 });
  assert.equal(p2.items.length, 1);
  assert.ok(p1.items[0]!.createdAt > p1.items[19]!.createdAt);
  assert.ok(p1.items[19]!.createdAt > p2.items[0]!.createdAt);
  const far = await orders.list({ page: 99 });
  assert.deepEqual(far.items, []);
  assert.equal(far.total, 21);
  assert.equal(far.page, 99);
});

test('list items expose only the allowed keys', async () => {
  await addOrder('paid');
  const [item] = (await orders.list({ page: 1 })).items;
  assert.deepEqual(Object.keys(item!).sort(), [
    'createdAt',
    'customerName',
    'number',
    'paidAt',
    'status',
    'totalCents',
  ]);
  assert.ok(!JSON.stringify(item).includes('12345678901'));
});

test('detail returns the order with items and payments, and null for unknown', async () => {
  const o = await addOrder('paid');
  await prisma.orderItem.create({
    data: {
      orderId: o.id,
      productName: 'Vestido',
      variantLabel: 'P',
      sku: 'V-P',
      unitPriceCents: 10000,
      quantity: 1,
    },
  });
  await prisma.payment.create({
    data: {
      orderId: o.id,
      method: 'pix',
      status: 'approved',
      amountCents: 10000,
      idempotencyKey: randomUUID(),
    },
  });
  const d = await orders.detail(o.number);
  assert.equal(d?.number, o.number);
  assert.equal(d?.items[0]?.sku, 'V-P');
  assert.equal(d?.payments[0]?.status, 'approved');
  assert.equal(d?.shipment, null);
  assert.equal(await orders.detail(999999), null);
});

test('changeStatus walks paid -> preparing -> shipped -> delivered and records the Shipment', async () => {
  const o = await addOrder('paid');
  assert.equal(await orders.changeStatus(o.number, { status: 'preparing' }), 'ok');
  assert.equal(
    await orders.changeStatus(o.number, { status: 'shipped', carrier: 'Correios', trackingCode: 'AB123' }),
    'ok',
  );
  let d = await orders.detail(o.number);
  assert.equal(d?.status, 'shipped');
  assert.equal(d?.shipment?.carrier, 'Correios');
  assert.equal(d?.shipment?.trackingCode, 'AB123');
  assert.ok(d?.shipment?.shippedAt);
  assert.equal(d?.shipment?.deliveredAt, null);

  assert.equal(await orders.changeStatus(o.number, { status: 'delivered' }), 'ok');
  d = await orders.detail(o.number);
  assert.equal(d?.status, 'delivered');
  assert.ok(d?.shipment?.deliveredAt);
  assert.equal(await prisma.shipment.count({ where: { orderId: o.id } }), 1);
});

test('changeStatus refuses invalid transitions and unknown orders', async () => {
  const shipped = { status: 'shipped', trackingCode: 'X1' } as const;
  const pending = await addOrder('pending_payment');
  const canceled = await addOrder('canceled');
  const refunded = await addOrder('refunded');
  const paid = await addOrder('paid');
  assert.equal(await orders.changeStatus(pending.number, shipped), 'invalid_transition');
  assert.equal(await orders.changeStatus(canceled.number, shipped), 'invalid_transition');
  assert.equal(await orders.changeStatus(refunded.number, { status: 'delivered' }), 'invalid_transition');
  assert.equal(await orders.changeStatus(paid.number, { status: 'delivered' }), 'invalid_transition');
  assert.equal(await orders.changeStatus(424242, { status: 'preparing' }), 'not_found');
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).status, 'paid');
  assert.equal(await prisma.shipment.count(), 0);
});

test('repeating shipped is invalid_transition and keeps the tracking code', async () => {
  const o = await addOrder('paid');
  assert.equal(await orders.changeStatus(o.number, { status: 'shipped', trackingCode: 'FIRST' }), 'ok');
  assert.equal(
    await orders.changeStatus(o.number, { status: 'shipped', trackingCode: 'SECOND' }),
    'invalid_transition',
  );
  const d = await orders.detail(o.number);
  assert.equal(d?.shipment?.trackingCode, 'FIRST');
  assert.equal(await prisma.shipment.count({ where: { orderId: o.id } }), 1);
});
