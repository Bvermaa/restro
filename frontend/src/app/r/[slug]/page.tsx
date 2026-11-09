import type { Metadata } from 'next';
import { RestaurantMenuPage } from '@/components/customer/RestaurantMenuPage';
import { resolveTableToken, generateTableToken } from '@qr-restaurant/shared';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    table?: string;
    t?: string;
    token?: string;
    preview?: string;
    themeColor?: string;
    name?: string;
    description?: string;
    logo?: string;
    banner?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Menu — ${slug}`,
    description: `Browse the full menu at this restaurant and order online via QR code.`,
  };
}

export default async function MenuPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  let effectiveTable: string | undefined = undefined;
  let effectiveToken: string | undefined = undefined;
  let isTableVerified = false;

  // 1. Verify cryptographic table token (?t=... or ?token=...)
  const rawToken = resolvedSearchParams.t || resolvedSearchParams.token;
  if (rawToken) {
    const tokenResult = resolveTableToken(rawToken, slug);
    if (tokenResult.valid && tokenResult.tableNumber) {
      effectiveTable = tokenResult.tableNumber;
      effectiveToken = rawToken;
      isTableVerified = true;
    }
  }

  // 2. Owner preview in dashboard
  if (!isTableVerified && resolvedSearchParams.preview === 'true') {
    effectiveTable = resolvedSearchParams.table;
    effectiveToken = resolvedSearchParams.table ? generateTableToken(slug, resolvedSearchParams.table) : undefined;
    isTableVerified = true;
  }

  // 3. Table parameter directly provided (?table=5)
  if (!isTableVerified && resolvedSearchParams.table) {
    effectiveTable = resolvedSearchParams.table;
    effectiveToken = generateTableToken(slug, resolvedSearchParams.table);
    isTableVerified = true;
  }

  return (
    <RestaurantMenuPage
      slug={slug}
      tableNumber={effectiveTable}
      tableToken={effectiveToken}
      isTableVerified={isTableVerified}
      searchParams={{
        ...resolvedSearchParams,
        table: effectiveTable,
        token: effectiveToken,
      }}
    />
  );
}
