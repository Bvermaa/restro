import type { Metadata } from 'next';
import { OwnerReviewsPage } from '@/components/owner/OwnerReviewsPage';

export const metadata: Metadata = { title: 'Reviews' };

export default function OwnerReviews() {
  return <OwnerReviewsPage />;
}
