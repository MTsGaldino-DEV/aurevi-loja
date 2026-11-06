import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const httpFetch = globalThis.fetch;

process.env['ORDER_TOKEN_SECRET'] = 'test-secret-test-secret-test-secret';
process.env['MP_ACCESS_TOKEN'] = 'unused-in-tests';
process.env['MELHOR_ENVIO_CLIENT_ID'] = '123';
process.env['MELHOR_ENVIO_CLIENT_SECRET'] = 'client-secret-for-tests';
process.env['MELHOR_ENVIO_REDIRECT_URI'] = 'http://localhost:4000/api/health';
process.env['MELHOR_ENVIO_USER_AGENT'] = 'Aurevi (test@example.com)';
process.env['INTEGRATION_ENCRYPTION_KEY'] = 'ab'.repeat(32);
process.env['MELHOR_ENVIO_ENVIRONMENT'] = 'sandbox';
process.loadEnvFile('.env');
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
assert.match(process.env['DATABASE_URL'], /_test/, 'Refusing to run outside a test database');

const { MelhorEnvioService } = await import('../src/shipping/melhor-envio.service.js');
const { ShippingService } = await import('../src/shipping/shipping.service.js');
const { SettingsService } = await import('../src/settings/settings.service.js');
const { OrdersService } = await import('../src/orders/orders.service.js');
const { StockService } = await import('../src/orders/stock.service.js');
const { CartService } = await import('../src/cart/cart.service.js');
const { ShippingRateLimit } = await import('../src/shipping/shipping-rate-limit.js');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});
const asService = prisma as unknown as PrismaService;
const settings = new SettingsService(asService);
let provider: InstanceType<typeof MelhorEnvioService>;
let shipping: InstanceType<typeof ShippingService>;
let variantId: string;
let requests: { url: string; body: Record<string, unknown>; headers: Headers }[];
const quoteResponse = [
  {
    id: 1,
    name: 'PAC',
    company: { name: 'Correios' },
    price: '99.99',
    custom_price: '12.34',
    delivery_range: { min: 20, max: 25 },
    custom_delivery_range: { min: 2, max: 4 },
  },
  { id: 2, name: 'SEDEX', error: 'Serviço indisponível' },
  {
    id: 3,
    name: 'Inválido',
    company: { name: 'C' },
    custom_price: '',
    custom_delivery_range: { min: 1, max: 2 },
  },
];
const tokenResponse = {
  access_token: 'access-for-tests',
  refresh_token: 'refresh-for-tests',
  expires_in: 2592000,
};
const callback = (state = 'state-for-tests') =>
  `http://localhost:4000/api/health?code=code-for-tests&state=${state}`;
const request = () => ({
  postalCode: '30130-010',
  eligibleCents: 20000,
  items: [{ variantId, quantity: 2 }],
});

beforeEach(async () => {
  mock.restoreAll();
  requests = [];
  mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url: String(url), body, headers: new Headers(init?.headers) });
    return Response.json(String(url).endsWith('/oauth/token') ? tokenResponse : quoteResponse);
  });
  await prisma.$executeRawUnsafe(
    'TRUNCATE integration_credentials, settings, carts, stock_movements, orders, customers, product_variants, products, categories CASCADE',
  );
  for (const [key, value] of Object.entries({
    flat_shipping_by_uf: { MG: { label: 'Frete MG', cents: 1990, minDays: 3, maxDays: 5 } },
    shipping_origin: { postalCode: '35045120' },
  }))
    await prisma.setting.create({ data: { key, value } });
  await prisma.$executeRaw`INSERT INTO settings (id, key, value, updated_at) VALUES (gen_random_uuid(), 'free_shipping_threshold_cents', 'null'::jsonb, now())`;
  const category = await prisma.category.create({ data: { name: 'Teste', slug: 'teste' } });
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: 'Peça',
      slug: 'peca',
      description: 'Teste',
      status: 'active',
      priceCents: 10000,
      weightGrams: 400,
      widthCm: 25,
      heightCm: 5,
      lengthCm: 30,
    },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: 'TESTE', priceCents: 7990, stockOnHand: 10 },
  });
  variantId = variant.id;
  provider = new MelhorEnvioService(asService);
  shipping = new ShippingService(settings, asService, provider);
  await provider.connect(callback(), 'state-for-tests');
  requests = [];
});

after(async () => {
  mock.restoreAll();
  await prisma.$disconnect();
});

