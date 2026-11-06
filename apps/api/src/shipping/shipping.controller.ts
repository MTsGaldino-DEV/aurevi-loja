import { shippingQuoteSchema } from '@aurevi/shared';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { parseOrBadRequest } from '../common/parse.js';
import { ShippingService } from './shipping.service.js';
import { ShippingRateLimit } from './shipping-rate-limit.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('quote')
  @HttpCode(200)
  @UseGuards(ShippingRateLimit)
  quote(@Body() body: unknown) {
    const { postalCode, variantId, quantity } = parseOrBadRequest(shippingQuoteSchema, body);
    // Without a cart there is nothing to qualify for free shipping yet.
    return this.shipping.quote({
      postalCode,
      eligibleCents: 0,
      items: variantId ? [{ variantId, quantity }] : [],
    });
  }
}
