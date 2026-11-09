import { z } from 'zod';

const operatingHoursDaySchema = z.object({
  open: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM format'),
  close: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM format'),
  closed: z.boolean().default(false),
});

export const restaurantProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200).optional(),
  slug: z
    .string()
    .min(3, 'URL code must be at least 3 characters')
    .max(80, 'URL code must be at most 80 characters')
    .regex(/^[a-z0-9-]+$/, 'URL code can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  cuisineType: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  pincode: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || /^\d{5,8}$/.test(val.trim()), { message: 'Pincode must be valid (5-8 digits)' }),
  phone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^\+?\d{1,4}?[\s\-]?(?:\(?\d{1,4}\)?[\s\-]?)?\d{6,14}$/.test(val.trim().replace(/[\s\-]/g, '')) || /^\d{10,12}$/.test(val.trim().replace(/[^\d]/g, '')),
      { message: 'Please enter a valid phone number' }
    ),
  deliveryRadius: z.number().positive().max(100).optional().nullable(),
  minOrderValue: z.number().min(0).optional().nullable().default(0),
  hasDelivery: z.boolean().optional(),
  themeColor: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val), { message: 'Must be a valid hex color' }),
  menuTemplate: z.string().optional().nullable(),
  customFields: z
    .array(
      z.object({
        id: z.string(),
        key: z.string(),
        value: z.string(),
        icon: z.string(),
      })
    )
    .optional()
    .nullable(),
  operatingHours: z
    .object({
      monday: operatingHoursDaySchema,
      tuesday: operatingHoursDaySchema,
      wednesday: operatingHoursDaySchema,
      thursday: operatingHoursDaySchema,
      friday: operatingHoursDaySchema,
      saturday: operatingHoursDaySchema,
      sunday: operatingHoursDaySchema,
    })
    .optional()
    .nullable(),
  paymentQrCode: z.string().optional().nullable(),
  paymentUpiId: z.string().optional().nullable(),
  paymentPhone: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  bankAccountHolder: z.string().optional().nullable(),
  qrSettings: z.any().optional().nullable(),
});

export const restaurantToggleSchema = z.object({
  isOpen: z.boolean(),
});

export const restaurantApprovalSchema = z.object({
  isApproved: z.boolean(),
  isSuspended: z.boolean().optional(),
});

export type RestaurantProfileInput = z.infer<typeof restaurantProfileSchema>;
export type RestaurantToggleInput = z.infer<typeof restaurantToggleSchema>;
export type RestaurantApprovalInput = z.infer<typeof restaurantApprovalSchema>;
