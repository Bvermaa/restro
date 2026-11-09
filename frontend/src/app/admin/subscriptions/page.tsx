import type { Metadata } from 'next';
import { AdminSubscriptionsPage } from '@/components/admin/AdminSubscriptionsPage';

export const metadata: Metadata = { title: 'Subscriptions Management' };

export default function AdminSubscriptions() {
  return <AdminSubscriptionsPage />;
}
