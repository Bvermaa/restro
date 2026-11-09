import type { Metadata } from 'next';
import { AdminAnalyticsPage } from '@/components/admin/AdminAnalyticsPage';

export const metadata: Metadata = { title: 'Platform Analytics' };

export default function AdminAnalytics() {
  return <AdminAnalyticsPage />;
}
