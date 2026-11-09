import { z } from 'zod';

export const guestCheckoutSchema = z.object({
  guestName: z.string().optional().or(z.literal('')),
  guestPhone: z.string().optional().or(z.literal('')),
  tableNumber: z.string().optional(),
  tableToken: z.string().optional(),
  paymentMethod: z.enum(['RAZORPAY', 'COD', 'PAY_TO_WAITER', 'UPI_INTENT']),
  isDirect: z.boolean().optional(),
  couponCode: z.string().optional(),
  restaurantSlug: z.string().min(1, 'Restaurant slug is required'),
  cartItems: z.array(
    z.object({
      menuItemId: z.string().cuid(),
      variantId: z.string().cuid().optional().nullable(),
      quantity: z.number().int().positive(),
      addOns: z.array(
        z.object({
          id: z.string().cuid(),
          name: z.string(),
          price: z.number().min(0),
        })
      ).default([]),
    })
  ).min(1, 'Cart cannot be empty'),
});

export const userCheckoutSchema = z.object({
  addressId: z.string().cuid('Invalid address ID').optional(),
  newAddress: z
    .object({
      label: z.string().min(1).max(50),
      flat: z.string().min(1),
      street: z.string().min(1),
      area: z.string().min(1),
      city: z.string().min(1),
      pincode: z.string().regex(/^\d{6}$/),
      isDefault: z.boolean().default(false),
    })
    .optional(),
  tableNumber: z.string().optional(),
  paymentMethod: z.enum(['RAZORPAY', 'COD', 'WALLET', 'PAY_TO_WAITER', 'UPI_INTENT']),
  couponCode: z.string().optional(),
  restaurantSlug: z.string().min(1),
  useWallet: z.boolean().default(false),
  usePoints: z.boolean().optional().default(false),
  cartItems: z.array(
    z.object({
      menuItemId: z.string().cuid(),
      variantId: z.string().cuid().optional().nullable(),
      quantity: z.number().int().positive(),
      addOns: z.array(
        z.object({
          id: z.string().cuid(),
          name: z.string(),
          price: z.number().min(0),
        })
      ).default([]),
    })
  ).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'CONFIRMED',
    'PREPARING',
    'BAKING',
    'READY',
    'ON_THE_WAY',
    'DELIVERED',
    'CANCELLED',
  ]).optional(),
  addOnStatus: z.enum([
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'BAKING',
    'READY',
    'ON_THE_WAY',
    'DELIVERED',
    'CANCELLED',
  ]).optional(),
  reason: z.string().max(500).optional(),
});

export const razorpayVerifySchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const walletTopUpSchema = z.object({
  amount: z.number().positive('Amount must be positive').min(10).max(10000),
});

export const walletVerifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  amount: z.number().positive(),
});

export const submitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export type GuestCheckoutInput = z.infer<typeof guestCheckoutSchema>;
export type UserCheckoutInput = z.infer<typeof userCheckoutSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type RazorpayVerifyInput = z.infer<typeof razorpayVerifySchema>;
export type WalletTopUpInput = z.infer<typeof walletTopUpSchema>;
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
