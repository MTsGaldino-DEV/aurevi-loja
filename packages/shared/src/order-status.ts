export const orderStatuses = [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'canceled',
  'refunded',
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
