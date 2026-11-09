import type { Metadata } from 'next';
import { AdminCouponsPage } from '@/components/admin/AdminCouponsPage';

export const metadata: Metadata = { title: 'Coupons Management' };

export default function AdminCoupons() {
  return <AdminCouponsPage />;
}
