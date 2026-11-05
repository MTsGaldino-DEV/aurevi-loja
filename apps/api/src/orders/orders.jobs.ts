import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrdersJobs {
  private readonly logger = new Logger(OrdersJobs.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('*/5 * * * *')
  async releaseExpiredReservations() {
    const canceled = await this.orders.cancelExpired();
    if (canceled > 0) this.logger.log(`Canceled ${canceled} expired orders`);
  }

  @Cron('0 4 * * *')
  async removeExpiredCarts() {
    await this.prisma.cart.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
