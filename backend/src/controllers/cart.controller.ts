import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

const GST_RATE = parseFloat(process.env.GST_RATE ?? '18') / 100;
const DELIVERY_FEE = 40;
const PACKAGING_FEE = 15;

export async function getCart(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        menuItem: {
          include: { variants: true, addOns: true },
        },
        variant: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const subtotal = cartItems.reduce((sum, item) => {
      const itemPrice = item.variant ? item.variant.price : item.menuItem.price;
      const addOnsTotal = (item.addOns as Array<{ id?: string; name?: string; price: number }>).reduce(
        (acc, ao) => {
          // Canonical database price resolution for add-ons
          const dbAddOn = item.menuItem.addOns.find((d) => d.id === ao.id || d.name.toLowerCase() === (ao.name || '').toLowerCase());
          return acc + (dbAddOn ? dbAddOn.price : 0);
        },
        0
      );
      return sum + (itemPrice + addOnsTotal) * item.quantity;
    }, 0);

    const gstAmount = subtotal * GST_RATE;
    const total = subtotal + gstAmount + DELIVERY_FEE + PACKAGING_FEE;

    res.json({
      success: true,
      data: {
        items: cartItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        gstAmount: parseFloat(gstAmount.toFixed(2)),
        deliveryFee: DELIVERY_FEE,
        packagingFee: PACKAGING_FEE,
        discount: 0,
        total: parseFloat(total.toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function addToCart(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { menuItemId, variantId, quantity, addOns } = req.body as {
      menuItemId: string;
      variantId?: string | null;
      quantity: number;
      addOns?: Array<{ id: string; name: string; price: number }>;
    };

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100) {
      throw new AppError('Quantity must be an integer between 1 and 100.', 400, 'INVALID_QUANTITY');
    }

    // Verify menu item exists and is available, including database add-ons and variants
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, isAvailable: true, deletedAt: null },
      include: { variants: true, addOns: true },
    });

    if (!menuItem) {
      throw new AppError('Menu item not found or unavailable.', 404, 'ITEM_NOT_FOUND');
    }

    // Check if cart has items from a different restaurant
    const existingCartItem = await prisma.cartItem.findFirst({
      where: { userId },
      include: { menuItem: true },
    });

    if (existingCartItem && existingCartItem.menuItem.restaurantId !== menuItem.restaurantId) {
      throw new AppError(
        'Your cart contains items from another restaurant. Please clear your cart first or checkout.',
        400,
        'DIFFERENT_RESTAURANT'
      );
    }

    if (variantId) {
      const variant = menuItem.variants.find((v) => v.id === variantId);
      if (!variant) {
        throw new AppError('Variant not found for this item.', 404, 'VARIANT_NOT_FOUND');
      }
    }

    // Strictly validate add-ons against canonical database records
    const canonicalAddOns: Array<{ id: string; name: string; price: number }> = [];
    if (addOns && Array.isArray(addOns)) {
      for (const reqAddOn of addOns) {
        const dbAddOn = menuItem.addOns.find(
          (ao) => ao.id === reqAddOn.id || ao.name.toLowerCase() === (reqAddOn.name || '').toLowerCase()
        );
        if (!dbAddOn) {
          throw new AppError(`Add-on '${reqAddOn.name || reqAddOn.id}' is invalid for this menu item.`, 400, 'INVALID_ADDON');
        }
        canonicalAddOns.push({
          id: dbAddOn.id,
          name: dbAddOn.name,
          price: dbAddOn.price,
        });
      }
    }

    // Prevent quantity limit escalation via repeated add-to-cart calls
    const existingSameItem = await prisma.cartItem.findUnique({
      where: {
        userId_menuItemId_variantId: {
          userId,
          menuItemId,
          variantId: variantId ?? '',
        },
      },
    });

    const currentQty = existingSameItem?.quantity ?? 0;
    const resultingQty = currentQty + qty;
    if (resultingQty > 100) {
      throw new AppError(
        `Total quantity for this item cannot exceed 100 (current in cart: ${currentQty}).`,
        400,
        'MAX_QUANTITY_EXCEEDED'
      );
    }

    // Upsert cart item with canonical database values and bounded quantity
    const cartItem = await prisma.cartItem.upsert({
      where: {
        userId_menuItemId_variantId: {
          userId,
          menuItemId,
          variantId: variantId ?? '',
        },
      },
      update: {
        quantity: resultingQty,
        addOns: canonicalAddOns,
      },
      create: {
        userId,
        menuItemId,
        variantId,
        quantity: qty,
        addOns: canonicalAddOns,
      },
      include: {
        menuItem: { include: { variants: true, addOns: true } },
        variant: true,
      },
    });

    res.status(201).json({ success: true, data: { cartItem }, message: 'Added to cart' });
  } catch (error) {
    next(error);
  }
}

