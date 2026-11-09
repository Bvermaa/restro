'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import axios from 'axios';
import { useAuthStore, setInMemoryAccessToken } from '@/store/auth.store';
import { api, API_BASE_URL, reconnectSocketWithToken } from '@/services/api';

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { isBootstrapping, setBootstrapping, setUser, logout } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    // Clear legacy localStorage auth keys if present from previous architecture
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('qr-restaurant-auth');
      }
    } catch {}

    let isMounted = true;

    async function bootstrap() {
      try {
        // 1. Call POST /auth/refresh with HttpOnly cookie (runs through Next.js proxy rewrite)
        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const accessToken = refreshRes.data?.data?.accessToken as string | undefined;
        const initialUser = refreshRes.data?.data?.user;

        if (accessToken) {
          setInMemoryAccessToken(accessToken);
          reconnectSocketWithToken(accessToken);

          // 2. Fetch fresh user profile via authenticated /auth/me
          try {
            const meRes = await api.get('/auth/me');
            if (isMounted) {
              const fullUser = meRes.data?.data?.user || initialUser;
              setUser(fullUser, accessToken);
            }
          } catch {
            if (isMounted && initialUser) {
              setUser(initialUser, accessToken);
            }
          }
        } else {
          if (isMounted) logout();
        }
      } catch {
        if (isMounted) {
          logout();
        }
      } finally {
        if (isMounted && useAuthStore.getState().isBootstrapping) {
          setBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [setUser, logout, setBootstrapping]);

  const isProtectedRoute =
    pathname?.startsWith('/owner') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/kitchen');

  // Prevent flash-redirect on protected routes while initial refresh token resolution is in-flight
  if (isBootstrapping && isProtectedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-500">Authenticating session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
