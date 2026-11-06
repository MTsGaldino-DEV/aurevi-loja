import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/checkout-form';

export const metadata: Metadata = {
  title: 'Finalizar compra',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutForm />;
}