export async function updateCartItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const cartItemId = req.params.cartItemId as string;
    const { quantity } = req.body as { quantity: number };

    const existingItem = await prisma.cartItem.findFirst({
      where: { id: cartItemId, userId },
    });

    if (!existingItem) {
      throw new AppError('Cart item not found.', 404, 'CART_ITEM_NOT_FOUND');
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100) {
      throw new AppError('Quantity must be an integer between 0 and 100.', 400, 'INVALID_QUANTITY');
    }

    if (qty === 0) {
      await prisma.cartItem.delete({ where: { id: cartItemId } });
      res.json({ success: true, data: null, message: 'Item removed from cart' });
      return;
    }

    const updated = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity: qty },
      include: { menuItem: true, variant: true },
    });

    res.json({ success: true, data: { cartItem: updated } });
  } catch (error) {
    next(error);
  }
}

export async function removeCartItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const cartItemId = req.params.cartItemId as string;

    const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } });
    if (!item) {
      throw new AppError('Cart item not found.', 404, 'CART_ITEM_NOT_FOUND');
    }

    await prisma.cartItem.delete({ where: { id: cartItemId } });
    res.json({ success: true, data: null, message: 'Item removed from cart' });
  } catch (error) {
    next(error);
  }
}

export async function clearCart(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    await prisma.cartItem.deleteMany({ where: { userId } });
    res.json({ success: true, data: null, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
}

export async function applyCoupon(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, restaurantSlug, cartTotal } = req.body as {
      code: string;
      restaurantSlug: string;
      cartTotal: number;
    };

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
    });

    if (!restaurant) {
      throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase().trim(),
        OR: [{ restaurantId: restaurant.id }, { restaurantId: null }],
      },
    });

    if (!coupon) {
      throw new AppError('Invalid coupon code.', 400, 'INVALID_COUPON');
    }

    if (!coupon.isActive) {
      throw new AppError('This coupon is currently inactive.', 400, 'COUPON_INACTIVE');
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      throw new AppError('This coupon has expired.', 400, 'COUPON_EXPIRED');
    }

    if (coupon.minOrderAmount !== null && coupon.minOrderAmount > 0 && cartTotal < coupon.minOrderAmount) {
      throw new AppError(
        `Minimum order of ₹${coupon.minOrderAmount} required for coupon ${coupon.code}.`,
        400,
        'COUPON_MIN_ORDER_NOT_MET'
      );
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new AppError('This coupon has reached its usage limit.', 400, 'COUPON_LIMIT_REACHED');
    }

    // Per-user limit check
    if (req.user && coupon.perUserLimit !== null) {
      const userUsageCount = await prisma.couponUsage.count({
        where: { couponId: coupon.id, userId: req.user.id },
      });
      if (userUsageCount >= coupon.perUserLimit) {
        throw new AppError(
          'You have already used this coupon the maximum number of times.',
          400,
          'COUPON_USER_LIMIT_REACHED'
        );
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.type === 'FLAT') {
      discount = coupon.value;
    } else {
      discount = (cartTotal * coupon.value) / 100;
      if (coupon.maxDiscount !== null) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    }

    res.json({
      success: true,
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
        },
        discount: parseFloat(discount.toFixed(2)),
        newTotal: parseFloat((cartTotal - discount).toFixed(2)),
      },
      message: `Coupon applied! You save ₹${discount.toFixed(2)}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCoupon(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json({ success: true, data: null, message: 'Coupon removed' });
  } catch (error) {
    next(error);
  }
}
