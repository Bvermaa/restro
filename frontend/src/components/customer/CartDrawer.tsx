'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Minus, Plus, Trash2, Tag, ChevronRight, Sparkles, Flame, RefreshCw } from 'lucide-react';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const GST_RATE = 0.18;

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  restaurantSlug: string;
  tableNumber?: string;
  tableToken?: string;
  isTableVerified?: boolean;
  themeColor: string;
}

export function CartDrawer({ open, onClose, restaurantSlug, tableNumber, tableToken, isTableVerified, themeColor }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, couponCode, couponDiscount, applyCoupon, removeCoupon, subtotal, gstAmount, total, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const router = useRouter();

  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [addonOrderId, setAddonOrderId] = useState<string | null>(null);
  const [addonOrderNum, setAddonOrderNum] = useState<string | null>(null);
  const [addingToOrder, setAddingToOrder] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = sessionStorage.getItem('qr_restaurant_addon_order_id');
      const storedNum = sessionStorage.getItem('qr_restaurant_addon_order_num');
      setAddonOrderId(storedId);
      setAddonOrderNum(storedNum);
    }
  }, [open]);

  // Prevent background scrolling when cart drawer is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [open]);

  const subtotalAmount = subtotal();
  const gst = gstAmount();
  const discount = couponDiscount;
  const grandTotal = Math.max(subtotalAmount + gst - discount, 0);

  // AI Coupon Suggestion
  const { data: couponSuggestion } = useQuery({
    queryKey: ['coupon-suggestion', restaurantSlug, subtotalAmount],
    queryFn: async () => {
      if (items.length === 0) return null;
      const response = await api.post('/ai/coupon-suggest', {
        restaurantSlug,
        cartItems: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.unitPrice,
        })),
        cartTotal: subtotalAmount,
      });
      return response.data.data as {
        suggestion: {
          couponCode: string | null;
          reason: string;
          savingsAmount: number;
        };
        coupons: Array<{
          code: string;
          type: 'FLAT' | 'PERCENT';
          value: number;
          minOrderAmount: number;
          maxDiscount?: number | null;
          maxUses?: number | null;
          usedCount?: number;
        }>;
      };
    },
    enabled: open && items.length > 0,
    staleTime: 60 * 1000,
  });

  const handleApplyCouponDirectly = async (code: string) => {
    if (!code.trim()) return;
    setCouponLoading(true);
    try {
      const response = await api.post('/cart/coupon', {
        code: code.toUpperCase(),
        restaurantSlug,
        cartTotal: subtotalAmount,
      });
      const { discount: discountAmount, coupon } = response.data.data as {
        discount: number;
        coupon: { code: string };
      };
      applyCoupon(coupon.code, discountAmount);
      setCouponInput('');
      toast.success(`Coupon applied! You save ₹${discountAmount}`);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      const msg = axiosError.response?.data?.error || axiosError.response?.data?.message || 'Invalid coupon code';
      toast.error(msg);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleApplyCoupon = () => {
    handleApplyCouponDirectly(couponInput);
  };

  const handleDirectAddToOrder = async () => {
    if (!addonOrderId || items.length === 0) return;
    setAddingToOrder(true);
    try {
      const token = tableToken || (typeof window !== 'undefined' ? localStorage.getItem(`table_token_${restaurantSlug}`) || '' : '');
      const response = await api.post(`/orders/${addonOrderId}/add-items`, {
        cartItems: items.map((item) => ({
          menuItemId: item.menuItemId,
          variantId: item.variantId,
          quantity: item.quantity,
          addOns: item.addOns,
        })),
        tableToken: token,
      });

      sessionStorage.removeItem('qr_restaurant_addon_order_id');
      sessionStorage.removeItem('qr_restaurant_addon_order_num');

      clearCart();
      onClose();
      toast.success('🎉 Additional items fired directly to the kitchen!');
      router.push(`/r/${restaurantSlug}/order/${addonOrderId}`);
    } catch (err: any) {
      const errMsg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to add items to order.';
      toast.error(errMsg);
    } finally {
      setAddingToOrder(false);
    }
  };

  const handleCheckout = () => {
    onClose();
    const params = new URLSearchParams();
    const activeTable = isTableVerified ? tableNumber : null;
    const activeToken = isTableVerified ? tableToken : null;

    if (activeTable) params.set('table', activeTable);
    if (activeToken) params.set('t', activeToken);
    router.push(`/r/${restaurantSlug}/checkout?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99998]"
            onClick={onClose}
            onTouchMove={(e) => e.preventDefault()}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background shadow-2xl z-[99999] flex flex-col border-l border-border opacity-100"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg">Your Cart</h2>
                <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                  {items.reduce((sum, i) => sum + i.quantity, 0)}
                </span>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 scrollbar-thin">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="font-display font-semibold text-lg mb-2">Your cart is empty</h3>
                  <p className="text-muted-foreground text-sm">Add items from the menu to get started</p>
                </div>
              ) : (
                <>
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                      <div className={`w-3 h-3 flex-shrink-0 rounded border-2 ${item.isVeg ? 'border-green-500' : 'border-red-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full m-0.5 ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm line-clamp-1">{item.name}</p>
                        {item.variantName && (
                          <p className="text-xs text-muted-foreground">{item.variantName}</p>
                        )}
                        {item.addOns.length > 0 && (
                          <p className="text-xs text-muted-foreground">{item.addOns.map((ao) => ao.name).join(', ')}</p>
                        )}
                        <p className="text-sm font-bold mt-0.5">₹{((item.unitPrice + item.addOns.reduce((s, ao) => s + ao.price, 0)) * item.quantity).toFixed(0)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-lg border border-border">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1.5 hover:bg-muted rounded-l-lg transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1.5 hover:bg-muted rounded-r-lg transition-colors"
                            style={{ color: themeColor }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Coupon + Bill Summary */}
            {items.length > 0 && (
              <div className="border-t border-border p-4 space-y-4">
                {/* AI Coupon Suggestion */}
                {couponSuggestion?.suggestion?.couponCode && !couponCode && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">AI Suggestion</span>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-300 mb-2">{couponSuggestion.suggestion.reason}</p>
                    <button
                      onClick={() => handleApplyCouponDirectly(couponSuggestion.suggestion.couponCode!)}
                      className="text-xs font-bold text-amber-700 dark:text-amber-400 underline"
                    >
                      Apply {couponSuggestion.suggestion.couponCode}
                    </button>
                  </div>
                )}

                {/* Available Coupons List */}
                {couponSuggestion?.coupons && couponSuggestion.coupons.length > 0 && !couponCode && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 px-1">
                      <Tag className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Available Coupons</span>
                    </div>
                    <div className="grid gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                      {couponSuggestion.coupons.map((c) => {
                        const isReachedLimit = c.maxUses !== null && c.maxUses !== undefined && c.usedCount !== undefined && c.usedCount >= c.maxUses;
                        const isUnlocked = subtotalAmount >= c.minOrderAmount && !isReachedLimit;
                        const diff = c.minOrderAmount - subtotalAmount;
                        
                        return (
                          <div 
                            key={c.code}
                            className={`flex items-center justify-between border rounded-xl p-3 transition-all duration-300 ${
                              isReachedLimit
                                ? 'bg-red-500/5 border-red-200/50 opacity-60 filter blur-[0.4px] select-none pointer-events-none'
                                : isUnlocked 
                                  ? 'bg-primary/5 hover:bg-primary/10 border-primary/20 hover:border-primary/45' 
                                  : 'bg-muted/10 border-border opacity-75'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-extrabold font-mono tracking-wider px-2 py-0.5 rounded ${
                                  isReachedLimit
                                    ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900/30'
                                    : isUnlocked 
                                      ? 'bg-primary/20 text-primary border border-primary/30' 
                                      : 'bg-muted text-muted-foreground border border-muted-foreground/20'
                                }`}>
                                  {c.code}
                                </span>
                                {c.type === 'PERCENT' ? (
                                  <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                    {c.value}% OFF
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                    ₹{c.value} OFF
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-muted-foreground mt-1.5 leading-snug">
                                {c.type === 'PERCENT' 
                                  ? `${c.value}% discount${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ''}.` 
                                  : `Flat ₹${c.value} discount.`} Min. order ₹{c.minOrderAmount}.
                              </p>
                              {isReachedLimit ? (
                                <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 mt-1">
                                  This coupon has reached its usage limit.
                                </p>
                              ) : !isUnlocked && (
                                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-1">
                                  Add ₹{diff.toFixed(0)} more to unlock!
                                </p>
                              )}
                            </div>
                            <button
                              disabled={!isUnlocked || isReachedLimit}
                              onClick={() => handleApplyCouponDirectly(c.code)}
                              className={`text-xs font-extrabold px-3 py-1.5 rounded-lg transition-all duration-300 ${
                                isReachedLimit
                                  ? 'bg-red-500/20 text-red-700/60 cursor-not-allowed border border-red-500/30'
                                  : isUnlocked
                                    ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-sm hover:shadow'
                                    : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                              }`}
                            >
                              {isReachedLimit ? 'Limit Reached' : 'Apply'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coupon Input */}
                {couponCode ? (
                  <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">{couponCode}</p>
                        <p className="text-xs text-green-600">Saving ₹{discount.toFixed(0)}</p>
                      </div>
                    </div>
                    <button onClick={removeCoupon} className="text-muted-foreground hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleApplyCoupon(); }}
                      className="flex-1 px-3 py-2.5 bg-muted rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ backgroundColor: themeColor }}
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                )}

                {/* Bill Summary */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{subtotalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST (18%)</span>
                    <span>₹{gst.toFixed(2)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Coupon discount</span>
                      <span>-₹{discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {addonOrderId ? (
                  <button
                    onClick={handleDirectAddToOrder}
                    disabled={addingToOrder || items.length === 0}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-between px-5 shadow-lg active:scale-98 transition-all hover:opacity-95 bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5 text-left">
                      {addingToOrder ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Flame className="w-5 h-5 shrink-0" />}
                      <div>
                        <span className="block leading-tight font-extrabold text-sm sm:text-base">
                          {addingToOrder ? 'Sending to Kitchen...' : `⚡ Add to Table (#${addonOrderNum})`}
                        </span>
                        <span className="text-[10px] text-white/80 font-normal">No checkout needed · Billed to table</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 font-black text-lg">
                      <span>₹{grandTotal.toFixed(0)}</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={handleCheckout}
                    className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-between px-5 shadow-lg active:scale-98 transition-all hover:opacity-95"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, #F48C06)` }}
                  >
                    <span>Proceed to Checkout</span>
                    <div className="flex items-center gap-2">
                      <span>₹{grandTotal.toFixed(0)}</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
