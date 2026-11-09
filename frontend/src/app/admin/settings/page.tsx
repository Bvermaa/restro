import type { Metadata } from 'next';
import { AdminSettingsPage } from '@/components/admin/AdminSettingsPage';

export const metadata: Metadata = { title: 'Platform Settings' };

export default function AdminSettings() {
  return <AdminSettingsPage />;
}
