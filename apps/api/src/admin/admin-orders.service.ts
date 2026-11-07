import {
  adminTransitions,
  type AdminOrderDetail,
  type AdminOrderList,
  type AdminOrderListQuery,
  type AdminOrderStatusInput,
} from '@aurevi/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const MAX_INT = 2_147_483_647;
const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // Sao Paulo is UTC-3 all year (no DST)
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of a São Paulo calendar day (AAAA-MM-DD) as a UTC instant; 400 for impossible dates. */
function dayStart(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
    throw new BadRequestException(`Data inválida: ${value}`);
  }
  return new Date(utc.getTime() + SP_OFFSET_MS);
}

// Prisma passes `contains` to LIKE as-is, so the user's wildcards must be escaped.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminOrderListQuery): Promise<AdminOrderList> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status === 'to_ship') where.status = { in: ['paid', 'preparing'] };
    else if (query.status) where.status = query.status;

    const from = query.from ? dayStart(query.from) : undefined;
    const to = query.to ? dayStart(query.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('A data inicial é posterior à final');
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: from }),
        ...(to && { lt: new Date(to.getTime() + DAY_MS) }), // whole last day
      };
    }

    const q = query.q?.trim();
    if (q) {
      const text = escapeLike(q);
      const or: Prisma.OrderWhereInput[] = [
        { customer: { name: { contains: text, mode: 'insensitive' } } },
        { customer: { email: { contains: text, mode: 'insensitive' } } },
      ];
      if (/^\d+$/.test(q) && Number(q) <= MAX_INT) or.push({ number: Number(q) });
      where.OR = or;
    }

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          number: true,
          totalCents: true,
          status: true,
          createdAt: true,
          paidAt: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    return {
      items: rows.map((o) => ({
        number: o.number,
        customerName: o.customer.name,
        totalCents: o.totalCents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
      })),
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  async detail(number: number): Promise<AdminOrderDetail | null> {
    const o = await this.prisma.order.findUnique({
      where: { number },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        shipments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!o) return null;
    const s = o.shipments[0];
    return {
      number: o.number,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      items: o.items.map((i) => ({
        productName: i.productName,
        variantLabel: i.variantLabel,
        sku: i.sku,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })),
      customerSnapshot: o.customerSnapshot as Record<string, unknown>,
      shippingAddress: o.shippingAddress as Record<string, unknown>,
      shippingMethod: o.shippingMethod as Record<string, unknown>,
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      pixDiscountCents: o.pixDiscountCents,
      shippingCents: o.shippingCents,
      totalCents: o.totalCents,
      couponCode: o.couponCode,
      payments: o.payments.map((p) => ({
        method: p.method,
        status: p.status,
        amountCents: p.amountCents,
        installments: p.installments,
        createdAt: p.createdAt.toISOString(),
      })),
      shipment: s
        ? {
            carrier: s.carrier,
            service: s.service,
            trackingCode: s.trackingCode,
            shippedAt: s.shippedAt?.toISOString() ?? null,
            deliveredAt: s.deliveredAt?.toISOString() ?? null,
          }
        : null,
      reviewReason: o.reviewReason,
      notes: o.notes,
    } satisfies AdminOrderDetail;
  }

  async changeStatus(
    number: number,
    input: AdminOrderStatusInput,
  ): Promise<'ok' | 'not_found' | 'invalid_transition'> {
    const order = await this.prisma.order.findUnique({
      where: { number },
      select: { id: true, status: true, shippingMethod: true },
    });
    if (!order) return 'not_found';
    if (!adminTransitions[order.status].includes(input.status)) return 'invalid_transition';

    return this.prisma.$transaction(async (tx) => {
      // Conditional on the status we read: a concurrent change makes this a no-op.
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: input.status },
      });
      if (count === 0) return 'invalid_transition';
      if (input.status === 'preparing') return 'ok';

      const now = new Date();
      const existing = await tx.shipment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const timestamps =
        input.status === 'shipped'
          ? { shippedAt: now, trackingCode: input.trackingCode }
          : { deliveredAt: now };
      if (existing) {
        await tx.shipment.update({
          where: { id: existing.id },
          data: { ...timestamps, ...(input.carrier && { carrier: input.carrier }) },
        });
      } else {
        const label = (order.shippingMethod as { label?: string } | null)?.label ?? '';
        await tx.shipment.create({
          data: { orderId: order.id, carrier: input.carrier ?? label, service: label, ...timestamps },
        });
      }
      return 'ok';
    });
  }
}
