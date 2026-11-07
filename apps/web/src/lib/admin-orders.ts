import type { OrderStatus } from '@aurevi/shared';

export const statusLabels: Record<OrderStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  preparing: 'Em preparação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
};

export const statusLabel = (status: string) => statusLabels[status as OrderStatus] ?? status;

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');
