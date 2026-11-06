import { checkoutSchema } from '@aurevi/shared';
import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { readCartToken } from '../cart/cart.cookie.js';
import { parseOrBadRequest } from '../common/parse.js';
import { ShippingRateLimit } from '../shipping/shipping-rate-limit.js';
import { OrdersService } from './orders.service.js';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  @HttpCode(201)
  @UseGuards(ShippingRateLimit)
  async checkout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(checkoutSchema, body);
    const result = await this.orders.createFromCart(readCartToken(request) ?? '', input);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  @Get('orders/:token')
  view(@Param('token') token: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.orders.viewByToken(token);
  }
}
