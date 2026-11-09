import { z } from 'zod';

export const menuCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  parentId: z.string().cuid('Invalid parent category ID').optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

export const itemVariantSchema = z.object({
  name: z.string().min(1, 'Variant name is required').max(100),
  price: z.number().positive('Price must be positive'),
});

export const itemAddOnSchema = z.object({
  name: z.string().min(1, 'Add-on name is required').max(100),
  price: z.number().min(0, 'Price must be non-negative'),
});

export const menuItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200),
  description: z.string().max(1000).optional(),
  price: z.number().positive('Price must be positive'),
  categoryId: z.string().cuid('Invalid category ID'),
  isVeg: z.boolean().default(true),
  isVegan: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  badges: z.array(z.enum(['POPULAR', 'TRENDING', 'BEST_SELLER', 'NEW'])).default([]),
  variants: z.array(itemVariantSchema).default([]),
  addOns: z.array(itemAddOnSchema).default([]),
});

export const updateMenuItemSchema = menuItemSchema.partial().extend({
  image: z.string().url().optional(),
});

export const cartItemSchema = z.object({
  menuItemId: z.string().cuid('Invalid menu item ID'),
  variantId: z.string().cuid().optional().nullable(),
  quantity: z.number().int().positive('Quantity must be at least 1').max(20),
  addOns: z
    .array(
      z.object({
        id: z.string().cuid(),
        name: z.string(),
        price: z.number().min(0),
      })
    )
    .default([]),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(20),
});

export type MenuCategoryInput = z.infer<typeof menuCategorySchema>;
export type ItemVariantInput = z.infer<typeof itemVariantSchema>;
export type ItemAddOnInput = z.infer<typeof itemAddOnSchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
