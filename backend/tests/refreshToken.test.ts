import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashToken } from '../src/services/refreshToken.service';

const getCookies = (res: any): string[] => {
  const header = res.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
};

// Mock Prisma for deterministic, isolated unit testing
jest.mock('../src/lib/prisma', () => {
  const mockTokens: any[] = [];
  const mockSessions: any[] = [];
  const testUser = {
    id: 'test-user-uuid-123',
    name: 'Staff Admin',
    email: 'admin@restaurant.com',
    passwordHash: '',
    role: 'RESTAURANT_OWNER',
    isVerified: true,
    loyaltyPoints: 0,
    walletBalance: 0,
    verifyToken: null,
    deletedAt: null,
    kitchenRestaurantId: null,
  };

  return {
    prisma: {
      user: {
        findFirst: jest.fn(async ({ where }) => {
          if (where?.email?.includes('admin@restaurant.com') || where?.id === testUser.id) {
            return testUser;
          }
          return null;
        }),
        update: jest.fn(async () => testUser),
      },
      restaurant: {
        findFirst: jest.fn(async () => ({ id: 'rest-123', maxLogins: 5, platformType: 'RESTAURANT' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activeSession: {
        findMany: jest.fn(async () => mockSessions),
        create: jest.fn(async ({ data }) => {
          mockSessions.push(data);
          return data;
        }),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      refreshToken: {
        create: jest.fn(async ({ data }) => {
          const rec = { id: `token-${Date.now()}-${Math.random()}`, revokedAt: null, replacedById: null, ...data };
          mockTokens.push(rec);
          return rec;
        }),
        findUnique: jest.fn(async ({ where }) => {
          const found = mockTokens.find((t) => t.tokenHash === where.tokenHash);
          if (!found) return null;
          return {
            ...found,
            user: testUser,
          };
        }),
        update: jest.fn(async ({ where, data }) => {
          const found = mockTokens.find((t) => t.id === where.id);
          if (found) {
            Object.assign(found, data);
            return found;
          }
          return null;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          mockTokens.forEach((t) => {
            if (where.familyId && t.familyId === where.familyId) {
              Object.assign(t, data);
              count++;
            } else if (where.userId && t.userId === where.userId) {
              Object.assign(t, data);
              count++;
            }
          });
          return { count };
        }),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(async (cb: any) => cb((prisma as any))),
    },
    __mockTokens: mockTokens,
    __testUser: testUser,
  };
});

describe('Refresh Token Authentication Endpoints', () => {
  beforeAll(async () => {
    const { __testUser } = require('../src/lib/prisma');
    __testUser.passwordHash = await bcrypt.hash('CorrectPassword@123', 10);
  });

  // TEST 1: Login sets rt cookie with HttpOnly and returns an access token
  it('1. login sets rt cookie with HttpOnly and returns an access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@restaurant.com',
        password: 'CorrectPassword@123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    // Refresh token must NEVER appear in the response body
    expect(res.body.data.refreshToken).toBeUndefined();

    // Check Set-Cookie header
    const cookies = getCookies(res);
    expect(cookies.length).toBeGreaterThan(0);
    const rtCookie = cookies.find((c: string) => c.startsWith('rt='));
    expect(rtCookie).toBeDefined();
    expect(rtCookie).toContain('HttpOnly');
    expect(rtCookie).toContain('Path=/api/v1/auth');
    expect(rtCookie).toContain('SameSite=Lax');
  });

  // TEST 2: Refresh rotates the token and the old token fails
  it('2. refresh rotates the token and the old token fails', async () => {
    // Step 1: Login to get the initial cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@restaurant.com',
        password: 'CorrectPassword@123',
      });

    const cookieHeader = getCookies(loginRes);
    const initialRtCookie = cookieHeader.find((c: string) => c.startsWith('rt='))!;
    const initialRawToken = initialRtCookie.split(';')[0]; // "rt=..."

    // Step 2: Call /refresh with the initial cookie
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [initialRawToken]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    // New rotated cookie must be issued
    const rotatedCookies = getCookies(refreshRes);
    const newRtCookie = rotatedCookies.find((c: string) => c.startsWith('rt='))!;
    expect(newRtCookie).toBeDefined();
    expect(newRtCookie).not.toEqual(initialRtCookie);

    // Step 3: Old token used again must FAIL (detected as reuse/revoked)
    const oldTokenReusedRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [initialRawToken]);

    expect(oldTokenReusedRes.status).toBe(401);
  });

  // TEST 3: Reused (revoked) token revokes the whole family
  it('3. reused (revoked) token revokes the whole family', async () => {
    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@restaurant.com',
        password: 'CorrectPassword@123',
      });

    const rtCookie1 = getCookies(loginRes).find((c: string) => c.startsWith('rt='))!.split(';')[0];

    // Refresh 1: rotates from token 1 -> token 2
    const refresh1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rtCookie1]);

    expect(refresh1.status).toBe(200);
    const rtCookie2 = getCookies(refresh1).find((c: string) => c.startsWith('rt='))!.split(';')[0];

    // Attacker replays token 1
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rtCookie1]);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.code).toBe('REFRESH_TOKEN_REUSED');

    // Legitimate user tries to use token 2, but the whole family was revoked
    const legitimateAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rtCookie2]);

    expect(legitimateAttempt.status).toBe(401);
  });

  // TEST 4: Expired token returns 401
  it('4. expired token returns 401', async () => {
    const { prisma } = require('../src/lib/prisma');
    const expiredRawToken = crypto.randomBytes(64).toString('base64url');
    const expiredHash = hashToken(expiredRawToken);

    // Insert manually expired token in mock
    await prisma.refreshToken.create({
      data: {
        tokenHash: expiredHash,
        familyId: 'family-expired-999',
        userId: 'test-user-uuid-123',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`rt=${expiredRawToken}`]);

    expect(res.status).toBe(401);
  });

  // TEST 5: Logout clears the cookie and revokes the token
  it('5. logout clears the cookie and revokes the token', async () => {
    const { __mockTokens } = require('../src/lib/prisma');

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@restaurant.com',
        password: 'CorrectPassword@123',
      });

    const rtCookie = getCookies(loginRes).find((c: string) => c.startsWith('rt='))!.split(';')[0];
    const rawVal = rtCookie.replace('rt=', '');
    const tokenHash = hashToken(rawVal);

    // Logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [rtCookie]);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Cookie cleared
    const setCookies = getCookies(logoutRes);
    const clearedRt = setCookies.find((c: string) => c.startsWith('rt=;'));
    expect(clearedRt).toBeDefined();

    // Token record must be revoked
    const record = __mockTokens.find((t: any) => t.tokenHash === tokenHash);
    expect(record?.revokedAt).not.toBeNull();
  });
});
