import { z } from 'zod';

export const couponSchema = z.object({
  code: z
    .string()
    .min(3, 'Code must be at least 3 characters')
    .max(20, 'Code must be at most 20 characters')
    .toUpperCase()
    .regex(/^[A-Z0-9]+$/, 'Code must contain only letters and numbers'),
  type: z.enum(['FLAT', 'PERCENT']),
  value: z.number().positive('Value must be positive'),
  minOrderAmount: z.number().min(0).default(0),
  maxDiscount: z.number().positive().optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const applyCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required'),
  restaurantSlug: z.string().min(1),
  cartTotal: z.number().positive(),
});

export type CouponInput = z.infer<typeof couponSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
