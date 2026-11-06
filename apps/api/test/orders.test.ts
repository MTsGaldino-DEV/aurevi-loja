// Integration tests against real Postgres, because the guarantees live in SQL and transactions.
import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

process.env['ORDER_TOKEN_SECRET'] = 'test-secret-test-secret-test-secret';
process.env['MP_ACCESS_TOKEN'] = 'unused-in-tests';
process.loadEnvFile('.env');
delete process.env['MELHOR_ENVIO_CLIENT_ID'];
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { OrdersService } = await import('../src/orders/orders.service.js');
const { StockService } = await import('../src/orders/stock.service.js');
const { ShippingService } = await import('../src/shipping/shipping.service.js');
const { MelhorEnvioService } = await import('../src/shipping/melhor-envio.service.js');
const { SettingsService } = await import('../src/settings/settings.service.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const asService = prisma as unknown as PrismaService;
const orders = new OrdersService(
  asService,
  new StockService(),
  new ShippingService(new SettingsService(asService), asService, new MelhorEnvioService(asService)),
  new SettingsService(asService),
);

let variantId: string;
const CART_A = 'cart-a';
const CART_B = 'cart-b';

const input = (overrides: { shippingOptionId?: string } = {}) => ({
  checkoutKey: randomUUID(),
  customer: {
    name: 'Pessoa Teste',
    email: 'a@example.com',
    cpf: '12345678909',
    phone: '31999999999',
  },
  address: {
    postalCode: '30130-010',
    street: 'Rua',
    number: '1',
    district: 'Centro',
    city: 'Belo Horizonte',
    state: 'MG',
  },
  shippingOptionId: 'flat-MG',
  ...overrides,
});

const addCart = (token: string, quantity = 1, couponId?: string) =>
  prisma.cart.create({
    data: {
      token,
      couponId: couponId ?? null,
      expiresAt: new Date(Date.now() + 60_000),
      items: { create: { variantId, quantity } },
    },
  });

const stock = async () => {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  return { onHand: v.stockOnHand, reserved: v.stockReserved };
};
const orderByNumber = (number: number) =>
  prisma.order.findUniqueOrThrow({ where: { number }, select: { id: true, status: true } });

before(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE settings, coupons, carts, stock_movements, order_items, orders, customers, product_variants, products, categories CASCADE',
  );
  for (const [key, value] of Object.entries({
    free_shipping_threshold_cents: null,
    flat_shipping_by_uf: { MG: { label: 'Frete MG', cents: 990, minDays: 1, maxDays: 2 } },
    shipping_origin: { postalCode: '35045120' },
    pix_discount_percent: 10,
    max_interest_free_installments: 5,
    min_installment_cents: 3000,
  })) {
    await prisma.setting.create({ data: { key, value: value ?? ('null' as never) } });
  }
  await prisma.$executeRaw`UPDATE settings SET value = 'null'::jsonb WHERE key = 'free_shipping_threshold_cents'`;
  const category = await prisma.category.create({ data: { name: 'C', slug: 'c' } });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Vestido',
      slug: 'vestido',
      description: 'd',
      status: 'active',
      priceCents: 10000,
      weightGrams: 300,
      widthCm: 20,
      heightCm: 5,
      lengthCm: 30,
    },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: 'V-1', stockOnHand: 1 },
  });
  variantId = variant.id;
});

after(() => prisma.$disconnect());

test('prices come from the database and the total matches', async () => {
  await addCart(CART_A);
  const { orderNumber } = await orders.createFromCart(CART_A, input());
  const order = await prisma.order.findUniqueOrThrow({ where: { number: orderNumber } });
  assert.equal(order.subtotalCents, 10000);
  assert.equal(order.shippingCents, 990);
  assert.equal(order.totalCents, 10990);
  assert.deepEqual(await stock(), { onHand: 1, reserved: 1 });
  assert.equal(await prisma.cart.count({ where: { token: CART_A } }), 0);
});