test('quote uses database dimensions, unit insurance and quantity, and hides unavailable services', async () => {
  const options = await shipping.quote(request());
  assert.deepEqual(options, [
    { id: 'flat-MG', label: 'Frete MG', cents: 1990, minDays: 3, maxDays: 5 },
    { id: 'me-1', label: 'Correios — PAC', cents: 1234, minDays: 2, maxDays: 4 },
  ]);
  assert.equal(requests[0]?.headers.get('Authorization'), 'Bearer access-for-tests');
  assert.equal(requests[0]?.headers.get('User-Agent'), 'Aurevi (test@example.com)');
  assert.deepEqual(requests[0]?.body, {
    from: { postal_code: '35045120' },
    to: { postal_code: '30130010' },
    products: [
      {
        id: variantId,
        width: 25,
        height: 5,
        length: 30,
        weight: 0.4,
        insurance_value: 79.9,
        quantity: 2,
      },
    ],
    options: { receipt: false, own_hand: false },
  });
});

test('free shipping discounts only the cheapest service and does not poison cached prices', async () => {
  const free = await shipping.quote({ ...request(), forceFree: true });
  assert.deepEqual(
    free.map((o) => o.cents),
    [1990, 0],
  );
  assert.deepEqual(
    (await shipping.quote(request())).map((o) => o.cents),
    [1990, 1234],
  );
  assert.equal(requests.length, 1);
});

test('cache varies with quantities and checkout fresh quotes bypass it', async () => {
  await shipping.quote(request());
  await shipping.quote(request());
  assert.equal(requests.length, 1);
  await shipping.quote({ ...request(), items: [{ variantId, quantity: 1 }] });
  assert.equal(requests.length, 2);
  await shipping.quote({ ...request(), fresh: true });
  assert.equal(requests.length, 3);
});

test('provider errors and malformed responses fall back to flat rates', async () => {
  for (const mode of ['network', '429', 'malformed']) {
    mock.method(globalThis, 'fetch', async () => {
      if (mode === 'network') throw new DOMException('Timed out', 'TimeoutError');
      return mode === '429'
        ? new Response('', { status: 429 })
        : Response.json({ unexpected: true });
    });
    assert.deepEqual(
      (await shipping.quote({ ...request(), fresh: true })).map((o) => o.id),
      ['flat-MG'],
    );
  }
});

test('missing authorization keeps flat shipping available without an external request', async () => {
  await prisma.integrationCredential.deleteMany();
  assert.deepEqual(
    (await shipping.quote(request())).map((o) => o.id),
    ['flat-MG'],
  );
  assert.equal(requests.length, 0);
});

test('OAuth requests only shipping-calculate, checks state and stores authenticated ciphertext', async () => {
  const auth = new URL(provider.authorizationUrl('state-for-tests'));
  assert.equal(auth.origin, 'https://sandbox.melhorenvio.com.br');
  assert.equal(auth.searchParams.get('scope'), 'shipping-calculate');
  assert.equal(auth.searchParams.get('state'), 'state-for-tests');
  await assert.rejects(() => provider.connect(callback('wrong'), 'state-for-tests'));
  await assert.rejects(() =>
    provider.connect(callback().replace('localhost:4000', 'evil.example'), 'state-for-tests'),
  );
  assert.equal(requests.length, 0);
  const credential = await prisma.integrationCredential.findFirstOrThrow();
  assert.equal(credential.provider, 'melhor_envio:sandbox');
  assert.ok(!credential.accessTokenEnc.includes(tokenResponse.access_token));
  assert.ok(!credential.refreshTokenEnc.includes(tokenResponse.refresh_token));
  await prisma.integrationCredential.update({
    where: { id: credential.id },
    data: { accessTokenEnc: 'tampered' },
  });
  assert.deepEqual(
    (await shipping.quote(request())).map((o) => o.id),
    ['flat-MG'],
  );
  assert.equal(requests.length, 0);
});

test('expired credentials rotate once for concurrent quotes and survive service restart', async () => {
  await prisma.integrationCredential.updateMany({ data: { expiresAt: new Date(0) } });
  await Promise.all([
    shipping.quote(request()),
    shipping.quote({ ...request(), postalCode: '35045120' }),
  ]);
  const refreshes = requests.filter((r) => r.url.endsWith('/oauth/token'));
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0]?.body.grant_type, 'refresh_token');
  assert.equal(refreshes[0]?.body.refresh_token, 'refresh-for-tests');
  const count = requests.length;
  const restarted = new ShippingService(settings, asService, new MelhorEnvioService(asService));
  await restarted.quote(request());
  assert.equal(requests.length, count + 1);
});

