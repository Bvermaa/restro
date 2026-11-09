import axios, { AxiosError } from 'axios';
import type { Socket } from 'socket.io-client';
import { useAuthStore, getInMemoryAccessToken, setInMemoryAccessToken } from '@/store/auth.store';

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipToast?: boolean;
    _retry?: boolean;
  }
}

function sanitizeApiUrl(url: string): string {
  let clean = url.trim().replace(/\/+$/, '');
  while (clean.endsWith('/api/v1/api/v1')) {
    clean = clean.slice(0, -7);
  }
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== 'undefined') {
    // In the browser, prefer the relative Next.js rewrite proxy /api/v1 so cookies stay first-party
    if (!envUrl || envUrl === '/api/v1' || envUrl.startsWith('/')) {
      return '/api/v1';
    }

    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Live Render deployment resolution
    if (hostname.includes('.onrender.com')) {
      if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
        const serverHostname = hostname.replace('-web', '-server');
        return `${protocol}//${serverHostname}/api/v1`;
      }
    }

    // Local development fallback
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (envUrl && !envUrl.includes('localhost')) {
        return sanitizeApiUrl(envUrl);
      }
      return '/api/v1';
    }

    // Custom domain
    if (envUrl && !envUrl.includes('localhost')) {
      return sanitizeApiUrl(envUrl);
    }

    return '/api/v1';
  }

  // Fallback for SSR or build time
  if (envUrl && !envUrl.startsWith('/')) {
    return sanitizeApiUrl(envUrl);
  }

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  return `${backendUrl.replace(/\/+$/, '')}/api/v1`;
}

export const API_BASE_URL = getApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor — attach in-memory access token & fix FormData content-type header
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
    delete (config.headers as any)['content-type'];
  }
  const token = getInMemoryAccessToken() || useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh mutex shared across parallel requests
let refreshPromise: Promise<string> | null = null;

export async function executeRefreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );

      const newToken = response.data?.data?.accessToken as string;
      const refreshedUser = response.data?.data?.user;

      if (!newToken) {
        throw new Error('Refresh response did not contain access token.');
      }

      setInMemoryAccessToken(newToken);
      if (refreshedUser) {
        useAuthStore.getState().setUser(refreshedUser, newToken);
      } else {
        useAuthStore.getState().setAccessToken(newToken);
      }

      reconnectSocketWithToken(newToken);
      return newToken;
    } catch (refreshErr) {
      setInMemoryAccessToken(null);
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        if (
          (currentPath.startsWith('/owner') || currentPath.startsWith('/admin') || currentPath.startsWith('/kitchen')) &&
          !currentPath.includes('/login')
        ) {
          window.location.replace('/login');
        }
      }
      throw refreshErr;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Response interceptor — handle 401 and perform single-flight refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error: string; code: string }>) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    const url = originalRequest?.url || '';

    const isAuthUrl =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthUrl) {
      originalRequest._retry = true;

      const currentToken = getInMemoryAccessToken();
      const { isAuthenticated, isBootstrapping } = useAuthStore.getState();
      if (!currentToken && !isAuthenticated && !isBootstrapping) {
        return Promise.reject(error);
      }

      try {
        const newToken = await executeRefreshToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Socket.io connection helper and token synchronizer
const activeSockets = new Set<Socket>();

export function registerSocket(socket: Socket): () => void {
  activeSockets.add(socket);
  return () => {
    activeSockets.delete(socket);
  };
}

export function reconnectSocketWithToken(newToken: string): void {
  activeSockets.forEach((sock) => {
    try {
      if (sock.auth && typeof sock.auth === 'object') {
        (sock.auth as any).token = `Bearer ${newToken}`;
      } else {
        sock.auth = { token: `Bearer ${newToken}` };
      }
      if (sock.connected) {
        sock.disconnect().connect();
      }
    } catch (e) {
      console.warn('Failed to reconnect socket with new token:', e);
    }
  });
}

export function getSocketUrl(): string {
  if (typeof window !== 'undefined') {
    const envSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (envSocketUrl && !envSocketUrl.includes('localhost')) {
      return envSocketUrl.replace(/\/+$/, '');
    }

    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    if (hostname.includes('.onrender.com')) {
      const serverHostname = hostname.replace('-web', '-server');
      return `${protocol}//${serverHostname}`;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }

    return `${window.location.origin}`;
  }

  const envSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
  return envSocket ? envSocket.replace(/\/+$/, '') : 'http://localhost:4000';
}

export default api;