test('two buyers racing for the last unit: exactly one order is created', async () => {
  await addCart(CART_A);
  await addCart(CART_B);
  const results = await Promise.allSettled([
    orders.createFromCart(CART_A, input()),
    orders.createFromCart(CART_B, input()),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(await stock(), { onHand: 1, reserved: 1 });
  assert.equal(await prisma.order.count(), 1);
  assert.equal(await prisma.stockMovement.count({ where: { type: 'reserve' } }), 1);
  // The loser keeps the bag, because the failed transaction rolled back.
  assert.equal(await prisma.cart.count(), 1);
});

test('retrying the same submit returns the same order and link', async () => {
  await addCart(CART_A);
  const same = input();
  const first = await orders.createFromCart(CART_A, same);
  const second = await orders.createFromCart(CART_A, same);
  assert.deepEqual(first, second);
  assert.equal(await prisma.order.count(), 1);
  assert.equal((await orders.viewByToken(first.accessToken)).number, first.orderNumber);
});

test('wrong token does not open an order', async () => {
  await addCart(CART_A);
  await orders.createFromCart(CART_A, input());
  await assert.rejects(() => orders.viewByToken('wrong'), /não encontrado/);
});

test('unknown shipping option is rejected and nothing is reserved', async () => {
  await addCart(CART_A);
  await assert.rejects(
    () => orders.createFromCart(CART_A, input({ shippingOptionId: 'flat-SP' })),
    /frete mudou/,
  );
  assert.deepEqual(await stock(), { onHand: 1, reserved: 0 });
});

test('paying twice commits the sale once', async () => {
  await addCart(CART_A);
  const { orderNumber } = await orders.createFromCart(CART_A, input());
  const { id } = await orderByNumber(orderNumber);
  const results = await Promise.all([orders.markPaid(id), orders.markPaid(id)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await stock(), { onHand: 0, reserved: 0 });
  assert.equal(await prisma.stockMovement.count({ where: { type: 'sale' } }), 1);
});

test('canceling twice releases once and returns the coupon use', async () => {
  const coupon = await prisma.coupon.create({
    data: { code: 'DEZ', type: 'percent', value: 10, maxUses: 1 },
  });
  await addCart(CART_A, 1, coupon.id);
  const { orderNumber } = await orders.createFromCart(CART_A, input());
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount, 1);
  const { id } = await orderByNumber(orderNumber);
  const results = await Promise.all([orders.cancelPending(id), orders.cancelPending(id)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(await stock(), { onHand: 1, reserved: 0 });
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usesCount, 0);
});

test('a canceled order cannot be marked paid, and a paid order is not canceled', async () => {
  await addCart(CART_A);
  const { orderNumber } = await orders.createFromCart(CART_A, input());
  const { id } = await orderByNumber(orderNumber);
  assert.equal(await orders.markPaid(id), true);
  assert.equal(await orders.cancelPending(id), false);
  assert.equal((await orderByNumber(orderNumber)).status, 'paid');
});

test('coupon with one use left cannot be used twice in a race', async () => {
  const coupon = await prisma.coupon.create({
    data: { code: 'UM', type: 'percent', value: 10, maxUses: 1 },
  });
  await prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 5 } });
  await addCart(CART_A, 1, coupon.id);
  await addCart(CART_B, 1, coupon.id);
  const results = await Promise.allSettled([
    orders.createFromCart(CART_A, input()),
    orders.createFromCart(CART_B, input()),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(await stock(), { onHand: 5, reserved: 1 });
});

test('expired reservations are released; valid ones stay', async () => {
  await prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 2 } });
  await addCart(CART_A);
  await addCart(CART_B);
  const expired = await orders.createFromCart(CART_A, input());
  await orders.createFromCart(CART_B, input());
  await prisma.order.update({
    where: { number: expired.orderNumber },
    data: { reservationExpiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(await orders.cancelExpired(), 1);
  assert.equal((await orderByNumber(expired.orderNumber)).status, 'canceled');
  assert.deepEqual(await stock(), { onHand: 2, reserved: 1 });
  assert.equal(await orders.cancelExpired(), 0);
});