test('unauthorized access refreshes the token once before retrying the quote', async () => {
  let quoteCalls = 0;
  mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).endsWith('/oauth/token')) return Response.json(tokenResponse);
    quoteCalls++;
    return quoteCalls === 1 ? new Response('', { status: 401 }) : Response.json(quoteResponse);
  });
  assert.equal((await shipping.quote(request())).length, 2);
  assert.equal(quoteCalls, 2);
});

test('a delayed credential read cannot reuse a refresh token already rotated by another call', async () => {
  const row = await prisma.integrationCredential.findFirstOrThrow();
  let current = { ...row, expiresAt: new Date(0) };
  const stale = { ...current };
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let readCount = 0;
  const store = {
    integrationCredential: {
      findUnique: async () => {
        if (++readCount === 1) {
          await held;
          return stale;
        }
        return { ...current };
      },
      findUniqueOrThrow: async () => ({ ...current }),
      upsert: async ({ update }: { update: Partial<typeof current> }) => {
        current = { ...current, ...update };
        return current;
      },
    },
  };
  const concurrent = new MelhorEnvioService(store as unknown as PrismaService);
  const first = concurrent.renewCredentials();
  const second = concurrent.renewCredentials();
  await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  await Promise.all([first, second]);
  assert.equal(requests.filter((r) => r.url.endsWith('/oauth/token')).length, 1);
});

test('quote cache expires and evicts old entries instead of growing without a bound', async () => {
  let now = Date.now();
  mock.method(Date, 'now', () => now);
  const products = [
    {
      id: variantId,
      width: 25,
      height: 5,
      length: 30,
      weight: 0.4,
      insurance_value: 79.9,
      quantity: 1,
    },
  ];
  for (let i = 0; i < 201; i++) await provider.quote('35045120', String(30130000 + i), products);
  assert.equal(requests.length, 201);
  await provider.quote('35045120', '30130000', products);
  assert.equal(requests.length, 202);
  await provider.quote('35045120', '30130000', products);
  assert.equal(requests.length, 202);
  now += 60_001;
  await provider.quote('35045120', '30130000', products);
  assert.equal(requests.length, 203);
});

test('cart quotes the real contents and checkout refuses a provider service that disappeared', async () => {
  const cart = new CartService(asService, settings, shipping);
  await prisma.cart.create({
    data: {
      token: 'shipping-cart',
      expiresAt: new Date(Date.now() + 60000),
      items: { create: { variantId, quantity: 2 } },
    },
  });
  for (const [key, value] of Object.entries({
    pix_discount_percent: 5,
    max_interest_free_installments: 5,
    min_installment_cents: 3000,
  })) {
    await prisma.setting.create({ data: { key, value } });
  }
  assert.equal((await cart.quote('shipping-cart', '30130010')).length, 2);
  assert.equal((requests[0]?.body.products as { quantity: number }[])[0]?.quantity, 2);
  mock.method(globalThis, 'fetch', async () => Response.json([]));
  const orders = new OrdersService(asService, new StockService(), shipping, settings);
  await assert.rejects(
    () =>
      orders.createFromCart('shipping-cart', {
        checkoutKey: randomUUID(),
        customer: {
          name: 'Pessoa Teste',
          email: 'test@example.com',
          cpf: '12345678909',
          phone: '31999999999',
        },
        address: {
          postalCode: '30130010',
          street: 'Rua',
          number: '1',
          district: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
        },
        shippingOptionId: 'me-1',
      }),
    /O frete mudou/,
  );
  assert.equal(await prisma.order.count(), 0);
  assert.equal(
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved,
    0,
  );
});

test('shipping limit is shared per connection IP, independent of forwarded headers', () => {
  const limit = new ShippingRateLimit();
  const context = (ip: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers: { 'x-forwarded-for': randomUUID() } }),
    }),
  });
  for (let i = 0; i < 30; i++) assert.equal(limit.canActivate(context('127.0.0.1') as never), true);
  assert.throws(() => limit.canActivate(context('127.0.0.1') as never), /Muitas consultas/);
  assert.equal(limit.canActivate(context('127.0.0.2') as never), true);
});

test('HTTP checkout shares the quote quota and cannot bypass it with an invalid shipping option', async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module.js');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  try {
    const base = await app.getUrl();
    for (let i = 0; i < 30; i++) {
      const response = await httpFetch(`${base}/api/shipping/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 400);
      await response.text();
    }
    const checkout = await httpFetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.1' },
      body: '{}',
    });
    assert.equal(checkout.status, 429);
    await checkout.text();
  } finally {
    await app.close();
  }
});
