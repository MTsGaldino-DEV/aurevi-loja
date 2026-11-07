import { orderPaymentOptions, type OrderView, type PayOrderData } from '@aurevi/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InvalidWebhookSignatureError,
  MercadoPagoError,
  WebhookSignatureValidator,
} from 'mercadopago';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import { openPaymentWhere, OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MercadoPagoGateway, type ProviderPayment } from './mercadopago.gateway.js';

const PIX_MINUTES = 30;
const RESERVATION_MARGIN_MINUTES = 10;
// Each attempt can extend the reservation, so this also bounds how long stock can be held.
const MAX_ATTEMPTS = 10;
const IN_FLIGHT_MINUTES = 2;
const MAX_WEBHOOK_ATTEMPTS = 20;

const webhookBody = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
});

const uuid = z.uuid();

type PixPayer = { name: string; email: string; cpf: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
    private readonly gateway: MercadoPagoGateway,
  ) {}

  async pay(token: string, input: PayOrderData): Promise<OrderView> {
    const order = await this.orders.findByToken(token);
    const open = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        ...openPaymentWhere(new Date()),
        providerPaymentId: { not: null },
      },
    });
    if (open?.method === 'pix') {
      // A QR that stays active could be paid after the customer pays by card.
      if (input.method === 'pix') return this.orders.viewByToken(token);
      const latest = await this.cancelAtProvider(open.providerPaymentId!);
      if (latest.status === 'approved') return this.orders.viewByToken(token);
    }

    const [pixDiscountPercent, maxInstallments, minInstallmentCents] = await Promise.all([
      this.settings.get('pix_discount_percent'),
      this.settings.get('max_interest_free_installments'),
      this.settings.get('min_installment_cents'),
    ]);
    const options = orderPaymentOptions(order, {
      pixDiscountPercent,
      maxInstallments,
      minInstallmentCents,
    });
    if (input.method === 'credit_card' && input.installments > options.maxInstallments) {
      throw new ConflictException('Este número de parcelas não está disponível para este pedido.');
    }
    const isPix = input.method === 'pix';
    const amountCents = isPix ? options.pixTotalCents : options.cardTotalCents;
    const pixExpiresAt = new Date(Date.now() + PIX_MINUTES * 60_000);

    const attempt = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        { status: string; reservation_expires_at: Date | null }[]
      >`
        SELECT status, reservation_expires_at FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
      const now = new Date();
      if (locked?.status !== 'pending_payment') {
        throw new ConflictException('Este pedido não está aguardando pagamento.');
      }
      if (locked.reservation_expires_at && locked.reservation_expires_at < now) {
        throw new ConflictException('A reserva deste pedido expirou. Faça um novo pedido.');
      }
      if ((await tx.payment.count({ where: { orderId: order.id } })) >= MAX_ATTEMPTS) {
        throw new ConflictException('Muitas tentativas neste pedido. Faça um novo pedido.');
      }
      const blocking = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          OR: [
            openPaymentWhere(now),
            {
              status: 'creating',
              createdAt: { gt: new Date(now.getTime() - IN_FLIGHT_MINUTES * 60_000) },
            },
          ],
        },
      });
      if (blocking)
        throw new ConflictException('Já existe um pagamento em andamento neste pedido.');

      await tx.order.update({
        where: { id: order.id },
        data: {
          pixDiscountCents: isPix ? options.pixDiscountCents : 0,
          totalCents: amountCents,
          ...(isPix && {
            // The QR can be paid until it expires, so the pieces stay reserved past that.
            reservationExpiresAt: new Date(
              pixExpiresAt.getTime() + RESERVATION_MARGIN_MINUTES * 60_000,
            ),
          }),
        },
      });
      return tx.payment.create({
        data: {
          orderId: order.id,
          method: input.method,
          status: 'creating',
          amountCents,
          installments: input.method === 'credit_card' ? input.installments : 1,
          idempotencyKey: randomUUID(),
        },
      });
    });

    const common = {
      transaction_amount: amountCents / 100,
      description: `Pedido ${order.number} Aurevi`,
      external_reference: attempt.id,
    };
    const body =
      input.method === 'pix'
        ? {
            ...common,
            payment_method_id: 'pix',
            date_of_expiration: pixExpiresAt.toISOString().replace('Z', '-00:00'),
            payer: pixPayer(order.customerSnapshot as PixPayer),
          }
        : {
            ...common,
            statement_descriptor: 'AUREVI',
            token: input.token,
            payment_method_id: input.paymentMethodId,
            installments: input.installments,
            ...(input.issuerId && { issuer_id: Number(input.issuerId) }),
            payer: input.payer,
          };

    let created: ProviderPayment;
    try {
      created = await this.gateway.create(body, attempt.idempotencyKey);
    } catch (error) {
      if (error instanceof MercadoPagoError && error.status >= 400 && error.status < 500) {
        // Mercado Pago refused the request, so no payment exists. The cause is for the log only.
        this.logger.warn(`Payment refused with ${error.status}: ${error.message}`);
        await this.prisma.payment.update({
          where: { id: attempt.id },
          data: { status: 'failed', statusDetail: error.error.slice(0, 200) },
        });
        throw new UnprocessableEntityException(
          'Não foi possível processar o pagamento. Confira os dados e tente de novo.',
        );
      }
      // The outcome is unknown. The row keeps blocking new attempts for a while, and the webhook
      // finds it through external_reference if the payment was created after all.
      this.logger.error(`Payment creation failed for attempt ${attempt.id}`, error);
      throw new ServiceUnavailableException(
        'Não recebemos a resposta do pagamento. Aguarde dois minutos antes de tentar de novo.',
      );
    }
    await this.apply(created);
    return this.orders.viewByToken(token);
  }

  private async cancelAtProvider(id: string) {
    let latest: ProviderPayment;
    try {
      latest = await this.gateway.cancel(id);
    } catch {
      // Canceling fails when it was already paid, so ask what happened.
      latest = await this.gateway.get(id);
    }
    await this.apply(latest);
    return latest;
  }

  // Mercado Pago is the source of truth; every state change comes through here.
  async apply(provider: ProviderPayment) {
    const providerPaymentId = String(provider.id);
    const reference = uuid.safeParse(provider.external_reference);
    const row = await this.prisma.payment.findFirst({
      where: {
        OR: [{ providerPaymentId }, ...(reference.success ? [{ id: reference.data }] : [])],
      },
    });
    if (!row) {
      this.logger.warn(`Ignoring unknown payment ${providerPaymentId}`);
      return;
    }
    const status = provider.status ?? row.status;
    const pix = provider.point_of_interaction?.transaction_data;
    const amountMatches = Math.round((provider.transaction_amount ?? 0) * 100) === row.amountCents;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: row.id },
        data: {
          providerPaymentId,
          status,
          statusDetail: provider.status_detail ?? null,
          installments: provider.installments ?? row.installments,
          ...(pix?.qr_code && {
            pixQrCode: pix.qr_code,
            pixQrCodeBase64: pix.qr_code_base64 ?? null,
          }),
          ...(row.method === 'pix' &&
            provider.date_of_expiration && {
              pixExpiresAt: new Date(provider.date_of_expiration),
            }),
        },
      });
      if (status === 'approved') {
        if (!amountMatches) {
          await this.orders.flagForReview(
            row.orderId,
            `Pagamento ${providerPaymentId} aprovado com valor diferente do pedido.`,
            tx,
          );
          return 'done';
        }
        if (await this.orders.markPaid(row.orderId, tx)) return 'done';
        const others = await tx.payment.count({
          where: { orderId: row.orderId, status: 'approved', id: { not: row.id } },
        });
        if (others > 0) {
          await this.orders.flagForReview(
            row.orderId,
            `Segundo pagamento aprovado no mesmo pedido: ${providerPaymentId}.`,
            tx,
          );
          return 'done';
        }
        return 'maybe-canceled';
      }
      if (status === 'refunded') {
        await tx.order.updateMany({
          where: {
            id: row.orderId,
            status: { in: ['paid', 'preparing', 'shipped', 'delivered'] },
          },
          data: { status: 'refunded' },
        });
      }
      if (status === 'charged_back' || status === 'in_mediation') {
        await this.orders.flagForReview(
          row.orderId,
          `Pagamento ${providerPaymentId} em disputa: ${status}.`,
          tx,
        );
      }
      return 'done';
    });
    // Separate transaction: running out of stock must not undo the payment update above.
    if (outcome === 'maybe-canceled') await this.orders.reviveCanceled(row.orderId);
  }

  // Returns the event to process, or null for a repeated delivery.
  async receiveWebhook(request: {
    signature: string | undefined;
    requestId: string | undefined;
    dataId: unknown;
    body: unknown;
  }) {
    if (!env.MP_WEBHOOK_SECRET) throw new ServiceUnavailableException('Webhook not configured');
    const dataId = typeof request.dataId === 'string' ? request.dataId : undefined;
    try {
      WebhookSignatureValidator.validate({
        xSignature: request.signature,
        xRequestId: request.requestId,
        dataId,
        secret: env.MP_WEBHOOK_SECRET,
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        this.logger.warn(`Rejected webhook: ${error.reason}`);
        throw new UnauthorizedException('Invalid signature');
      }
      throw error;
    }
    const parsed = webhookBody.safeParse(request.body);
    if (!parsed.success) throw new BadRequestException('Invalid notification');

    // The resource id comes from the signed query string, never from the unsigned body.
    const [event] = await this.prisma.webhookEvent.createManyAndReturn({
      data: {
        provider: 'mercadopago',
        eventId: String(parsed.data.id ?? request.requestId),
        resourceId: dataId ?? null,
        payload: parsed.data,
      },
      skipDuplicates: true,
      select: { id: true },
    });
    return event?.id ?? null;
  }

  async processEvent(eventId: string) {
    const event = await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { attempts: { increment: 1 } },
    });
    if (event.processedAt) return;
    try {
      const { type } = webhookBody.parse(event.payload);
      if (type === 'payment' && event.resourceId) {
        await this.apply(await this.gateway.get(event.resourceId));
      }
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date(), error: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Webhook event ${eventId} failed: ${message}`);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { error: message.slice(0, 500) },
      });
    }
  }

  async processPendingWebhooks() {
    const pending = await this.prisma.webhookEvent.findMany({
      where: { processedAt: null, attempts: { lt: MAX_WEBHOOK_ATTEMPTS } },
      orderBy: { receivedAt: 'asc' },
      take: 50,
      select: { id: true },
    });
    for (const { id } of pending) await this.processEvent(id);
  }
}

function pixPayer({ name, email, cpf }: PixPayer) {
  const [firstName = name, ...rest] = name.trim().split(/\s+/);
  return {
    email,
    first_name: firstName,
    last_name: rest.join(' '),
    identification: { type: 'CPF', number: cpf },
  };
}
