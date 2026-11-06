import {
  addCartItemSchema,
  applyCouponSchema,
  shippingQuoteSchema,
  updateCartItemSchema,
} from '@aurevi/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { parseOrBadRequest } from '../common/parse.js';
import { ShippingRateLimit } from '../shipping/shipping-rate-limit.js';
import { newCartToken, readCartToken } from './cart.cookie.js';
import { CartService } from './cart.service.js';

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  view(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.cart.view(readCartToken(request));
  }

  @Post('items')
  @HttpCode(200)
  add(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const { variantId, quantity } = parseOrBadRequest(addCartItemSchema, body);
    return this.cart.addItem(
      readCartToken(request),
      () => newCartToken(response),
      variantId,
      quantity,
    );
  }

  @Patch('items/:id')
  update(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { quantity } = parseOrBadRequest(updateCartItemSchema, body);
    return this.cart.updateItem(readCartToken(request), id, quantity);
  }

  @Delete('items/:id')
  remove(@Req() request: Request, @Param('id') id: string) {
    return this.cart.removeItem(readCartToken(request), id);
  }

  @Post('coupon')
  @HttpCode(200)
  applyCoupon(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const { code } = parseOrBadRequest(applyCouponSchema, body);
    return this.cart.applyCoupon(readCartToken(request), () => newCartToken(response), code);
  }

  @Delete('coupon')
  removeCoupon(@Req() request: Request) {
    return this.cart.removeCoupon(readCartToken(request));
  }

  @Post('shipping-quote')
  @HttpCode(200)
  @UseGuards(ShippingRateLimit)
  quote(@Req() request: Request, @Body() body: unknown) {
    const { postalCode } = parseOrBadRequest(shippingQuoteSchema, body);
    return this.cart.quote(readCartToken(request), postalCode);
  }
}
