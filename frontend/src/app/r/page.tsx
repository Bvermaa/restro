'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SelectRestaurantPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/scan-qr');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
