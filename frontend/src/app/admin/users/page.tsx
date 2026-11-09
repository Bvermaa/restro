import type { Metadata } from 'next';
import { AdminUsersPage } from '@/components/admin/AdminUsersPage';

export const metadata: Metadata = { title: 'Users Management' };

export default function AdminUsers() {
  return <AdminUsersPage />;
}
