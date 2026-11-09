import type { Metadata } from 'next';
import { OwnerDashboard } from '@/components/owner/OwnerDashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function OwnerDashboardPage() {
  return <OwnerDashboard />;
}
