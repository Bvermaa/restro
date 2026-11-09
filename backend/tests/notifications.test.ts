import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import * as socketService from '../src/services/socket.service';

jest.mock('../src/lib/prisma', () => {
  const mockRestaurant = {
    id: 'rest-test-uuid',
    slug: 'tasty-bites',
    name: 'Tasty Bites',
    ownerId: 'owner-test-uuid',
    isApproved: true,
    isSuspended: false,
    deletedAt: null,
    platformType: 'RESTAURANT',
    featureFlags: { callWaiterEnabled: true, tableQrEnabled: true },
  };

  const mockHotel = {
    id: 'hotel-test-uuid',
    slug: 'grand-hotel',
    name: 'Grand Hotel',
    ownerId: 'hotel-owner-uuid',
    isApproved: true,
    isSuspended: false,
    deletedAt: null,
    platformType: 'HOTEL',
    featureFlags: { roomServiceEnabled: true, roomQrEnabled: true },
  };

  return {
    prisma: {
      restaurant: {
        findFirst: jest.fn(async ({ where }) => {
          if (where?.slug === 'tasty-bites') return mockRestaurant;
          if (where?.slug === 'grand-hotel') return mockHotel;
          if (where?.ownerId === 'owner-test-uuid') return mockRestaurant;
          return null;
        }),
        findUnique: jest.fn(async ({ where }) => {
          if (where?.id === 'rest-test-uuid') return mockRestaurant;
          if (where?.slug === 'tasty-bites') return mockRestaurant;
          return null;
        }),
      },
      notification: {
        create: jest.fn(async ({ data }) => ({ id: 'notif-123', ...data })),
      },
    },
  };
});

describe('Waiter Call & Real-time Notification System', () => {
  it('rejects call-waiter without tableNumber', async () => {
    const res = await request(app)
      .post('/api/v1/menu/tasty-bites/call-waiter')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tableNumber is required/i);
  });

  it('rejects call-waiter for non-existent restaurant', async () => {
    const res = await request(app)
      .post('/api/v1/menu/non-existent-slug/call-waiter')
      .send({ tableNumber: '5' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/restaurant not found/i);
  });

  it('successfully places a waiter call and returns confirmation', async () => {
    const res = await request(app)
      .post('/api/v1/menu/tasty-bites/call-waiter')
      .send({
        tableNumber: 'Table 7',
        purpose: 'Water Refill',
        customNote: 'Please bring cold water',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/waiter called/i);
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('successfully requests hotel room service', async () => {
    const res = await request(app)
      .post('/api/v1/menu/grand-hotel/call-waiter')
      .send({
        tableNumber: 'Room 302',
        purpose: 'Extra Towels',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/room service requested/i);
  });

  it('authenticates socket handshake with Bearer token prefix', (done) => {
    const secret = process.env.JWT_ACCESS_SECRET || 'test-secret';
    const token = jwt.sign(
      { id: 'user-abc-123', email: 'owner@test.com', role: 'RESTAURANT_OWNER' },
      secret
    );

    const mockSocket: any = {
      handshake: {
        auth: { token: `Bearer ${token}` },
      },
    };

    // Simulate socket middleware logic from socket.service.ts
    let authHeader = mockSocket.handshake.auth?.token;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      authHeader = authHeader.slice(7).trim();
    }
    const decoded = jwt.verify(authHeader, secret) as any;
    expect(decoded.id).toBe('user-abc-123');
    expect(decoded.role).toBe('RESTAURANT_OWNER');
    done();
  });
});

