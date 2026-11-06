// Payment rules against real Postgres. Only the Mercado Pago client is replaced.
import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { ProviderPayment } from '../src/payments/mercadopago.gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const SECRET = 'webhook-secret-for-tests';
process.env['ORDER_TOKEN_SECRET'] = 'test-secret-test-secret-test-secret';
process.env['MP_ACCESS_TOKEN'] = 'unused-in-tests';
process.env['MP_WEBHOOK_SECRET'] = SECRET;
process.loadEnvFile('.env');
delete process.env['MELHOR_ENVIO_CLIENT_ID'];
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { OrdersService } = await import('../src/orders/orders.service.js');
const { StockService } = await import('../src/orders/stock.service.js');
const { ShippingService } = await import('../src/shipping/shipping.service.js');
const { MelhorEnvioService } = await import('../src/shipping/melhor-envio.service.js');
const { SettingsService } = await import('../src/settings/settings.service.js');
const { PaymentsService } = await import('../src/payments/payments.service.js');
const { MercadoPagoGateway } = await import('../src/payments/mercadopago.gateway.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const asService = prisma as unknown as PrismaService;
const settings = new SettingsService(asService);
const orders = new OrdersService(
  asService,
  new StockService(),
  new ShippingService(settings, asService, new MelhorEnvioService(asService)),
  settings,
);

// Stands in for Mercado Pago: remembers payments, so a webhook can fetch the current state.
const remote = new Map<string, ProviderPayment>();
let nextStatus: { status: string; status_detail: string } = {
  status: 'approved',
  status_detail: 'accredited',
};
let createCalls: { body: Record<string, unknown>; key: string }[] = [];
let failCreateWith: Error | null = null;
const canceled: string[] = [];
let nextId = 1000;

class FakeGateway extends MercadoPagoGateway {
  override async create(body: never, key: string) {
    createCalls.push({ body, key });
    if (failCreateWith) throw failCreateWith;
    const request = body as {
      transaction_amount: number;
      external_reference: string;
      installments?: number;
      payment_method_id: string;
      date_of_expiration?: string;
    };
    const isPix = request.payment_method_id === 'pix';
    const payment: ProviderPayment = {
      id: nextId++,
      transaction_amount: request.transaction_amount,
      external_reference: request.external_reference,
      installments: request.installments ?? 1,
      ...(isPix
        ? {
            status: 'pending',
            status_detail: 'pending_waiting_transfer',
            date_of_expiration: request.date_of_expiration,
            point_of_interaction: {
              transaction_data: { qr_code: 'pix-code', qr_code_base64: 'cXI=' },
            },
          }
        : nextStatus),
    };
    remote.set(String(payment.id), payment);
    return payment;
  }
  override async get(id: string) {
    const payment = remote.get(id);
    if (!payment) throw new Error('not found');
    return payment;
  }
  override async cancel(id: string) {
    canceled.push(id);
    const payment = { ...remote.get(id), status: 'cancelled', status_detail: 'by_collector' };
    remote.set(id, payment);
    return payment;
  }
}

const payments = new PaymentsService(asService, settings, orders, new FakeGateway());

const CARD = {
  method: 'credit_card' as const,
  token: 'card-token',
  paymentMethodId: 'visa',
  installments: 1,
  payer: { email: 'a@example.com', identification: { type: 'CPF', number: '12345678909' } },
};
const PIX = { method: 'pix' as const };

let variantId: string;

async function newOrder() {
  await prisma.cart.create({
    data: {
      token: 'cart',
      expiresAt: new Date(Date.now() + 60_000),
      items: { create: { variantId, quantity: 1 } },
    },
  });
  return orders.createFromCart('cart', {
    checkoutKey: randomUUID(),
    customer: {
      name: 'Pessoa de Teste',
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
  });
}

const order = (number: number) => prisma.order.findUniqueOrThrow({ where: { number } });
const stock = async () => {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  return { onHand: v.stockOnHand, reserved: v.stockReserved };
};

function signed(paymentId: string, notificationId: string = randomUUID()) {
  const requestId = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', SECRET)
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return {
    signature: `ts=${ts},v1=${v1}`,
    requestId,
    dataId: paymentId,
    body: { id: notificationId, type: 'payment', action: 'payment.updated' },
  };
}

async function deliver(paymentId: string, notificationId?: string) {
  const eventId = await payments.receiveWebhook(signed(paymentId, notificationId));
  if (eventId) await payments.processEvent(eventId);
  return eventId;
}

before(() => prisma.$connect());

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE webhook_events, payments, settings, coupons, carts, stock_movements, order_items, orders, customers, product_variants, products, categories CASCADE',
  );
  remote.clear();
  createCalls = [];
  canceled.length = 0;
  failCreateWith = null;
  nextStatus = { status: 'approved', status_detail: 'accredited' };
  for (const [key, value] of Object.entries({
    flat_shipping_by_uf: { MG: { label: 'Frete MG', cents: 990, minDays: 1, maxDays: 2 } },
    shipping_origin: { postalCode: '35045120' },
    pix_discount_percent: 10,
    max_interest_free_installments: 5,
    min_installment_cents: 3000,
  })) {
    await prisma.setting.create({ data: { key, value } });
  }
  await prisma.$executeRaw`INSERT INTO settings (id, key, value, updated_at)
    VALUES (gen_random_uuid(), 'free_shipping_threshold_cents', 'null'::jsonb, now())`;
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

test('approved card pays the full price and takes the piece out of stock', async () => {
  const { orderNumber, accessToken } = await newOrder();
  const view = await payments.pay(accessToken, CARD);
  assert.equal(view.status, 'paid');
  assert.equal(createCalls[0]?.body['transaction_amount'], 109.9);
  assert.deepEqual(await stock(), { onHand: 0, reserved: 0 });
  assert.equal((await order(orderNumber)).pixDiscountCents, 0);
});

test('declined card keeps the order open and the next attempt uses a new key', async () => {
  const { orderNumber, accessToken } = await newOrder();
  nextStatus = { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' };
  const declined = await payments.pay(accessToken, CARD);
  assert.equal(declined.status, 'pending_payment');
  assert.match(declined.payment?.message ?? '', /saldo/);
  assert.deepEqual(await stock(), { onHand: 1, reserved: 1 });

  nextStatus = { status: 'approved', status_detail: 'accredited' };
  await payments.pay(accessToken, CARD);
  assert.equal((await order(orderNumber)).status, 'paid');
  assert.notEqual(createCalls[0]?.key, createCalls[1]?.key);
});

test('Pix discount comes from the server and applies to merchandise only', async () => {
  const { orderNumber, accessToken } = await newOrder();
  const view = await payments.pay(accessToken, PIX);
  // 100,00 less 10% plus 9,90 of shipping.
  assert.equal(createCalls[0]?.body['transaction_amount'], 99.9);
  assert.equal(view.totalCents, 9990);
  assert.equal(view.pixDiscountCents, 1000);
  assert.equal(view.payment?.pixQrCode, 'pix-code');
  const row = await order(orderNumber);
  assert.equal(row.totalCents, 9990);
  assert.ok(row.reservationExpiresAt! > new Date(Date.now() + 39 * 60_000));
});

test('asking for Pix twice returns the same QR', async () => {
  const { accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  await payments.pay(accessToken, PIX);
  assert.equal(createCalls.length, 1);
});

test('switching to card cancels the active Pix and restores the card price', async () => {
  const { orderNumber, accessToken } = await newOrder();
  const pix = await payments.pay(accessToken, PIX);
  assert.equal(pix.payment?.method, 'pix');
  await payments.pay(accessToken, CARD);
  assert.equal(canceled.length, 1);
  const row = await order(orderNumber);
  assert.equal(row.status, 'paid');
  assert.equal(row.totalCents, 10990);
  assert.equal(row.pixDiscountCents, 0);
});

test('more installments than the order allows are refused', async () => {
  const { accessToken } = await newOrder();
  // 109,90 with a 30,00 minimum allows 3 installments.
  await assert.rejects(payments.pay(accessToken, { ...CARD, installments: 4 }), /parcelas/);
  assert.equal(createCalls.length, 0);
});

test('a refusal from Mercado Pago is reported and allows another attempt', async () => {
  const { MercadoPagoError } = await import('mercadopago');
  const { accessToken } = await newOrder();
  failCreateWith = new MercadoPagoError({ status: 400, message: 'bad', error: 'bad_request' });
  await assert.rejects(payments.pay(accessToken, CARD), /Confira os dados/);
  failCreateWith = null;
  assert.equal((await payments.pay(accessToken, CARD)).status, 'paid');
});

test('a lost response blocks a second charge for a while', async () => {
  const { accessToken } = await newOrder();
  failCreateWith = new Error('socket hang up');
  await assert.rejects(payments.pay(accessToken, CARD), /Aguarde/);
  failCreateWith = null;
  await assert.rejects(payments.pay(accessToken, CARD), /em andamento/);
  assert.equal(createCalls.length, 1);
});

test('webhook marks a Pix as paid once, however many times it arrives', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const [id] = [...remote.keys()];
  remote.set(id!, { ...remote.get(id!), status: 'approved', status_detail: 'accredited' });

  assert.ok(await deliver(id!, 'n-1'));
  assert.equal(await deliver(id!, 'n-1'), null, 'same notification is ignored');
  assert.ok(await deliver(id!, 'n-2'));
  const row = await order(orderNumber);
  assert.equal(row.status, 'paid');
  assert.equal(row.reviewReason, null);
  assert.deepEqual(await stock(), { onHand: 0, reserved: 0 });
  assert.equal(await prisma.webhookEvent.count({ where: { processedAt: null } }), 0);
});

test('webhook with a bad signature is rejected and stores nothing', async () => {
  const request = signed('123');
  await assert.rejects(payments.receiveWebhook({ ...request, dataId: '999' }), /Invalid signature/);
  await assert.rejects(
    payments.receiveWebhook({ ...request, signature: undefined }),
    /Invalid signature/,
  );
  assert.equal(await prisma.webhookEvent.count(), 0);
});

test('a failed event stays pending and the retry completes it', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const [id] = [...remote.keys()];
  const saved = remote.get(id!)!;
  remote.delete(id!);
  await deliver(id!);
  const event = await prisma.webhookEvent.findFirstOrThrow();
  assert.equal(event.processedAt, null);
  assert.equal(event.error, 'not found');

  remote.set(id!, { ...saved, status: 'approved', status_detail: 'accredited' });
  await payments.processPendingWebhooks();
  assert.equal((await order(orderNumber)).status, 'paid');
});

test('the job leaves an active Pix alone and cancels after it expires', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const { id } = await order(orderNumber);
  await prisma.order.update({
    where: { id },
    data: { reservationExpiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(await orders.cancelExpired(), 0);

  await prisma.payment.updateMany({
    where: { orderId: id },
    data: { pixExpiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await orders.viewByToken(accessToken)).payment?.status, 'expired');
  assert.equal(await orders.cancelExpired(), 1);
  assert.equal((await order(orderNumber)).status, 'canceled');
  assert.deepEqual(await stock(), { onHand: 1, reserved: 0 });
});

test('approval after cancellation sells the piece if it is still there', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const { id } = await order(orderNumber);
  await orders.cancelPending(id);
  const [paymentId] = [...remote.keys()];
  remote.set(paymentId!, {
    ...remote.get(paymentId!),
    status: 'approved',
    status_detail: 'accredited',
  });
  await deliver(paymentId!);
  assert.equal((await order(orderNumber)).status, 'paid');
  assert.deepEqual(await stock(), { onHand: 0, reserved: 0 });
});

test('approval after cancellation without stock asks a person to refund', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const { id } = await order(orderNumber);
  await orders.cancelPending(id);
  await prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 0 } });
  const [paymentId] = [...remote.keys()];
  remote.set(paymentId!, {
    ...remote.get(paymentId!),
    status: 'approved',
    status_detail: 'accredited',
  });
  await deliver(paymentId!);
  const row = await order(orderNumber);
  assert.equal(row.status, 'canceled');
  assert.match(row.reviewReason ?? '', /Reembolsar/);
});

test('an approved amount that differs from the order does not mark it paid', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, PIX);
  const [id] = [...remote.keys()];
  remote.set(id!, {
    ...remote.get(id!),
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 1,
  });
  await deliver(id!);
  const row = await order(orderNumber);
  assert.equal(row.status, 'pending_payment');
  assert.match(row.reviewReason ?? '', /valor diferente/);
});

test('a refund moves a paid order to refunded and keeps stock untouched', async () => {
  const { orderNumber, accessToken } = await newOrder();
  await payments.pay(accessToken, CARD);
  const [id] = [...remote.keys()];
  remote.set(id!, { ...remote.get(id!), status: 'refunded', status_detail: 'refunded' });
  await deliver(id!);
  assert.equal((await order(orderNumber)).status, 'refunded');
  assert.deepEqual(await stock(), { onHand: 0, reserved: 0 });
});
