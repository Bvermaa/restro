import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The refresh token cookie is scoped to root (/) path on the backend.
// We rely on the Zustand auth store (localStorage) being checked on the client.
// This middleware simply exists as a hook for future server-side auth checks.

// For now, rely on client-side protection via useAuthStore checks in each component,
// and the API interceptor redirecting to /login on 401 responses.

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/owner/:path*',
  ],
};
