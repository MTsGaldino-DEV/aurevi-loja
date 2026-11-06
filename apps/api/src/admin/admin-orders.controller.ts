import {
  adminOrderListQuerySchema,
  adminOrderStatusSchema,
  type AdminOrderDetail,
  type AdminOrderList,
} from '@aurevi/shared';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseOrBadRequest } from '../common/parse.js';
import { AdminOriginGuard, AdminSessionGuard } from './admin-auth.guard.js';
import { AdminOrdersService } from './admin-orders.service.js';

@Controller('admin/orders')
@UseGuards(AdminSessionGuard)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: unknown): Promise<AdminOrderList> {
    return this.orders.list(parseOrBadRequest(adminOrderListQuerySchema, query));
  }

  @Get(':number')
  async detail(@Param('number', ParseIntPipe) number: number): Promise<AdminOrderDetail> {
    const order = await this.orders.detail(number);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  @Post(':number/status')
  @HttpCode(200)
  @UseGuards(AdminOriginGuard)
  async changeStatus(
    @Param('number', ParseIntPipe) number: number,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const result = await this.orders.changeStatus(number, parseOrBadRequest(adminOrderStatusSchema, body));
    if (result === 'not_found') throw new NotFoundException('Pedido não encontrado');
    if (result === 'invalid_transition') throw new ConflictException('Transição de status inválida');
    return { ok: true };
  }
}
