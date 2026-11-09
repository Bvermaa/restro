import type { Metadata } from 'next';
import { AdminRestaurantsPage } from '@/components/admin/AdminRestaurantsPage';

export const metadata: Metadata = { title: 'Restaurants Management' };

export default function AdminRestaurants() {
  return <AdminRestaurantsPage />;
}
