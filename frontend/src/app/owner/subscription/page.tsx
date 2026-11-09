import type { Metadata } from 'next';
import { OwnerSubscriptionPage } from '@/components/owner/OwnerSubscriptionPage';

export const metadata: Metadata = {
  title: 'Subscription Plans & Billing | Restaurant Portal',
  description: 'Manage your restaurant subscription tier, billing cycles, and plan benefits.',
};

export default function OwnerSubscriptionRoute() {
  return <OwnerSubscriptionPage />;
}
