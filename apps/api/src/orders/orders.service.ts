import {
  type CheckoutData,
  type CheckoutResult,
  computeTotals,
  couponProblem,
  orderPaymentOptions,
  type OrderView,
} from '@aurevi/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { env } from '../env.js';
import { Prisma } from '../generated/prisma/client.js';
import { paymentMessage } from '../payments/payment-message.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ShippingService } from '../shipping/shipping.service.js';
import { StockService } from './stock.service.js';

const RESERVATION_MINUTES = 40;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

type OrderTx = Prisma.TransactionClient;

// A payment that may still be approved: card under review, or Pix whose QR has not expired.
export const openPaymentWhere = (now: Date): Prisma.PaymentWhereInput => ({
  status: { in: ['pending', 'in_process'] },
  OR: [{ pixExpiresAt: null }, { pixExpiresAt: { gt: now } }],
});

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
  ) {}

  // Derived from the checkout key, so retrying the same submit returns the same order link.
  private tokenFor(checkoutKey: string) {
    return createHmac('sha256', env.ORDER_TOKEN_SECRET).update(checkoutKey).digest('base64url');
  }

  async createFromCart(cartToken: string, input: CheckoutData): Promise<CheckoutResult> {
    const accessToken = this.tokenFor(input.checkoutKey);
    const existing = await this.prisma.order.findUnique({
      where: { checkoutKey: input.checkoutKey },
      select: { number: true },
    });
    if (existing) return { orderNumber: existing.number, accessToken };

    const cart = await this.prisma.cart.findUnique({
      where: { token: cartToken },
      include: {
        coupon: true,
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: { images: { orderBy: { position: 'asc' }, take: 1 } },
                },
                optionValues: {
                  include: { optionValue: { include: { option: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) throw new ConflictException('Sua sacola está vazia.');
    if (cart.items.some(({ variant }) => variant.product.status !== 'active')) {
      throw new ConflictException('Uma das peças da sacola não está mais disponível.');
    }

    // Prices come from the database at this moment, never from the browser.
    const lines = cart.items.map(({ variant, quantity }) => ({
      variantId: variant.id,
      quantity,
      unitPriceCents: variant.priceCents ?? variant.product.priceCents,
      productName: variant.product.name,
      sku: variant.sku,
      imageKey: variant.product.images[0]?.storageKey ?? null,
      variantLabel: [...variant.optionValues]
        .sort((a, b) => a.optionValue.option.position - b.optionValue.option.position)
        .map((link) => link.optionValue.value)
        .join(' / '),
    }));
    const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

    const problem = cart.coupon && couponProblem(cart.coupon, subtotalCents, new Date());
    if (problem) throw new ConflictException(problem);
    const coupon = cart.coupon;

    const { merchandiseCents } = computeTotals({
      subtotalCents,
      coupon,
      shippingCents: 0,
      pixDiscountPercent: 0,
    });
    const options = await this.shipping.quote({
      postalCode: input.address.postalCode,
      eligibleCents: merchandiseCents,
      forceFree: coupon?.type === 'free_shipping',
      items: lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
      fresh: true,
    });
    const option = options.find((candidate) => candidate.id === input.shippingOptionId);
    if (!option) throw new ConflictException('O frete mudou. Escolha uma opção de novo.');

    const { discountCents, totalCents } = computeTotals({
      subtotalCents,
      coupon,
      shippingCents: option.cents,
      pixDiscountPercent: 0,
    });
    const { customer: person, address, notes } = input;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        // First data wins: a guest checkout must not be able to overwrite someone's record.
        const customer = await tx.customer.upsert({
          where: { email: person.email },
          create: { email: person.email, name: person.name, cpf: person.cpf, phone: person.phone },
          update: {},
        });
        const created = await tx.order.create({
          data: {
            customerId: customer.id,
            subtotalCents,
            discountCents,
            shippingCents: option.cents,
            totalCents,
            couponId: coupon?.id ?? null,
            couponCode: coupon?.code ?? null,
            customerSnapshot: person,
            shippingAddress: address,
            shippingMethod: option,
            checkoutKey: input.checkoutKey,
            accessTokenHash: hash(accessToken),
            reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
            notes: notes ?? null,
            items: {
              create: lines.map(({ variantId, ...line }) => ({ ...line, variantId })),
            },
          },
          select: { id: true, number: true },
        });
        await this.stock.reserve(tx, created.id, lines);
        if (coupon) {
          const used = await tx.$executeRaw`
            UPDATE coupons SET uses_count = uses_count + 1, updated_at = now()
            WHERE id = ${coupon.id}::uuid AND (max_uses IS NULL OR uses_count < max_uses)`;
          if (used === 0) throw new ConflictException('Este cupom já foi totalmente usado.');
        }
        await tx.cart.delete({ where: { id: cart.id } });
        return created;
      });
      return { orderNumber: order.number, accessToken };
    } catch (error) {
      // A concurrent retry of the same submit already created the order.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.order.findUnique({
          where: { checkoutKey: input.checkoutKey },
          select: { number: true },
        });
        if (raced) return { orderNumber: raced.number, accessToken };
      }
      throw error;
    }
  }

  async findByToken(token: string) {
    const order = await this.prisma.order.findUnique({ where: { accessTokenHash: hash(token) } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async viewByToken(token: string): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { accessTokenHash: hash(token) },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    const [pixDiscountPercent, maxInstallments, minInstallmentCents] = await Promise.all([
      this.settings.get('pix_discount_percent'),
      this.settings.get('max_interest_free_installments'),
      this.settings.get('min_installment_cents'),
    ]);
    const payment = order.payments[0];
    // Mercado Pago can take a while to report an expired QR, so the date decides.
    const pixExpired =
      payment?.method === 'pix' &&
      ((payment.status === 'pending' &&
        payment.pixExpiresAt &&
        payment.pixExpiresAt <= new Date()) ||
        payment.statusDetail === 'expired');
    const paymentStatus = pixExpired ? 'expired' : payment?.status;
    return {
      payerEmail: (order.customerSnapshot as { email: string }).email,
      paymentOptions: orderPaymentOptions(order, {
        pixDiscountPercent,
        maxInstallments,
        minInstallmentCents,
      }),
      payment:
        payment && paymentStatus
          ? {
              method: payment.method,
              status: paymentStatus,
              message: paymentMessage(paymentStatus, payment.statusDetail),
              amountCents: payment.amountCents,
              installments: payment.installments,
              pixQrCode: payment.pixQrCode,
              pixQrCodeBase64: payment.pixQrCodeBase64,
              pixExpiresAt: payment.pixExpiresAt?.toISOString() ?? null,
            }
          : null,
      number: order.number,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      pixDiscountCents: order.pixDiscountCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      couponCode: order.couponCode,
      shippingMethod: order.shippingMethod as OrderView['shippingMethod'],
      shippingAddress: order.shippingAddress as OrderView['shippingAddress'],
      items: order.items.map((item) => ({
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        imageKey: item.imageKey,
      })),
    };
  }

  private async stockLines(tx: OrderTx, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId, variantId: { not: null } },
      select: { variantId: true, quantity: true },
    });
    return items.map((item) => ({ variantId: item.variantId!, quantity: item.quantity }));
  }

  // The conditional status change is the guard: only one caller can move the order, so duplicate
  // webhooks and job overlaps cannot change stock twice. Returns whether this call did the work.
  async markPaid(orderId: string, tx?: OrderTx): Promise<boolean> {
    const run = async (client: OrderTx) => {
      const { count } = await client.order.updateMany({
        where: { id: orderId, status: 'pending_payment' },
        data: { status: 'paid', paidAt: new Date(), reservationExpiresAt: null },
      });
      if (count === 0) return false;
      await this.stock.commitSale(client, orderId, await this.stockLines(client, orderId));
      return true;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async flagForReview(orderId: string, reason: string, tx: OrderTx) {
    await tx.order.update({ where: { id: orderId }, data: { reviewReason: reason } });
  }

  // A payment approved after the job canceled the order: sell it if the pieces are still there.
  async reviveCanceled(orderId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, status: 'canceled' },
          data: { status: 'paid', paidAt: new Date(), canceledAt: null },
        });
        if (count === 0) return false;
        const lines = await this.stockLines(tx, orderId);
        await this.stock.reserve(tx, orderId, lines);
        await this.stock.commitSale(tx, orderId, lines);
        const { couponId } = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { couponId: true },
        });
        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { usesCount: { increment: 1 } },
          });
        }
        return true;
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      await this.flagForReview(
        orderId,
        'Pagamento aprovado depois do cancelamento e sem estoque. Reembolsar.',
        this.prisma,
      );
      return false;
    }
  }

  async cancelPending(orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: 'pending_payment' },
        data: { status: 'canceled', canceledAt: new Date(), reservationExpiresAt: null },
      });
      if (count === 0) return false;
      await this.stock.release(tx, orderId, await this.stockLines(tx, orderId));
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { couponId: true },
      });
      if (order.couponId) {
        await tx.coupon.update({
          where: { id: order.couponId },
          data: { usesCount: { decrement: 1 } },
        });
      }
      return true;
    });
  }

  async cancelExpired(now = new Date()) {
    const expired = await this.prisma.order.findMany({
      where: {
        status: 'pending_payment',
        reservationExpiresAt: { lt: now },
        payments: {
          none: {
            OR: [
              openPaymentWhere(now),
              // Outcome still unknown after a failed request; the webhook may yet answer.
              { status: 'creating', createdAt: { gt: new Date(now.getTime() - 5 * 60_000) } },
            ],
          },
        },
      },
      select: { id: true },
    });
    let canceled = 0;
    for (const { id } of expired) {
      if (await this.cancelPending(id)) canceled += 1;
    }
    return canceled;
  }
}
