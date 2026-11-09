'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Plus, Minus, Heart, Leaf, Flame } from 'lucide-react';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';
import api from '@/services/api';
import { getImageUrl } from '@/lib/image';

interface MenuItemCardProps {
  item: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image: string | null;
    isVeg: boolean;
    isVegan: boolean;
    isAvailable: boolean;
    badges: string[];
    variants: Array<{ id: string; name: string; price: number }>;
    addOns: Array<{ id: string; name: string; price: number }>;
  };
  themeColor: string;
  restaurantId: string;
  restaurantSlug?: string;
  layoutStyle?: 'modern' | 'compact' | 'bistro' | 'showcase';
}

const BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  POPULAR: { label: 'Popular', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  TRENDING: { label: '🔥 Trending', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  BEST_SELLER: { label: '⭐ Best Seller', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  NEW: { label: '✨ New', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

function getFallbackFoodImage(name: string, isVeg: boolean): string {
  const lower = name.toLowerCase();
  if (lower.includes('paneer')) return 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('chicken')) return 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread')) return 'https://images.unsplash.com/photo-1626074353765-517a681e40be?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('biryani') || lower.includes('rice')) return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('jamun') || lower.includes('dessert') || lower.includes('sweet')) return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('lassi') || lower.includes('drink') || lower.includes('mango')) return 'https://images.unsplash.com/photo-1546173159-315724a31696?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('corn')) return 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('dal') || lower.includes('makhani')) return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?q=80&w=800&auto=format&fit=crop';
  return isVeg
    ? 'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=800&auto=format&fit=crop'
    : 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?q=80&w=800&auto=format&fit=crop';
}

export function MenuItemCard({ item, themeColor, restaurantId, restaurantSlug, layoutStyle = 'modern' }: MenuItemCardProps) {
  const [selectedVariant, setSelectedVariant] = useState<{ id: string; name: string; price: number } | null>(
    item.variants.length > 0 ? (item.variants[0] ?? null) : null
  );
  const [showCustomize, setShowCustomize] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const { addItem, items: cartItems, updateQuantity, removeItem } = useCartStore();
  const { user: rawUser } = useAuthStore();

  const activeUser = useMemo(() => {
    if (!rawUser) return null;
    return rawUser;
  }, [rawUser]);

  const cartItemId = `${item.id}:${selectedVariant?.id ?? 'default'}`;
  const cartItem = cartItems.find((ci) => ci.id === cartItemId);
  const quantity = cartItem?.quantity ?? 0;

  const currentPrice = selectedVariant?.price ?? item.price;
  const addOnsTotal = selectedAddOns.reduce((sum, ao) => sum + ao.price, 0);
  const totalPrice = currentPrice + addOnsTotal;

  const itemImageUrl = item.image ? getImageUrl(item.image) : getFallbackFoodImage(item.name, item.isVeg);

  const handleAddToCart = () => {
    if (!item.isAvailable) {
      toast.error('This item is currently unavailable');
      return;
    }

    if (rawUser && rawUser.role !== 'CUSTOMER') {
      toast.error('Restaurant owners and admins cannot order food.');
      return;
    }

    addItem({
      menuItemId: item.id,
      name: item.name,
      image: itemImageUrl,
      isVeg: item.isVeg,
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      unitPrice: currentPrice,
      addOns: selectedAddOns,
      quantity: 1,
    });

    toast.success(`${item.name} added to cart`, {
      description: selectedVariant ? selectedVariant.name : undefined,
    });
    setShowCustomize(false);
  };

  const toggleFavorite = async () => {
    if (!activeUser) {
      toast.info('Please log in to save favorites');
      return;
    }
    setFavoriteLoading(true);
    try {
      await api.post(`/profile/favorites/${item.id}`);
      setIsFavorite(!isFavorite);
      toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
    } catch {
      toast.error('Failed to update favorites');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const toggleAddOn = (addOn: { id: string; name: string; price: number }) => {
    setSelectedAddOns((prev) => {
      const exists = prev.find((ao) => ao.id === addOn.id);
      if (exists) return prev.filter((ao) => ao.id !== addOn.id);
      return [...prev, addOn];
    });
  };

  const getLayoutClasses = () => {
    switch (layoutStyle) {
      case 'compact':
        return 'bg-card border border-border/80 rounded-xl p-3 shadow-xs';
      case 'bistro':
        return 'bg-card border-l-4 border-amber-500 border-border/60 rounded-2xl p-4 shadow-sm font-serif';
      case 'showcase':
        return 'bg-card border border-border rounded-2xl overflow-hidden shadow-md';
      case 'modern':
      default:
        return 'bg-card border border-border rounded-2xl overflow-hidden transition-all shadow-sm';
    }
  };

  return (
    <motion.div
      layout
      className={`${getLayoutClasses()} ${!item.isAvailable ? 'opacity-60' : ''}`}
    >
      <div className="flex gap-3 p-4">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          {/* Veg indicator + badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center ${
              item.isVeg || item.isVegan ? 'border-green-500' : 'border-red-500'
            }`}>
              <div className={`w-2 h-2 rounded-full ${item.isVeg || item.isVegan ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            {item.isVegan && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <Leaf className="w-3 h-3" /> Vegan
              </span>
            )}
            {item.badges.map((badge) => (
              <span key={badge} className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_CONFIG[badge]?.className ?? ''}`}>
                {BADGE_CONFIG[badge]?.label ?? badge}
              </span>
            ))}
          </div>

          <h3 className={`font-display font-semibold text-base mb-1 ${!item.isAvailable ? 'line-through' : ''}`}>
            {item.name}
          </h3>

          {item.description && (
            <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2 mb-2">
              {item.description}
            </p>
          )}

          {/* Variants */}
          {item.variants.length > 1 && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {item.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    selectedVariant?.id === variant.id
                      ? 'border-current text-white'
                      : 'border-border text-muted-foreground'
                  }`}
                  style={selectedVariant?.id === variant.id ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                >
                  {variant.name} — ₹{variant.price}
                </button>
              ))}
            </div>
          )}

          {!item.isAvailable && (
            <span className="text-xs text-red-500 font-medium">Currently unavailable</span>
          )}
        </div>

        {/* Right: Image + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="relative w-28 h-24 rounded-xl overflow-hidden border border-border/40 shadow-sm shrink-0 bg-muted">
            <img src={itemImageUrl} alt={item.name} className="w-full h-full object-cover" />

            {/* Favorite button */}
            <button
              onClick={toggleFavorite}
              disabled={favoriteLoading}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-md transition-transform active:scale-90"
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </button>
          </div>

          {/* Price */}
          <span className="font-display font-bold text-base">₹{totalPrice}</span>

          {/* Add button */}
          {quantity > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => updateQuantity(cartItemId, quantity - 1)}
                className="p-2 hover:bg-muted transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
              <button
                onClick={() => {
                  if (rawUser && rawUser.role !== 'CUSTOMER') {
                    toast.error('Restaurant owners and admins cannot order food.');
                    return;
                  }
                  if (item.addOns.length > 0) {
                    setShowCustomize(true);
                  } else {
                    addItem({
                      menuItemId: item.id,
                      name: item.name,
                      image: item.image,
                      isVeg: item.isVeg,
                      variantId: selectedVariant?.id ?? null,
                      variantName: selectedVariant?.name ?? null,
                      unitPrice: currentPrice,
                      addOns: [],
                      quantity: 1,
                    });
                  }
                }}
                className="p-2 hover:bg-muted transition-colors"
                style={{ color: themeColor }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!item.isAvailable) return;
                if (rawUser && rawUser.role !== 'CUSTOMER') {
                  toast.error('Restaurant owners and admins cannot order food.');
                  return;
                }
                if (item.addOns.length > 0 || item.variants.length > 1) {
                  setShowCustomize(true);
                } else {
                  handleAddToCart();
                }
              }}
              disabled={!item.isAvailable}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: item.isAvailable ? themeColor : undefined }}
            >
              {item.isAvailable ? 'ADD' : 'N/A'}
            </button>
          )}
        </div>
      </div>

      {/* Customization Panel */}
      {showCustomize && (
        <div className="border-t border-border p-4 space-y-3 bg-muted/30">
          {/* Variants */}
          {item.variants.length > 1 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Size</p>
              <div className="flex gap-2 flex-wrap">
                {item.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      selectedVariant?.id === variant.id ? 'text-white border-current' : 'border-border'
                    }`}
                    style={selectedVariant?.id === variant.id ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                  >
                    {variant.name} — ₹{variant.price}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {item.addOns.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Add-ons (optional)</p>
              <div className="space-y-2">
                {item.addOns.map((addOn) => (
                  <label key={addOn.id} className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAddOns.some((ao) => ao.id === addOn.id)}
                        onChange={() => toggleAddOn(addOn)}
                        className="rounded"
                      />
                      <span className="text-sm">{addOn.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">+₹{addOn.price}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowCustomize(false)}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleAddToCart}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: themeColor }}
            >
              Add ₹{totalPrice}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
