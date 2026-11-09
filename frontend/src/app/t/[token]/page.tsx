import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveTableToken } from '@qr-restaurant/shared';
import { AlertCircle, QrCode } from 'lucide-react';

interface TableQrPageProps {
  params: Promise<{ token: string }>;
}

export default async function TableQrRedirectPage({ params }: TableQrPageProps) {
  const { token } = await params;
  const result = resolveTableToken(token);

  if (result.valid && result.slug) {
    // Valid table token: redirect to the menu with verified table session
    redirect(`/r/${result.slug}?t=${encodeURIComponent(token)}`);
  }

  // Invalid or tampered table token
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-destructive/20 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center border border-destructive/20">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Invalid Table QR Code</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This table QR code is invalid, modified, or expired. Please scan the physical QR code on your dining table to access dine-in ordering.
        </p>
        <div className="pt-2">
          <Link
            href="/scan-qr"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-md"
          >
            <QrCode className="w-4 h-4" />
            Scan Table QR Again
          </Link>
        </div>
      </div>
    </div>
  );
}
