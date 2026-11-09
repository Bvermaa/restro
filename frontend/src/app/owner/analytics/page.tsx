import type { Metadata } from 'next';
import { OwnerAnalyticsPage } from '@/components/owner/OwnerAnalyticsPage';

export const metadata: Metadata = { title: 'Analytics' };

export default function OwnerAnalytics() {
  return <OwnerAnalyticsPage />;
}
