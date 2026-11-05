import { shippingQuoteSchema } from '@aurevi/shared';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { parseOrBadRequest } from '../common/parse.js';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('quote')
  @HttpCode(200)
  quote(@Body() body: unknown) {
    const { postalCode } = parseOrBadRequest(shippingQuoteSchema, body);
    // Without a cart there is nothing to qualify for free shipping yet.
    return this.shipping.quote(postalCode, 0);
  }
}
