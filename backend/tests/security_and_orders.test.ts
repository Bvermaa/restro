import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import jwt from 'jsonwebtoken';

const ITEM_A_ID = 'cjld2cjxh0000qzrmn831i7r1';
const ITEM_B_ID = 'cjld2cjxh0000qzrmn831i7r2';
const ADDON_CHEESE_ID = 'cjld2cjxh0000qzrmn831i7r3';
const ORDER_A_ID = 'cjld2cjxh0000qzrmn831i7r4';
const ORDER_DELIVERED_ID = 'cjld2cjxh0000qzrmn831i7r5';

jest.mock('../src/lib/prisma', () => {
  const mockRestaurantA = {
    id: 'rest-a-uuid',
    slug: 'restaurant-a',
    name: 'Restaurant A',
    ownerId: 'owner-a-uuid',
    isApproved: true,
    isSuspended: false,
    deletedAt: null,
    isOpen: true,
    platformType: 'RESTAURANT',
    minOrderValue: 0,
    operatingHours: null,
    featureFlags: { tableQrEnabled: true, callWaiterEnabled: true },
  };

  const mockRestaurantB = {
    id: 'rest-b-uuid',
    slug: 'restaurant-b',
    name: 'Restaurant B',
    ownerId: 'owner-b-uuid',
    isApproved: true,
    isSuspended: false,
    deletedAt: null,
    isOpen: true,
    platformType: 'RESTAURANT',
    minOrderValue: 0,
    operatingHours: null,
    featureFlags: { tableQrEnabled: true, callWaiterEnabled: true },
  };

  const mockItemA = {
    id: 'cjld2cjxh0000qzrmn831i7r1',
    restaurantId: 'rest-a-uuid',
    name: 'Burger A',
    price: 150,
    isAvailable: true,
    deletedAt: null,
    variants: [],
    addOns: [
      { id: 'cjld2cjxh0000qzrmn831i7r3', name: 'Extra Cheese', price: 30 },
    ],
  };

  const mockItemB = {
    id: 'cjld2cjxh0000qzrmn831i7r2',
    restaurantId: 'rest-b-uuid',
    name: 'Pizza B',
    price: 300,
    isAvailable: true,
    deletedAt: null,
    variants: [],
    addOns: [],
  };

  const mockUsers: Record<string, any> = {
    'customer-a-uuid': {
      id: 'customer-a-uuid',
      name: 'Customer Alice',
      email: 'alice@test.com',
      role: 'CUSTOMER',
      verifyToken: null,
      walletBalance: 200,
      loyaltyPoints: 100,
    },
    'customer-b-uuid': {
      id: 'customer-b-uuid',
      name: 'Customer Bob',
      email: 'bob@test.com',
      role: 'CUSTOMER',
      verifyToken: null,
      walletBalance: 0,
      loyaltyPoints: 0,
    },
    'owner-b-uuid': {
      id: 'owner-b-uuid',
      name: 'Owner Bob',
      email: 'ownerb@test.com',
      role: 'RESTAURANT_OWNER',
      verifyToken: null,
      walletBalance: 0,
      loyaltyPoints: 0,
    },
    'kitchen-staff-uuid': {
      id: 'kitchen-staff-uuid',
      name: 'Kitchen Chef',
      email: 'kitchen@test.com',
      role: 'KITCHEN',
      verifyToken: null,
      kitchenRestaurantId: 'rest-a-uuid',
      walletBalance: 0,
      loyaltyPoints: 0,
    },
  };

  const mockOrderA = {
    id: 'cjld2cjxh0000qzrmn831i7r4',
    restaurantId: 'rest-a-uuid',
    userId: 'customer-a-uuid',
    status: 'PREPARING',
    paymentStatus: 'PENDING',
    paymentMethod: 'COD',
    total: 200,
    subtotal: 169.49,
    gstAmount: 30.51,
    deliveryFee: 0,
    packagingFee: 0,
    deletedAt: null,
    items: [],
  };

  const mockDeliveredOrder = {
    id: 'cjld2cjxh0000qzrmn831i7r5',
    restaurantId: 'rest-a-uuid',
    userId: 'customer-a-uuid',
    status: 'DELIVERED',
    paymentStatus: 'PENDING',
    paymentMethod: 'COD',
    total: 150,
    deletedAt: null,
  };

  return {
    prisma: {
      restaurant: {
        findFirst: jest.fn(async ({ where }) => {
          if (where?.id === 'rest-a-uuid' && where?.ownerId && where.ownerId !== 'owner-a-uuid') return null;
          if (where?.id === 'rest-b-uuid' && where?.ownerId && where.ownerId !== 'owner-b-uuid') return null;
          if (where?.slug === 'restaurant-a' || where?.id === 'rest-a-uuid') return mockRestaurantA;
          if (where?.slug === 'restaurant-b' || where?.id === 'rest-b-uuid') return mockRestaurantB;
          if (where?.ownerId === 'owner-a-uuid') return mockRestaurantA;
          if (where?.ownerId === 'owner-b-uuid') return mockRestaurantB;
          return null;
        }),
        findUnique: jest.fn(async ({ where }) => {
          if (where?.id === 'rest-a-uuid' || where?.slug === 'restaurant-a') return mockRestaurantA;
          if (where?.id === 'rest-b-uuid' || where?.slug === 'restaurant-b') return mockRestaurantB;
          return null;
        }),
      },
      menuItem: {
        findFirst: jest.fn(async ({ where }) => {
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r1') {
            if (where?.restaurantId && where.restaurantId !== 'rest-a-uuid') return null;
            return mockItemA;
          }
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r2') {
            if (where?.restaurantId && where.restaurantId !== 'rest-b-uuid') return null;
            return mockItemB;
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }) => {
          const items: any[] = [];
          if (where?.id?.in?.includes('cjld2cjxh0000qzrmn831i7r1')) {
            if (!where?.restaurantId || where.restaurantId === 'rest-a-uuid') items.push(mockItemA);
          }
          if (where?.id?.in?.includes('cjld2cjxh0000qzrmn831i7r2')) {
            if (!where?.restaurantId || where.restaurantId === 'rest-b-uuid') items.push(mockItemB);
          }
          return items;
        }),
      },
      order: {
        findFirst: jest.fn(async ({ where }) => {
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r4') {
            if (where?.restaurantId && where.restaurantId !== 'rest-a-uuid') return null;
            return mockOrderA;
          }
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r5') return mockDeliveredOrder;
          return null;
        }),
        findUnique: jest.fn(async ({ where }) => {
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r4') return mockOrderA;
          if (where?.id === 'cjld2cjxh0000qzrmn831i7r5') return mockDeliveredOrder;
          return null;
        }),
        update: jest.fn(async ({ where, data }) => {
          const target = where?.id === 'cjld2cjxh0000qzrmn831i7r4' ? mockOrderA : mockDeliveredOrder;
          Object.assign(target, data);
          return { ...target, updatedAt: new Date(), restaurant: mockRestaurantA };
        }),
        create: jest.fn(async ({ data }) => ({
          id: 'new-order-uuid',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
      orderItem: {
        createMany: jest.fn(async ({ data }) => ({ count: data.length })),
      },
      user: {
        findUnique: jest.fn(async ({ where }) => mockUsers[where?.id] || null),
        findFirst: jest.fn(async ({ where }) => mockUsers[where?.id] || null),
        update: jest.fn(async ({ where, data }) => {
          const u = mockUsers[where?.id];
          if (u) Object.assign(u, data);
          return u;
        }),
      },
      cartItem: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        delete: jest.fn(async () => ({})),
      },
      coupon: {
        findFirst: jest.fn(async () => null),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'pay-123', ...data })),
      },
      notification: {
        create: jest.fn(async ({ data }) => ({ id: 'notif-123', ...data })),
      },
      systemSetting: {
        findUnique: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (cb: any) => cb((prisma as any))),
    },
  };
});

