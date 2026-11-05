import { applyFreeShipping, type ShippingOption, ufFromPostalCode } from '@aurevi/shared';
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';

@Injectable()
export class ShippingService {
  constructor(private readonly settings: SettingsService) {}

  // Melhor Envio quotes join these options in Phase 7, when sandbox credentials exist.
  async quote(postalCode: string, eligibleCents: number): Promise<ShippingOption[]> {
    const uf = ufFromPostalCode(postalCode);
    if (!uf) return [];
    const [flatRates, threshold] = await Promise.all([
      this.settings.get('flat_shipping_by_uf'),
      this.settings.get('free_shipping_threshold_cents'),
    ]);
    const rate = flatRates[uf];
    const options = rate ? [{ id: `flat-${uf}`, ...rate }] : [];
    return applyFreeShipping(options, eligibleCents, threshold);
  }
}
