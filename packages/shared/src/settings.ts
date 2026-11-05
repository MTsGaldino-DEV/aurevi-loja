import { z } from 'zod';

const flatShippingRate = z.object({
  label: z.string().min(1),
  cents: z.number().int().min(0),
  minDays: z.number().int().min(0),
  maxDays: z.number().int().min(0),
});

const homeBlock = z.object({
  imageKey: z.string().min(1),
  alt: z.string().min(1),
  href: z.string().startsWith('/'),
  title: z.string().optional(),
});

export const settingsSchemas = {
  max_interest_free_installments: z.number().int().min(1).max(12),
  min_installment_cents: z.number().int().min(100),
  pix_discount_percent: z.number().min(0).max(100),
  free_shipping_threshold_cents: z.number().int().positive().nullable(),
  flat_shipping_by_uf: z.record(z.string().length(2), flatShippingRate),
  shipping_origin: z.object({ postalCode: z.string().regex(/^\d{8}$/) }),
  announcement_messages: z.array(z.string().min(1)).max(3),
  home_hero: homeBlock,
  home_collections: z.array(homeBlock).max(2),
  store_info: z.object({
    legalName: z.string(),
    cnpj: z.string(),
    address: z.string(),
    email: z.string(),
    whatsapp: z.string(),
    instagram: z.string(),
  }),
};

export type SettingKey = keyof typeof settingsSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchemas)[K]>;