describe('Security, Orders, Cart & Kitchen Audits', () => {
  const secret = process.env.JWT_ACCESS_SECRET || 'test-secret';
  const customerAToken = jwt.sign(
    { id: 'customer-a-uuid', email: 'alice@test.com', role: 'CUSTOMER' },
    secret
  );
  const customerBToken = jwt.sign(
    { id: 'customer-b-uuid', email: 'bob@test.com', role: 'CUSTOMER' },
    secret
  );
  const ownerBToken = jwt.sign(
    { id: 'owner-b-uuid', email: 'ownerb@test.com', role: 'RESTAURANT_OWNER' },
    secret
  );

  describe('1. Price Tampering & Cart Validation', () => {
    it('rejects order with empty cart', async () => {
      const res = await request(app)
        .post('/api/v1/orders/guest')
        .send({
          restaurantSlug: 'restaurant-a',
          cartItems: [],
          paymentMethod: 'COD',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cart cannot be empty/i);
    });

    it('rejects invalid or negative quantity in order', async () => {
      const res = await request(app)
        .post('/api/v1/orders/guest')
        .send({
          restaurantSlug: 'restaurant-a',
          cartItems: [{ menuItemId: ITEM_A_ID, quantity: -2 }],
          paymentMethod: 'COD',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/greater than 0|invalid.*quantity/i);
    });

    it('prevents cross-tenant item ordering (ordering item from Restaurant B at Restaurant A)', async () => {
      const res = await request(app)
        .post('/api/v1/orders/guest')
        .send({
          restaurantSlug: 'restaurant-a',
          cartItems: [{ menuItemId: ITEM_B_ID, quantity: 1 }],
          paymentMethod: 'COD',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found.*unavailable|another restaurant/i);
    });

    it('enforces server-side add-on prices and ignores client price tampering', async () => {
      // Client tries to claim Extra Cheese (DB price 30) is 0
      const res = await request(app)
        .post('/api/v1/orders/guest')
        .send({
          restaurantSlug: 'restaurant-a',
          cartItems: [
            {
              menuItemId: ITEM_A_ID,
              quantity: 1,
              addOns: [{ id: ADDON_CHEESE_ID, name: 'Extra Cheese', price: 0 }],
            },
          ],
          paymentMethod: 'COD',
        });
      expect(res.status).toBe(201);
      // Item price = 150 + DB addon price 30 = 180 subtotal. 180 + 18% GST (32.4) = 212.4
      expect(res.body.data.order.total).toBe(212.4);
    });
  });

  describe('2. IDOR & Tenant Isolation', () => {
    it('prevents Customer B from viewing Customer A order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${ORDER_A_ID}`)
        .set('Authorization', `Bearer ${customerBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    it('prevents unauthenticated guest from viewing authenticated customer order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${ORDER_A_ID}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('prevents Owner of Restaurant B from accessing Restaurant A order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${ORDER_A_ID}`)
        .set('Authorization', `Bearer ${ownerBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied.*do not own/i);
    });
  });

  describe('3. Order Lifecycle & Add-ons Integrity', () => {
    it('prevents adding items to a DELIVERED order', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${ORDER_DELIVERED_ID}/add-items`)
        .send({
          cartItems: [{ menuItemId: ITEM_A_ID, quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot add items to an order that is delivered/i);
    });
  });

  describe('4. Kitchen Order Status & Payment Decoupling', () => {
    it('does NOT mark order as PAID when kitchen updates status to DELIVERED', async () => {
      const kitchenToken = jwt.sign(
        { id: 'kitchen-staff-uuid', role: 'KITCHEN', kitchenRestaurantId: 'rest-a-uuid' },
        secret
      );

      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${ORDER_A_ID}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'DELIVERED' });

      expect(res.status).toBe(200);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ paymentStatus: 'PAID' }),
        })
      );
    });
  });

  describe('5. Payment Webhook Security', () => {
    it('rejects unauthorized payment verification without webhook secret', async () => {
      const res = await request(app)
        .post('/api/v1/payments/verify-upi')
        .send({
          orderId: ORDER_A_ID,
          receivedAmount: 200,
        });
      // Should reject with 401 Unauthorized
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized.*webhook.*secret/i);
    });
  });
});
