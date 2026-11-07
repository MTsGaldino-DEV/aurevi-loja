// Integration tests against real Postgres: the sums and the stock comparison live in SQL.
import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

process.loadEnvFile('.env');
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { DashboardService, salesPeriods } = await import('../src/admin/dashboard.service.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const dashboard = new DashboardService(prisma as unknown as PrismaService);

let customerId: string;
let productId: string;

// Monday 2026-11-09 12:00 in Sao Paulo (15:00Z): week = 11-09 03:00Z.., month = 11-01 03:00Z..
const NOW = new Date('2026-11-09T15:00:00Z');

const addOrder = (status: string, totalCents: number, paidAt: string | null) =>
  prisma.order.create({
    data: {
      customerId,
      status: status as never,
      subtotalCents: totalCents,
      shippingCents: 0,
      totalCents,
      customerSnapshot: {},
      shippingAddress: {},
      shippingMethod: {},
      checkoutKey: randomUUID(),
      accessTokenHash: randomUUID(),
      paidAt: paidAt ? new Date(paidAt) : null,
    },
  });

let skuSeq = 0;
const addVariant = (stockOnHand: number, stockReserved: number, isActive = true) =>
  prisma.productVariant.create({
    data: { productId, sku: `S-${++skuSeq}`, stockOnHand, stockReserved, isActive },
  });

before(() => prisma.$connect());

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE order_items, orders, customers, product_variants, products, categories CASCADE',
  );
  customerId = (await prisma.customer.create({ data: { email: 'c@example.com', name: 'C' } })).id;
  const category = await prisma.category.create({ data: { name: 'C', slug: 'c' } });
  productId = (
    await prisma.product.create({
      data: {
        categoryId: category.id,
        name: 'Vestido',
        slug: 'vestido',
        description: 'd',
        priceCents: 10000,
        weightGrams: 300,
        widthCm: 20,
        heightCm: 5,
        lengthCm: 30,
      },
    })
  ).id;
});

after(() => prisma.$disconnect());

test('salesPeriods: Sunday night in Sao Paulo still belongs to the week that started on Monday', () => {
  const sunday = salesPeriods(new Date('2026-11-09T01:30:00Z'));
  assert.equal(sunday.weekStart.toISOString(), '2026-11-02T03:00:00.000Z');
  assert.equal(sunday.monthStart.toISOString(), '2026-11-01T03:00:00.000Z');
});

test('salesPeriods: Monday 00:00 in Sao Paulo starts a new week', () => {
  const monday = salesPeriods(new Date('2026-11-09T03:00:00Z'));
  assert.equal(monday.weekStart.toISOString(), '2026-11-09T03:00:00.000Z');
  assert.equal(monday.monthStart.toISOString(), '2026-11-01T03:00:00.000Z');
});

test('sales sum only paid, preparing, shipped and delivered, by paidAt', async () => {
  await addOrder('paid', 1000, '2026-11-09T10:00:00Z'); // this week
  await addOrder('shipped', 2000, '2026-11-09T11:00:00Z'); // this week
  await addOrder('delivered', 4000, '2026-11-03T12:00:00Z'); // last week, this month
  await addOrder('preparing', 8000, '2026-10-20T12:00:00Z'); // last month
  await addOrder('canceled', 16000, '2026-11-09T10:00:00Z');
  await addOrder('refunded', 32000, '2026-11-09T10:00:00Z');
  await addOrder('pending_payment', 64000, null);

  const result = await dashboard.get(NOW);
  assert.equal(result.weekCents, 3000);
  assert.equal(result.monthCents, 7000);
  assert.equal(result.totalCents, 15000);
});

test('counts: to ship = paid + preparing, pending payment', async () => {
  await addOrder('paid', 1000, '2026-11-09T10:00:00Z');
  await addOrder('preparing', 1000, '2026-11-09T10:00:00Z');
  await addOrder('shipped', 1000, '2026-11-09T10:00:00Z');
  await addOrder('pending_payment', 1000, null);
  await addOrder('pending_payment', 1000, null);

  const result = await dashboard.get(NOW);
  assert.equal(result.toShipCount, 2);
  assert.equal(result.pendingPaymentCount, 2);
});

test('low stock: available <= 2 on active variants only', async () => {
  await addVariant(5, 3); // 2 available: low
  await addVariant(5, 2); // 3 available: ok
  await addVariant(0, 0); // 0 available: low
  await addVariant(1, 0, false); // inactive: ignored

  assert.equal((await dashboard.get(NOW)).lowStockCount, 2);
});
