import type { Metadata } from 'next';
import { OwnerOrdersPage } from '@/components/owner/OwnerOrdersPage';

export const metadata: Metadata = { title: 'Orders' };

export default function OwnerOrders() {
  return <OwnerOrdersPage />;
}
