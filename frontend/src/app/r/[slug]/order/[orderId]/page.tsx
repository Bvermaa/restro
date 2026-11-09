import { OrderTrackingPage } from '@/components/customer/OrderTrackingPage';

interface PageProps {
  params: Promise<{ slug: string; orderId: string }>;
}

export default async function OrderTracking({ params }: PageProps) {
  const { slug, orderId } = await params;
  return <OrderTrackingPage orderId={orderId} restaurantSlug={slug} />;
}
