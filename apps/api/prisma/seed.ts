// Fictional catalog for development. Names and placeholder images are not real products.
import { allUfs, type SettingKey, type SettingValue, settingsSchemas } from '@aurevi/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const defaults: { [K in SettingKey]: SettingValue<K> } = {
  max_interest_free_installments: 5,
  min_installment_cents: 3000,
  pix_discount_percent: 5,
  free_shipping_threshold_cents: null,
  flat_shipping_by_uf: Object.fromEntries(
    allUfs.map((uf) => [
      uf,
      uf === 'MG'
        ? { label: 'Frete fixo Minas Gerais', cents: 990, minDays: 2, maxDays: 4 }
        : { label: `Frete fixo ${uf}`, cents: 2490, minDays: 5, maxDays: 10 },
    ]),
  ),
  shipping_origin: { postalCode: '35045120' },
  announcement_messages: ['Ambiente de desenvolvimento: produtos fictícios'],
  home_hero: {
    imageKey: 'brand/editorial-linho.webp',
    alt: 'Modelo com calça e top em tom cacau diante de cortinas de linho',
    href: '/novidades',
    title: 'Seu estilo. Sua presença.',
  },
  home_collections: [],
  store_info: { legalName: '', cnpj: '', address: '', email: '', whatsapp: '', instagram: '' },
};

const colors = [
  { value: 'Areia', hex: '#D2BFA4' },
  { value: 'Argila', hex: '#8D7459' },
  { value: 'Cacau', hex: '#66513D' },
];
const sizes = ['P', 'M', 'G'];
const sizeChart = {
  columns: ['Busto (cm)', 'Cintura (cm)', 'Quadril (cm)'],
  rows: [
    { size: 'P', values: [86, 68, 94] },
    { size: 'M', values: [90, 72, 98] },
    { size: 'G', values: [96, 78, 104] },
  ],
};
const catalog = [
  ['vestidos', 'Vestido Exemplo Um', 28990, null],
  ['vestidos', 'Vestido Exemplo Dois', 32990, 39990],
  ['vestidos', 'Vestido Exemplo Três', 25990, null],
  ['blusas', 'Blusa Exemplo Um', 14990, null],
  ['blusas', 'Blusa Exemplo Dois', 16990, 19990],
  ['conjuntos', 'Conjunto Exemplo Um', 37990, null],
] as const;

const slugify = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '-');

for (const [key, value] of Object.entries(defaults)) {
  settingsSchemas[key as SettingKey].parse(value);
  const stored = (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, create: { key, value: stored }, update: {} });
}

const categoryIds = new Map<string, string>();
for (const [position, name] of ['Vestidos', 'Blusas', 'Conjuntos'].entries()) {
  const slug = slugify(name);
  const category = await prisma.category.upsert({
    where: { slug },
    create: { name, slug, position },
    update: {},
  });
  categoryIds.set(slug, category.id);
}

const upsertOption = (name: string, position: number) =>
  prisma.productOption.upsert({ where: { name }, create: { name, position }, update: {} });
const color = await upsertOption('Cor', 0);
const size = await upsertOption('Tamanho', 1);
const upsertValue = (optionId: string, value: string, position: number, hex?: string) =>
  prisma.productOptionValue.upsert({
    where: { optionId_value: { optionId, value } },
    create: { optionId, value, position, hex: hex ?? null },
    update: {},
  });
const colorValues = await Promise.all(
  colors.map((c, i) => upsertValue(color.id, c.value, i, c.hex)),
);
const sizeValues = await Promise.all(sizes.map((s, i) => upsertValue(size.id, s, i)));

for (const [categorySlug, name, priceCents, compareAtPriceCents] of catalog) {
  const slug = slugify(name);
  if (await prisma.product.findUnique({ where: { slug } })) continue;
  await prisma.product.create({
    data: {
      name,
      slug,
      categoryId: categoryIds.get(categorySlug)!,
      description: 'Descrição fictícia para desenvolvimento.',
      composition: '100% algodão (fictício)',
      modelInfo: 'Modelo fictícia veste M',
      sizeChart,
      status: 'active',
      priceCents,
      compareAtPriceCents,
      weightGrams: 400,
      widthCm: 25,
      heightCm: 5,
      lengthCm: 30,
      images: {
        create: [
          ...colorValues.map((value, position) => ({
            optionValueId: value.id,
            storageKey: `placeholder-${value.value.toLowerCase()}.svg`,
            alt: `${name} na cor ${value.value}`,
            width: 800,
            height: 1067,
            position,
          })),
          {
            storageKey: 'placeholder.svg',
            alt: `${name}, detalhe`,
            width: 800,
            height: 1067,
            position: colorValues.length,
          },
        ],
      },
      variants: {
        create: colorValues.flatMap((colorValue) =>
          sizeValues.map((sizeValue) => ({
            sku: `${slug}-${colorValue.value}-${sizeValue.value}`.toUpperCase(),
            // One sold-out size, so the storefront's unavailable state can be seen in development.
            stockOnHand: sizeValue.value === 'G' && colorValue.value === 'Cacau' ? 0 : 5,
            optionValues: {
              create: [{ optionValueId: colorValue.id }, { optionValueId: sizeValue.id }],
            },
          })),
        ),
      },
    },
  });
}

await prisma.coupon.upsert({
  where: { code: 'TESTE10' },
  create: { code: 'TESTE10', type: 'percent', value: 10 },
  update: {},
});

const adminEmail = process.env['SEED_ADMIN_EMAIL'];
const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
if (adminEmail && adminPassword) {
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, passwordHash: await argon2.hash(adminPassword) },
    update: {},
  });
}

await prisma.$disconnect();
console.log('Seed complete');
