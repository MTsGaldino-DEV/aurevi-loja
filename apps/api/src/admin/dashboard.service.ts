import type { AdminDashboard } from '@aurevi/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const SOLD_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'] as const;
const LOW_STOCK_THRESHOLD = 2;
const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // Sao Paulo is UTC-3 all year (no DST)

/** Start of the current week (Monday 00:00) and month in America/Sao_Paulo, as UTC instants. */
export function salesPeriods(now: Date): { weekStart: Date; monthStart: Date } {
  const local = new Date(now.getTime() - SP_OFFSET_MS); // read with UTC getters = Sao Paulo wall clock
  const [year, month, day] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()];
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return {
    weekStart: new Date(Date.UTC(year, month, day - sinceMonday) + SP_OFFSET_MS),
    monthStart: new Date(Date.UTC(year, month, 1) + SP_OFFSET_MS),
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(now = new Date()): Promise<AdminDashboard> {
    const { weekStart, monthStart } = salesPeriods(now);
    const sold = async (since?: Date) => {
      const { _sum } = await this.prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { status: { in: [...SOLD_STATUSES] }, ...(since && { paidAt: { gte: since } }) },
      });
      return _sum.totalCents ?? 0;
    };
    const count = (...status: Array<'paid' | 'preparing' | 'pending_payment'>) =>
      this.prisma.order.count({ where: { status: { in: status } } });

    const [weekCents, monthCents, totalCents, toShipCount, pendingPaymentCount, lowStock] =
      await Promise.all([
        sold(weekStart),
        sold(monthStart),
        sold(),
        count('paid', 'preparing'),
        count('pending_payment'),
        this.prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM product_variants
          WHERE is_active AND stock_on_hand - stock_reserved <= ${LOW_STOCK_THRESHOLD}`,
      ]);

    return {
      weekCents,
      monthCents,
      totalCents,
      toShipCount,
      pendingPaymentCount,
      lowStockCount: lowStock[0]?.count ?? 0,
    };
  }
}
