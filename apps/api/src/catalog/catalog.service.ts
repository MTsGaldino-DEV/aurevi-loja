import {
  type CategoryNode,
  PRODUCT_PAGE_SIZE,
  type ProductCard,
  type ProductDetail,
  type ProductList,
  type ProductQuery,
  type SizeChart,
  type StorefrontHome,
  type StorefrontLayout,
} from '@aurevi/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

const cardInclude = {
  images: { orderBy: { position: 'asc' }, take: 1 },
  variants: { where: { isActive: true }, select: { stockOnHand: true, stockReserved: true } },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

const toCard = (product: CardRow): ProductCard => {
  const image = product.images[0];
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    image: image
      ? { key: image.storageKey, alt: image.alt, width: image.width, height: image.height }
      : null,
    inStock: product.variants.some((v) => v.stockOnHand > v.stockReserved),
  };
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async layout(): Promise<StorefrontLayout> {
    const [categories, announcementMessages, storeInfo, max, min, pix, free] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: { position: 'asc' },
        select: { id: true, parentId: true, name: true, slug: true },
      }),
      this.settings.get('announcement_messages'),
      this.settings.get('store_info'),
      this.settings.get('max_interest_free_installments'),
      this.settings.get('min_installment_cents'),
      this.settings.get('pix_discount_percent'),
      this.settings.get('free_shipping_threshold_cents'),
    ]);
    const nodes: CategoryNode[] = categories
      .filter((category) => !category.parentId)
      .map((category) => ({
        name: category.name,
        slug: category.slug,
        children: categories
          .filter((child) => child.parentId === category.id)
          .map(({ name, slug }) => ({ name, slug })),
      }));
    return {
      categories: nodes,
      announcementMessages,
      storeInfo,
      payment: { maxInstallments: max, minInstallmentCents: min, pixDiscountPercent: pix },
      freeShippingThresholdCents: free,
    };
  }

  async home(): Promise<StorefrontHome> {
    const [hero, collections, newest] = await Promise.all([
      this.settings.get('home_hero'),
      this.settings.get('home_collections'),
      this.prisma.product.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: cardInclude,
      }),
    ]);
    return { hero, collections, newest: newest.map(toCard) };
  }

  async products(query: ProductQuery): Promise<ProductList> {
    const category = query.categoria
      ? await this.prisma.category.findFirst({
          where: { slug: query.categoria, isActive: true },
          select: { id: true, children: { select: { id: true } } },
        })
      : null;
    if (query.categoria && !category) throw new NotFoundException('Categoria não encontrada');

    const inCategory: Prisma.ProductWhereInput = {
      status: 'active',
      ...(category && {
        categoryId: { in: [category.id, ...category.children.map((child) => child.id)] },
      }),
    };
    const byOption = (name: string, values: string[]): Prisma.ProductVariantWhereInput[] =>
      values.length
        ? [{ optionValues: { some: { optionValue: { value: { in: values }, option: { name } } } } }]
        : [];
    const variantFilters = [...byOption('Cor', query.cor), ...byOption('Tamanho', query.tamanho)];
    const where: Prisma.ProductWhereInput = {
      ...inCategory,
      // ponytail: filters use the product price; add a computed price if variants start overriding it often.
      ...((query.min !== undefined || query.max !== undefined) && {
        priceCents: { gte: query.min, lte: query.max },
      }),
      // Color and size must match the same variant, so "Areia + M" never shows "Areia P / Cacau M".
      ...(variantFilters.length && {
        variants: {
          some: {
            isActive: true,
            stockOnHand: { gt: this.prisma.productVariant.fields.stockReserved },
            AND: variantFilters,
          },
        },
      }),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.ordem === 'menor-preco'
        ? { priceCents: 'asc' }
        : query.ordem === 'maior-preco'
          ? { priceCents: 'desc' }
          : { createdAt: 'desc' };

    const [items, total, facets] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        // Cumulative, so "show more" is a plain link that survives reload and the back button.
        take: query.pagina * PRODUCT_PAGE_SIZE,
        include: cardInclude,
      }),
      this.prisma.product.count({ where }),
      this.facets(inCategory),
    ]);
    return { items: items.map(toCard), total, facets };
  }

  // ponytail: counts ignore the other selected filters; narrow them when the catalog is large enough to matter.
  private async facets(inCategory: Prisma.ProductWhereInput): Promise<ProductList['facets']> {
    const rows = await this.prisma.productOption.findMany({
      orderBy: { position: 'asc' },
      select: {
        name: true,
        values: {
          orderBy: { position: 'asc' },
          select: {
            value: true,
            hex: true,
            variants: {
              where: { variant: { isActive: true, product: inCategory } },
              select: { variant: { select: { productId: true } } },
            },
          },
        },
      },
    });
    return rows.map((option) => ({
      name: option.name,
      values: option.values
        .map((value) => ({
          value: value.value,
          hex: value.hex,
          count: new Set(value.variants.map((link) => link.variant.productId)).size,
        }))
        .filter((value) => value.count > 0),
    }));
  }

  async product(slug: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'active' },
      include: {
        category: { select: { name: true, slug: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true },
          include: {
            optionValues: {
              include: { optionValue: { include: { option: true } } },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const related = await this.prisma.product.findMany({
      where: { status: 'active', categoryId: product.categoryId, id: { not: product.id } },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: cardInclude,
    });

    const options = new Map<
      string,
      {
        position: number;
        values: Map<string, { id: string; value: string; hex: string | null; position: number }>;
      }
    >();
    for (const variant of product.variants) {
      for (const { optionValue } of variant.optionValues) {
        const option = options.get(optionValue.option.name) ?? {
          position: optionValue.option.position,
          values: new Map(),
        };
        option.values.set(optionValue.id, {
          id: optionValue.id,
          value: optionValue.value,
          hex: optionValue.hex,
          position: optionValue.position,
        });
        options.set(optionValue.option.name, option);
      }
    }

    return {
      ...toCard({ ...product, images: product.images.slice(0, 1) }),
      description: product.description,
      composition: product.composition,
      sizeChart: product.sizeChart as SizeChart | null,
      modelInfo: product.modelInfo,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      category: product.category,
      options: [...options.entries()]
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([name, option]) => ({
          name,
          values: [...option.values.values()]
            .sort((a, b) => a.position - b.position)
            .map(({ id, value, hex }) => ({ id, value, hex })),
        })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        priceCents: variant.priceCents ?? product.priceCents,
        available: variant.stockOnHand > variant.stockReserved,
        optionValueIds: variant.optionValues.map((link) => link.optionValueId),
      })),
      images: product.images.map((image) => ({
        key: image.storageKey,
        alt: image.alt,
        width: image.width,
        height: image.height,
        optionValueId: image.optionValueId,
      })),
      related: related.map(toCard),
    };
  }

  async sitemap() {
    const [categories, products] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.product.findMany({
        where: { status: 'active' },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    return { categories, products };
  }
}
