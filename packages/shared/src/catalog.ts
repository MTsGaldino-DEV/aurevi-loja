import { z } from 'zod';

export const sizeChartSchema = z
  .object({
    columns: z.array(z.string().min(1)).min(1),
    rows: z
      .array(z.object({ size: z.string().min(1), values: z.array(z.number().positive()) }))
      .min(1),
  })
  .refine((chart) => chart.rows.every((row) => row.values.length === chart.columns.length), {
    message: 'Each row needs one value per column',
  });
export type SizeChart = z.infer<typeof sizeChartSchema>;

const toList = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const names = z.preprocess(toList, z.array(z.string().min(1).max(60)).max(20));

export const PRODUCT_PAGE_SIZE = 12;

export const productQuerySchema = z.object({
  categoria: z.string().max(120).optional(),
  cor: names,
  tamanho: names,
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  ordem: z.enum(['novidades', 'menor-preco', 'maior-preco']).default('novidades'),
  pagina: z.coerce.number().int().min(1).max(50).default(1),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export type ImageView = { key: string; alt: string; width: number; height: number };

export type ProductCard = {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  image: ImageView | null;
  inStock: boolean;
};

export type ProductList = {
  items: ProductCard[];
  total: number;
  facets: { name: string; values: { value: string; hex: string | null; count: number }[] }[];
};

export type ProductDetail = ProductCard & {
  description: string;
  composition: string | null;
  sizeChart: SizeChart | null;
  modelInfo: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { name: string; slug: string };
  options: { name: string; values: { id: string; value: string; hex: string | null }[] }[];
  variants: {
    id: string;
    priceCents: number;
    available: boolean;
    optionValueIds: string[];
  }[];
  images: (ImageView & { optionValueId: string | null })[];
  related: ProductCard[];
};

export type CategoryNode = {
  name: string;
  slug: string;
  children: { name: string; slug: string }[];
};

export type StorefrontLayout = {
  categories: CategoryNode[];
  announcementMessages: string[];
  storeInfo: {
    legalName: string;
    cnpj: string;
    address: string;
    email: string;
    whatsapp: string;
    instagram: string;
  };
  payment: { maxInstallments: number; minInstallmentCents: number; pixDiscountPercent: number };
  freeShippingThresholdCents: number | null;
};

export type HomeBlock = { imageKey: string; alt: string; href: string; title?: string | undefined };
export type StorefrontHome = {
  hero: HomeBlock;
  collections: HomeBlock[];
  newest: ProductCard[];
};

export const shippingQuoteSchema = z.object({
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'Informe um CEP com 8 dígitos'),
  variantId: z.uuid().optional(),
  quantity: z.number().int().min(1).max(10).default(1),
});

export type ShippingOption = {
  id: string;
  label: string;
  cents: number;
  minDays: number;
  maxDays: number;
};
