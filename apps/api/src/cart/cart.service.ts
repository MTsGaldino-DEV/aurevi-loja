import { type CartView, computeTotals, couponProblem, type ShippingOption } from '@aurevi/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ShippingService } from '../shipping/shipping.service.js';
import { CART_DAYS } from './cart.cookie.js';

const cartInclude = {
  coupon: true,
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { position: 'asc' } } } },
          optionValues: { include: { optionValue: { include: { option: true } } } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly shipping: ShippingService,
  ) {}

  private find(token: string | undefined) {
    return token
      ? this.prisma.cart.findUnique({ where: { token }, include: cartInclude })
      : Promise.resolve(null);
  }

  private async ensureCart(token: string | undefined, createToken: () => string) {
    const existing = token && (await this.prisma.cart.findUnique({ where: { token } }));
    if (existing) return existing;
    return this.prisma.cart.create({
      data: {
        token: createToken(),
        expiresAt: new Date(Date.now() + CART_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  async view(token: string | undefined): Promise<CartView> {
    const [cart, threshold, pix, maxInstallments, minInstallmentCents] = await Promise.all([
      this.find(token),
      this.settings.get('free_shipping_threshold_cents'),
      this.settings.get('pix_discount_percent'),
      this.settings.get('max_interest_free_installments'),
      this.settings.get('min_installment_cents'),
    ]);
    const items = (cart?.items ?? []).map((item) => this.toItem(item));
    const subtotalCents = items.reduce((sum, item) => sum + item.lineCents, 0);
    const problem = cart?.coupon ? couponProblem(cart.coupon, subtotalCents, new Date()) : null;
    const coupon = problem ? null : (cart?.coupon ?? null);
    const { discountCents, merchandiseCents } = computeTotals({
      subtotalCents,
      coupon,
      shippingCents: 0,
      pixDiscountPercent: 0,
    });
    return {
      items,
      subtotalCents,
      discountCents,
      merchandiseCents,
      coupon: coupon && { code: coupon.code, type: coupon.type },
      couponProblem: problem,
      freeShippingThresholdCents: threshold,
      pixDiscountPercent: pix,
      maxInstallments,
      minInstallmentCents,
    };
  }

  private toItem(item: CartRow['items'][number]): CartView['items'][number] {
    const { variant } = item;
    const links = [...variant.optionValues].sort(
      (a, b) => a.optionValue.option.position - b.optionValue.option.position,
    );
    const colorIds = new Set(links.map((link) => link.optionValueId));
    // The photo of the chosen color, when there is one.
    const image =
      variant.product.images.find((i) => i.optionValueId && colorIds.has(i.optionValueId)) ??
      variant.product.images[0];
    const unitPriceCents = variant.priceCents ?? variant.product.priceCents;
    return {
      id: item.id,
      variantId: variant.id,
      productName: variant.product.name,
      slug: variant.product.slug,
      variantLabel: links.map((link) => link.optionValue.value).join(' / '),
      unitPriceCents,
      quantity: item.quantity,
      lineCents: unitPriceCents * item.quantity,
      imageKey: image?.storageKey ?? null,
      imageAlt: image?.alt ?? '',
      available:
        variant.isActive &&
        variant.product.status === 'active' &&
        variant.stockOnHand - variant.stockReserved >= item.quantity,
    };
  }

  async addItem(
    token: string | undefined,
    createToken: () => string,
    variantId: string,
    quantity: number,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, isActive: true, product: { status: 'active' } },
    });
    if (!variant) throw new NotFoundException('Peça não encontrada');
    const cart = await this.ensureCart(token, createToken);
    const current = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const wanted = (current?.quantity ?? 0) + quantity;
    if (variant.stockOnHand - variant.stockReserved < wanted) {
      throw new ConflictException('Não há mais unidades desta peça.');
    }
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity: wanted },
      update: { quantity: wanted },
    });
    return this.view(cart.token);
  }

  // Scoped by cart, so a guessed item id cannot change someone else's bag.
  async updateItem(token: string | undefined, itemId: string, quantity: number) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { token: token ?? '' } },
      include: { variant: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.variant.stockOnHand - item.variant.stockReserved < quantity) {
      throw new ConflictException('Não há mais unidades desta peça.');
    }
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.view(token);
  }

  async removeItem(token: string | undefined, itemId: string) {
    await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cart: { token: token ?? '' } },
    });
    return this.view(token);
  }

  async applyCoupon(token: string | undefined, createToken: () => string, code: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw new ConflictException('Cupom não encontrado.');
    const cart = await this.ensureCart(token, createToken);
    const before = await this.view(cart.token);
    const problem = couponProblem(coupon, before.subtotalCents, new Date());
    if (problem) throw new ConflictException(problem);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    return this.view(cart.token);
  }

  async removeCoupon(token: string | undefined) {
    if (token) await this.prisma.cart.updateMany({ where: { token }, data: { couponId: null } });
    return this.view(token);
  }

  async quote(token: string | undefined, postalCode: string): Promise<ShippingOption[]> {
    const cart = await this.view(token);
    return this.shipping.quote(
      postalCode,
      cart.merchandiseCents,
      cart.coupon?.type === 'free_shipping',
    );
  }
}
