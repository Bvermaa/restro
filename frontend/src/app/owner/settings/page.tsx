import type { Metadata } from 'next';
import { OwnerSettingsPage } from '@/components/owner/OwnerSettingsPage';

export const metadata: Metadata = { title: 'Settings' };

export default function OwnerSettings() {
  return <OwnerSettingsPage />;
}
