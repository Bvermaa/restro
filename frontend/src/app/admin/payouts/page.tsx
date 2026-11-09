import type { Metadata } from 'next';
import { AdminPayoutsPage } from '@/components/admin/AdminPayoutsPage';

export const metadata: Metadata = { title: 'Payouts Management' };

export default function AdminPayouts() {
  return <AdminPayoutsPage />;
}
