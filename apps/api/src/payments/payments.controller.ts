import { payOrderSchema } from '@aurevi/shared';
import { Body, Controller, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { parseOrBadRequest } from '../common/parse.js';
import { PaymentsService } from './payments.service.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:token/payments')
  @HttpCode(200)
  pay(
    @Param('token') token: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.payments.pay(token, parseOrBadRequest(payOrderSchema, body));
  }

  // Stores the event and answers right away. Mercado Pago waits at most 22 seconds.
  @Post('webhooks/mercadopago')
  @HttpCode(200)
  async webhook(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    const eventId = await this.payments.receiveWebhook({
      signature,
      requestId,
      dataId: query['data.id'],
      body,
    });
    if (eventId) void this.payments.processEvent(eventId);
    return { received: true };
  }
}
