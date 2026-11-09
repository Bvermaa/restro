import { CheckoutPage } from '@/components/customer/CheckoutPage';
import { resolveTableToken } from '@qr-restaurant/shared';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string; t?: string; token?: string }>;
}

export default async function Checkout({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  let effectiveTable: string | undefined = undefined;
  let effectiveToken: string | undefined = undefined;
  let isTableVerified = false;

  // Resolve cryptographic table token
  const rawToken = resolvedSearchParams.t || resolvedSearchParams.token;
  if (rawToken) {
    const tokenResult = resolveTableToken(rawToken, slug);
    if (tokenResult.valid && tokenResult.tableNumber) {
      effectiveTable = tokenResult.tableNumber;
      effectiveToken = rawToken;
      isTableVerified = true;
    }
  }

  return (
    <CheckoutPage
      restaurantSlug={slug}
      tableNumber={effectiveTable}
      tableToken={effectiveToken}
      isTableVerified={isTableVerified}
    />
  );
}
