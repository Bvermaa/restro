import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { api } from '../src/services/api';
import { useAuthStore, setInMemoryAccessToken } from '../src/store/auth.store';

describe('Frontend Single-Flight Token Refresh Interceptor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().logout();
    setInMemoryAccessToken(null);
  });

  it('10 parallel 401s trigger exactly one refresh call', async () => {
    // Spy on axios.post to intercept calls to /auth/refresh
    let refreshCallCount = 0;
    const refreshSpy = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.toString().includes('/auth/refresh')) {
        refreshCallCount++;
        // Simulate async network latency so parallel requests queue up
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          status: 200,
          data: {
            success: true,
            data: {
              accessToken: 'mocked-fresh-access-token-999',
              user: { id: 'u-123', name: 'Test User', email: 'user@test.com', role: 'CUSTOMER' },
            },
          },
        } as any;
      }
      return { status: 200, data: {} } as any;
    });

    // Custom Axios adapter simulating an API server
    // First attempt (no or old token): returns 401
    // Second attempt (with refreshed Bearer token): returns 200
    api.defaults.adapter = async (config) => {
      const authHeader = config.headers?.Authorization || (config.headers as any)?.authorization;

      if (authHeader === 'Bearer mocked-fresh-access-token-999') {
        return {
          data: { success: true, message: 'Resource loaded successfully' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      // Simulate 401 Unauthorized from backend
      const error = new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        config,
        {},
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          data: { error: 'Token expired or invalid', code: 'TOKEN_EXPIRED' },
        } as any
      );
      throw error;
    };

    // Set initial expired/dummy token
    setInMemoryAccessToken('expired-stale-token');

    // Fire 10 parallel protected requests simultaneously
    const parallelRequests = Array.from({ length: 10 }, (_, index) =>
      api.get(`/api/v1/protected/resource-${index}`)
    );

    const responses = await Promise.all(parallelRequests);

    // Verify all 10 requests completed successfully after retry
    expect(responses).toHaveLength(10);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    // CRITICAL: Exactly ONE refresh call must have occurred
    expect(refreshCallCount).toBe(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Verify token was stored in memory and store
    expect(useAuthStore.getState().accessToken).toBe('mocked-fresh-access-token-999');
  });
});
