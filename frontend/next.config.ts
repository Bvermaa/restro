import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  // Explicitly set the monorepo root so Next.js doesn't pick the wrong
  // workspace root when multiple lockfiles exist on the machine.
  outputFileTracingRoot: path.join(__dirname, '../'),

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.qrserver.com' },
      { protocol: 'http', hostname: 'localhost', port: '4000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '4000' },
      { protocol: 'http', hostname: 'backend', port: '4000' },
    ],
  },

  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'localhost:3002', 'ezrestro.online', '*.ezrestro.online'],
    },
  },

  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      sonner: path.resolve(__dirname, 'src/lib/sonner-mock.tsx'),
    };
    return config;
  },

  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:4000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl.replace(/\/+$/, '')}/api/v1/:path*`,
      },
      {
        source: '/socket.io',
        destination: `${backendUrl.replace(/\/+$/, '')}/socket.io/`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl.replace(/\/+$/, '')}/socket.io/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
