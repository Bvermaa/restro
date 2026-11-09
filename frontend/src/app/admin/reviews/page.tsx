import type { Metadata } from 'next';
import { AdminReviewsPage } from '@/components/admin/AdminReviewsPage';

export const metadata: Metadata = { title: 'Reviews Management' };

export default function AdminReviews() {
  return <AdminReviewsPage />;
}
