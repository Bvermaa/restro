import type { Metadata } from 'next';
import { OwnerCouponsPage } from '@/components/owner/OwnerCouponsPage';

export const metadata: Metadata = { title: 'Coupons' };

export default function OwnerCoupons() {
  return <OwnerCouponsPage />;
}
