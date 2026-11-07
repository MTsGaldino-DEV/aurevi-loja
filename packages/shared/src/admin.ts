import { z } from 'zod';
import { orderStatuses, type OrderStatus } from './order-status.ts';

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'Use ao menos 10 caracteres').max(200),
});

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const adminOrderListQuerySchema = z.object({
  // 'to_ship' = paid or preparing (the Início "pagos para enviar" count)
  status: z.union([z.enum(orderStatuses), z.literal('to_ship')]).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export const adminOrderStatusSchema = z
  .object({
    status: z.enum(['preparing', 'shipped', 'delivered']),
    carrier: z.string().trim().max(60).optional(),
    trackingCode: z.string().trim().min(1).max(60).optional(),
  })
  .refine((v) => v.status !== 'shipped' || v.trackingCode, {
    message: 'Informe o código de rastreio',
    path: ['trackingCode'],
  });
export type AdminOrderStatusInput = z.infer<typeof adminOrderStatusSchema>;

export const adminTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: [],
  paid: ['preparing', 'shipped'],
  preparing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  canceled: [],
  refunded: [],
};

export type AdminProfile = { id: string; email: string };

export type AdminOrderListItem = {
  number: number;
  customerName: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
};

export type AdminOrderList = {
  items: AdminOrderListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminOrderDetail = {
  number: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  items: {
    productName: string;
    variantLabel: string;
    sku: string;
    unitPriceCents: number;
    quantity: number;
  }[];
  customerSnapshot: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  shippingMethod: Record<string, unknown>;
  subtotalCents: number;
  discountCents: number;
  pixDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  couponCode: string | null;
  payments: {
    method: string;
    status: string;
    amountCents: number;
    installments: number | null;
    createdAt: string;
  }[];
  shipment: {
    carrier: string | null;
    service: string | null;
    trackingCode: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  reviewReason: string | null;
  notes: string | null;
};

export type AdminDashboard = {
  weekCents: number;
  monthCents: number;
  totalCents: number;
  toShipCount: number;
  pendingPaymentCount: number;
  lowStockCount: number;
};
