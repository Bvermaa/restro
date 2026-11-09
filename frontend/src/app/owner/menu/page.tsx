import type { Metadata } from 'next';
import { OwnerMenuPage } from '@/components/owner/OwnerMenuPage';

export const metadata: Metadata = { title: 'Menu Management' };

export default function OwnerMenu() {
  return <OwnerMenuPage />;
}
