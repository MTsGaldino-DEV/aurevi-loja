import { applyFreeShipping, type ShippingOption, ufFromPostalCode } from '@aurevi/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MelhorEnvioService } from './melhor-envio.service.js';

@Injectable()
export class ShippingService {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly melhorEnvio: MelhorEnvioService,
  ) {}

  async quote({
    postalCode,
    eligibleCents,
    items,
    forceFree = false,
    fresh = false,
  }: {
    postalCode: string;
    eligibleCents: number;
    items: { variantId: string; quantity: number }[];
    forceFree?: boolean;
    fresh?: boolean;
  }): Promise<ShippingOption[]> {
    postalCode = postalCode.replace(/\D/g, '');
    const uf = ufFromPostalCode(postalCode);
    if (!uf) return [];
    const [flatRates, threshold] = await Promise.all([
      this.settings.get('flat_shipping_by_uf'),
      this.settings.get('free_shipping_threshold_cents'),
    ]);
    const rate = flatRates[uf];
    const options: ShippingOption[] = rate ? [{ id: `flat-${uf}`, ...rate }] : [];
    if (items.length > 0) {
      const [origin, variants] = await Promise.all([
        this.settings.get('shipping_origin'),
        this.prisma.productVariant.findMany({
          where: {
            id: { in: items.map((i) => i.variantId) },
            isActive: true,
            product: { status: 'active' },
          },
          include: { product: true },
        }),
      ]);
      const products = items.flatMap((item) => {
        const variant = variants.find((v) => v.id === item.variantId);
        if (!variant) return [];
        const product = variant.product;
        if (
          product.weightGrams <= 0 ||
          product.widthCm <= 0 ||
          product.heightCm <= 0 ||
          product.lengthCm <= 0
        )
          return [];
        return [
          {
            id: variant.id,
            width: product.widthCm,
            height: product.heightCm,
            length: product.lengthCm,
            weight: product.weightGrams / 1000,
            insurance_value: (variant.priceCents ?? product.priceCents) / 100,
            quantity: item.quantity,
          },
        ];
      });
      // A quote for only part of the bag would undercharge shipping.
      if (products.length === items.length)
        options.push(
          ...(await this.melhorEnvio.quote(origin.postalCode, postalCode, products, fresh)),
        );
    }
    return applyFreeShipping(options, eligibleCents, forceFree ? 0 : threshold);
  }
}
