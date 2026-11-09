import type { Metadata } from 'next';
import { OwnerCustomizePage } from '@/components/owner/OwnerCustomizePage';

export const metadata: Metadata = { title: 'Customize Restaurant' };

export default function OwnerCustomize() {
  return <OwnerCustomizePage />;
}
