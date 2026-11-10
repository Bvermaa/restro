import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'EZ- Restaurant — Order. Track. Enjoy.',
    template: '%s | EZ- Restaurant',
  },
  description:
    'Scan a QR code, browse the menu, order food, and track your order in real time. No app install required. Powered by AI recommendations.',
  keywords: ['restaurant ordering', 'QR code menu', 'food delivery', 'online ordering', 'restaurant management'],
  authors: [{ name: 'EZ- Restaurant Platform' }],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://qrrestaurant.com',
    title: 'EZ- Restaurant — Order. Track. Enjoy.',
    description: 'Scan a QR code and order food seamlessly. No app required.',
    siteName: 'EZ- Restaurant',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EZ- Restaurant',
    description: 'Smart QR-based restaurant ordering platform.',
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${plusJakartaSans.variable} font-sans`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var handler = function(error) {
                  if (error && (error.name === 'ChunkLoadError' || 
                      /Loading chunk [\\s\\S]+ failed/.test(error.message) || 
                      /Loading CSS chunk/.test(error.message) ||
                      (error.message && error.message.indexOf('ChunkLoadError') !== -1))) {
                    var now = Date.now();
                    var lastReload = sessionStorage.getItem('last-chunk-reload');
                    if (!lastReload || (now - parseInt(lastReload, 10)) > 8000) {
                      sessionStorage.setItem('last-chunk-reload', now.toString());
                      window.location.reload();
                    }
                  }
                };
                window.addEventListener('error', function(event) {
                  handler(event.error || event);
                }, true);
                window.addEventListener('unhandledrejection', function(event) {
                  handler(event.reason);
                });
              })();
            `
          }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

