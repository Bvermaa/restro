import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartAddOn {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string; // local unique ID (menuItemId + variantId)
  menuItemId: string;
  name: string;
  image: string | null;
  isVeg: boolean;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  addOns: CartAddOn[];
  quantity: number;
}

interface CartState {
  items: CartItem[];
  restaurantSlug: string | null;
  restaurantId: string | null;
  couponCode: string | null;
  couponDiscount: number;

  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  applyCoupon: (code: string, discount: number) => void;
  removeCoupon: () => void;
  setRestaurant: (slug: string, restaurantId: string) => void;

  // Computed
  itemCount: () => number;
  subtotal: () => number;
  gstAmount: () => number;
  total: (isDineIn?: boolean) => number;
}

const GST_RATE = 0.18;
const DELIVERY_FEE = 40;
const PACKAGING_FEE = 15;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantSlug: null,
      restaurantId: null,
      couponCode: null,
      couponDiscount: 0,

      addItem: (newItem) => {
        const id = `${newItem.menuItemId}:${newItem.variantId ?? 'default'}`;
        const existingIndex = get().items.findIndex((i) => i.id === id);

        if (existingIndex >= 0) {
          set((state) => ({
            items: state.items.map((item, idx) =>
              idx === existingIndex
                ? { ...item, quantity: item.quantity + newItem.quantity }
                : item
            ),
          }));
        } else {
          set((state) => ({
            items: [...state.items, { ...newItem, id }],
          }));
        }
      },

      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () =>
        set({ items: [], couponCode: null, couponDiscount: 0 }),

      applyCoupon: (couponCode, couponDiscount) =>
        set({ couponCode, couponDiscount }),

      removeCoupon: () => set({ couponCode: null, couponDiscount: 0 }),

      setRestaurant: (restaurantSlug, restaurantId) => {
        const state = get();
        // Clear cart if switching restaurants
        if (state.restaurantSlug && state.restaurantSlug !== restaurantSlug) {
          set({
            items: [],
            couponCode: null,
            couponDiscount: 0,
            restaurantSlug,
            restaurantId,
          });
        } else {
          set({ restaurantSlug, restaurantId });
        }
      },

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, item) => {
          const addOnsTotal = item.addOns.reduce((a, ao) => a + ao.price, 0);
          return sum + (item.unitPrice + addOnsTotal) * item.quantity;
        }, 0),

      gstAmount: () => get().subtotal() * GST_RATE,

      total: (isDineIn = true) => {
        const subtotal = get().subtotal();
        const gst = subtotal * GST_RATE;
        const discount = get().couponDiscount;
        const fees = isDineIn ? 0 : (DELIVERY_FEE + PACKAGING_FEE);
        return Math.max(subtotal + gst + fees - discount, 0);
      },
    }),
    {
      name: 'qr-restaurant-cart',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
);
