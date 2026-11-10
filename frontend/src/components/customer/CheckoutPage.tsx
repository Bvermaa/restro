'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CreditCard, Banknote, Wallet, MapPin, User, Phone, Loader2, Plus, PlusCircle, Check, Lock, X, Smartphone, Building, Gift, Copy, QrCode, AlertCircle, UtensilsCrossed, Pencil } from 'lucide-react';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import { toast } from 'sonner';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getImageUrl } from '@/lib/image';
import { generateUniqueTableCode } from '@/utils/tableCode';
import QRCode from 'qrcode';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, handler: (response: any) => void) => void;
    };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  modal?: {
    ondismiss?: () => void;
  };
}

const guestSchema = z.object({
  guestName: z.string().optional().or(z.literal('')),
  guestPhone: z.string().optional().or(z.literal('')),
  paymentMethod: z.enum(['RAZORPAY', 'COD', 'PAY_TO_WAITER']),
});

type GuestForm = z.infer<typeof guestSchema>;

const GST_RATE = 0.18;
// Dine-in only (no delivery fees)


interface CheckoutPageProps {
  restaurantSlug: string;
  tableNumber?: string;
  tableToken?: string;
  isTableVerified?: boolean;
}

const saveOrderToRecent = (orderId: string, restaurantSlug: string) => {
  try {
    const orders = localStorage.getItem('qr_restaurant_recent_orders');
    let parsed = [];
    if (orders) {
      parsed = JSON.parse(orders);
      if (!Array.isArray(parsed)) parsed = [];
    }
    parsed = parsed.filter((o: any) => o.orderId !== orderId);
    parsed.unshift({
      orderId,
      restaurantSlug,
      createdAt: Date.now(),
    });
    parsed = parsed.slice(0, 10);
    localStorage.setItem('qr_restaurant_recent_orders', JSON.stringify(parsed));
  } catch (e) {
    console.error('Failed to save order to recent orders list', e);
  }
};


export function CheckoutPage({ restaurantSlug, tableNumber, tableToken, isTableVerified }: CheckoutPageProps) {
  const router = useRouter();
  const { user: rawUser, accessToken, logout } = useAuthStore();
  const queryClient = useQueryClient();

  const activeUser = useMemo(() => {
    if (!rawUser) return null;
    return rawUser;
  }, [rawUser]);

  // Fetch Restaurant Data
  const { data: menuData } = useQuery({
    queryKey: ['menu', restaurantSlug],
    queryFn: async () => {
      const response = await api.get(`/menu/${restaurantSlug}`);
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const restaurant = menuData?.restaurant;
  

  const [manualTableNumber, setManualTableNumber] = useState(tableNumber || '');

  useEffect(() => {
    if (!tableNumber || !isTableVerified) {
      const storedTable = localStorage.getItem(`table_num_${restaurantSlug}`);
      if (storedTable) {
        setManualTableNumber(storedTable);
      }
    } else {
      setManualTableNumber(tableNumber);
    }
  }, [tableNumber, isTableVerified, restaurantSlug]);

  const handleTableNumberChange = (val: string) => {
    setManualTableNumber(val);
    if (val.trim()) {
      localStorage.setItem(`table_num_${restaurantSlug}`, val.trim());
    } else {
      localStorage.removeItem(`table_num_${restaurantSlug}`);
    }
  };

  const hasTableToken = useMemo(() => {
    if (isTableVerified || (tableToken && tableToken.trim() !== '')) return true;
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem(`table_token_${restaurantSlug}`);
      return !!(storedToken && storedToken.trim() !== '');
    }
    return false;
  }, [tableToken, restaurantSlug]);

  // UPI Intent Payment Modal state
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiData, setUpiData] = useState<{
    paymentId: string;
    orderId: string;
    txnRef: string;
    amount: number;
    currency: string;
    merchantVpa: string;
    merchantName: string;
    upiIntentUrl: string;
    fallbackUpiUrl?: string;
    gpayUrl?: string;
    phonepeUrl?: string;
    paytmUrl?: string;
  } | null>(null);
  const [upiQrCodeDataUrl, setUpiQrCodeDataUrl] = useState<string>('');
  const [isCheckingUpiStatus, setIsCheckingUpiStatus] = useState<boolean>(false);

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return `${v.slice(0, 2)}/${v.slice(2, 4)}`;
    }
    return v;
  };

  // Address queries & state
  
  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await api.get('/profile');
      return response.data.data.user as { loyaltyPoints: number; walletBalance: number };
    },
    enabled: !!activeUser && !!accessToken,
  });

  const { data: loyaltySettings } = useQuery({
    queryKey: ['loyalty-settings'],
    queryFn: async () => {
      const res = await api.get('/menu/loyalty-settings');
      return res.data.data?.settings || {};
    },
  });
  const loyaltyEnabled = loyaltySettings?.enabled !== false;
  const pointsPerDiscountRupee = Number(loyaltySettings?.pointsPerDiscountRupee) || 50;

  const [usePoints, setUsePoints] = useState(false);

  
  const { items, couponCode, couponDiscount, clearCart, subtotal, total, removeItem, updateQuantity } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'RAZORPAY' | 'COD' | 'PAY_TO_WAITER'>('RAZORPAY');
  const [onlinePaymentType, setOnlinePaymentType] = useState<'DIRECT' | 'RAZORPAY'>('DIRECT');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (restaurant) {
      const hasDirect = !!(restaurant.paymentQrCode || restaurant.paymentUpiId || restaurant.paymentPhone || restaurant.bankAccountNumber);
      setOnlinePaymentType(hasDirect ? 'DIRECT' : 'RAZORPAY');
    }
  }, [restaurant]);
  const [razorpayKeyId, setRazorpayKeyId] = useState<string>('');
  // Use a ref so handleRazorpayPayment always reads the latest key (avoids stale closure race condition)
  const razorpayKeyRef = useRef<string>('');

  const [addonOrderId, setAddonOrderId] = useState<string | null>(null);
  const [addonOrderNum, setAddonOrderNum] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = sessionStorage.getItem('qr_restaurant_addon_order_id');
      const storedNum = sessionStorage.getItem('qr_restaurant_addon_order_num');
      if (storedId) {
        setAddonOrderId(storedId);
        setAddonOrderNum(storedNum);
        setSelectedPayment('PAY_TO_WAITER');
      }
    }
  }, []);

  useEffect(() => {
    api.get('/orders/razorpay-key')
      .then(res => {
        const key = res.data?.data?.keyId ?? '';
        setRazorpayKeyId(key);
        razorpayKeyRef.current = key;
      })
      .catch(err => {
        console.error('Failed to fetch Razorpay key ID:', err);
      });
  }, []);

  const subtotalAmount = mounted ? subtotal() : 0;
  const gst = subtotalAmount * GST_RATE;
  const finalCouponDiscount = addonOrderId ? 0 : couponDiscount;
  const grandTotalBeforePoints = Math.max(subtotalAmount + gst - finalCouponDiscount, 0);

  const pointsAvailable = profileData?.loyaltyPoints ?? activeUser?.loyaltyPoints ?? 0;
  const maxPointsDiscount = pointsAvailable / pointsPerDiscountRupee;
  const pointsDiscount = loyaltyEnabled && usePoints && !addonOrderId ? Math.min(maxPointsDiscount, grandTotalBeforePoints) : 0;
  const grandTotal = Math.max(grandTotalBeforePoints - pointsDiscount, 0);

  const { register, handleSubmit, formState: { errors } } = useForm<GuestForm>({
    resolver: zodResolver(guestSchema),
    defaultValues: { paymentMethod: 'RAZORPAY' },
  });

  const handleUpiIntentPayment = async (orderId: string) => {
    try {
      const res = await api.post('/payments/create-upi-intent', { orderId });
      const paymentInfo = res.data?.data;
      if (!paymentInfo) {
        throw new Error('Failed to obtain payment configuration.');
      }
      setUpiData(paymentInfo);

      if (paymentInfo.upiIntentUrl) {
        try {
          const qrUrl = await QRCode.toDataURL(paymentInfo.upiIntentUrl, { width: 300, margin: 1 });
          setUpiQrCodeDataUrl(qrUrl);
        } catch (err) {
          console.error('Failed to generate UPI QR code:', err);
        }
      }

      setShowUpiModal(true);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to initialize UPI Payment.';
      toast.error(msg);
    }
  };

  // QR Tab state inside UPI Modal
  const [selectedQrTab, setSelectedQrTab] = useState<'dynamic' | 'custom'>('dynamic');

  // Status Polling for UPI Payment Verification
  useEffect(() => {
    if (!showUpiModal || !upiData?.paymentId) return;

    const checkStatus = async () => {
      try {
        setIsCheckingUpiStatus(true);
        const res = await api.get(`/payments/${upiData.paymentId}/status`, { skipToast: true } as any);
        const status = res.data?.data?.status || res.data?.data?.orderPaymentStatus;
        if (status === 'PAID') {
          saveOrderToRecent(upiData.orderId, restaurantSlug);
          clearCart();
          setShowUpiModal(false);
          toast.success('Payment Verified & Order Confirmed! 🎉');
          router.push(`/r/${restaurantSlug}/order/${upiData.orderId}`);
        }
      } catch (err: any) {
        // Silently catch 429 or network blips so user isn't interrupted
        if (err?.response?.status !== 429) {
          console.debug('Polling payment status:', err?.message);
        }
      } finally {
        setIsCheckingUpiStatus(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [showUpiModal, upiData, restaurantSlug, router, clearCart]);


  // Order Confirmation & Review Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingGuestData, setPendingGuestData] = useState<GuestForm | null>(null);

  const initiateGuestOrder = (formData: GuestForm) => {
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    if (!manualTableNumber || !manualTableNumber.trim()) {
      toast.error('Please enter your table or room number.');
      return;
    }
    setPendingGuestData(formData);
    setShowConfirmModal(true);
  };

  const initiateUserOrder = () => {
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    if (!manualTableNumber || !manualTableNumber.trim()) {
      toast.error('Please enter your table or room number.');
      return;
    }
    setPendingGuestData(null);
    setShowConfirmModal(true);
  };

  const confirmAndPlaceOrder = async () => {
    setShowConfirmModal(false);
    if (activeUser) {
      await onUserOrder();
    } else if (pendingGuestData) {
      await onGuestSubmit(pendingGuestData);
    } else {
      await onGuestSubmit({} as any);
    }
  };

  const onGuestSubmit = async (formData: GuestForm) => {
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    if (!manualTableNumber || !manualTableNumber.trim()) {
      toast.error('Please enter your table or room number.');
      return;
    }
    setLoading(true);
    try {
      const token = tableToken || localStorage.getItem(`table_token_${restaurantSlug}`) || (manualTableNumber ? generateUniqueTableCode(restaurantSlug, manualTableNumber.trim()) : '');
            const response = await api.post('/orders/guest', {
        guestName: formData.guestName?.trim() || 'Guest',
        guestPhone: formData.guestPhone?.trim() || '',
        tableNumber: manualTableNumber ? manualTableNumber.trim() : '1',
        tableToken: token,
        paymentMethod: selectedPayment,
        isDirect: selectedPayment === 'RAZORPAY' && onlinePaymentType === 'DIRECT',
        couponCode: couponCode ?? undefined,
        restaurantSlug,
        cartItems: items.map((item) => ({
          menuItemId: item.menuItemId,
          variantId: item.variantId,
          quantity: item.quantity,
          addOns: item.addOns,
        })),
      });

      const { order } = response.data.data as {
        order: { id: string; total: number; razorpayOrderId: string | null };
      };

      if (selectedPayment === 'RAZORPAY') {
        await handleUpiIntentPayment(order.id);
      } else {
        saveOrderToRecent(order.id, restaurantSlug);
        clearCart();
        toast.success('Order placed successfully! 🎉');
        router.push(`/r/${restaurantSlug}/order/${order.id}`);
      }
    } catch (err: any) {
      const responseCode = err.response?.data?.code;
      if (responseCode === 'ITEM_NOT_FOUND') {
        const errorText = err.response?.data?.error || '';
        const missingItem = items.find((item) => errorText.includes(item.menuItemId));
        if (missingItem) {
          removeItem(missingItem.id);
          toast.error(`"${missingItem.name}" is no longer available and has been removed from your cart.`);
          return;
        }
      }
      const errMsg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to place order. Please try again.';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const onUserOrder = async () => {
    if (items.length === 0) return;
    if (!manualTableNumber || !manualTableNumber.trim()) {
      toast.error('Please enter your table or room number.');
      return;
    }
    setLoading(true);
    try {
      const token = tableToken || localStorage.getItem(`table_token_${restaurantSlug}`) || (manualTableNumber ? generateUniqueTableCode(restaurantSlug, manualTableNumber.trim()) : '');
      const response = await api.post('/orders', {
        tableNumber: manualTableNumber ? manualTableNumber.trim() : undefined,
        tableToken: token,
        paymentMethod: selectedPayment,
        isDirect: selectedPayment === 'RAZORPAY' && onlinePaymentType === 'DIRECT',
        couponCode: couponCode ?? undefined,
        restaurantSlug,
        useWallet: false,
        usePoints,
        cartItems: items.map((item) => ({
          menuItemId: item.menuItemId,
          variantId: item.variantId,
          quantity: item.quantity,
          addOns: item.addOns,
        })),
      });

      const { order } = response.data.data as {
        order: { id: string; total: number; razorpayOrderId: string | null };
      };

      if (selectedPayment === 'RAZORPAY') {
        await handleUpiIntentPayment(order.id);
      } else {
        queryClient.invalidateQueries({ queryKey: ['user-profile'] });
        queryClient.invalidateQueries({ queryKey: ['user-profile-loyalty'] });
        saveOrderToRecent(order.id, restaurantSlug);
        clearCart();
        toast.success('Order placed! 🎉');
        router.push(`/r/${restaurantSlug}/order/${order.id}`);
      }
    } catch (err: any) {
      const responseCode = err.response?.data?.code;
      if (responseCode === 'ITEM_NOT_FOUND') {
        const errorText = err.response?.data?.error || '';
        const missingItem = items.find((item) => errorText.includes(item.menuItemId));
        if (missingItem) {
          removeItem(missingItem.id);
          toast.error(`"${missingItem.name}" is no longer available and has been removed from your cart.`);
          return;
        }
      }
      const errMsg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to place order. Please try again.';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemsToOrder = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const token = tableToken || (typeof window !== 'undefined' ? localStorage.getItem(`table_token_${restaurantSlug}`) : '') || (manualTableNumber ? generateUniqueTableCode(restaurantSlug, manualTableNumber.trim()) : '');
      const response = await api.post(`/orders/${addonOrderId}/add-items`, {
        cartItems: items.map((item) => ({
          menuItemId: item.menuItemId,
          variantId: item.variantId,
          quantity: item.quantity,
          addOns: item.addOns,
        })),
        paymentMethod: selectedPayment,
        tableToken: token,
      });

      const { order } = response.data.data as {
        order: { id: string; total: number; razorpayOrderId: string | null };
      };

      // Clean up session storage add-on mode
      sessionStorage.removeItem('qr_restaurant_addon_order_id');
      sessionStorage.removeItem('qr_restaurant_addon_order_num');

      saveOrderToRecent(order.id, restaurantSlug);
      clearCart();
      toast.success('Items successfully added to your order! 🎉');
      router.push(`/r/${restaurantSlug}/order/${order.id}`);
    } catch (err: any) {
      const errMsg = err.response?.data?.error ?? err.response?.data?.message ?? 'Failed to add items to order.';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href={`/r/${restaurantSlug}`} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-display font-bold text-lg">Checkout</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Order Summary */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-display font-semibold mb-3">Order Summary</h2>
          <div className="space-y-2 mb-4" suppressHydrationWarning>
            {mounted && items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.name} × {item.quantity}</span>
                <span>₹{(item.unitPrice * item.quantity).toFixed(0)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1.5 text-sm" suppressHydrationWarning>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span suppressHydrationWarning>₹{subtotalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST (18%)</span><span suppressHydrationWarning>₹{gst.toFixed(2)}</span>
            </div>
            
            {mounted && !addonOrderId && couponDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Coupon ({couponCode})</span><span>-₹{couponDiscount.toFixed(2)}</span>
              </div>
            )}
            {mounted && !addonOrderId && pointsDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Loyalty Points Discount</span><span>-₹{pointsDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>Total</span><span suppressHydrationWarning>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Loyalty Points Card */}
        {loyaltyEnabled && activeUser && pointsAvailable > 0 && !addonOrderId && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center text-orange-500">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Redeem Loyalty Points</p>
                <p className="text-xs text-muted-foreground">
                  You have {pointsAvailable} points (Worth ₹{maxPointsDiscount.toFixed(0)})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUsePoints(!usePoints)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                usePoints
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              {usePoints ? 'Redeemed' : 'Redeem'}
            </button>
          </div>
        )}

        {/* Payment Method - 3 Options: Pay to Waiter, Pay on Counter, Pay via UPI */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-display font-semibold mb-3">Payment Method</h2>
          <div className="space-y-2">
            {[
              {
                value: 'PAY_TO_WAITER',
                label: 'Pay to Waiter',
                sublabel: 'Pay cash, UPI, or card to your waiter at your table',
                icon: <User className="w-5 h-5 text-orange-500" />,
              },
              {
                value: 'COD',
                label: 'Pay on Counter',
                sublabel: 'Pay cash or card at the restaurant counter',
                icon: <Banknote className="w-5 h-5 text-emerald-500" />,
              },
              {
                value: 'RAZORPAY',
                label: 'Pay via UPI',
                sublabel: 'Instant UPI via Google Pay, PhonePe, Paytm, or QR scan',
                icon: <Smartphone className="w-5 h-5 text-primary" />,
              },
            ].map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setSelectedPayment(method.value as 'RAZORPAY' | 'COD' | 'PAY_TO_WAITER')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedPayment === method.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedPayment === method.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {method.icon}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">{method.label}</p>
                    <p className="text-xs text-muted-foreground">{method.sublabel}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    selectedPayment === method.value ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`} />
                </button>
              ))}
            </div>
        </div>

        {selectedPayment === 'PAY_TO_WAITER' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <div className="flex items-center gap-2 text-primary">
              <User className="w-4 h-4" />
              <h3 className="font-display font-semibold text-xs text-foreground">Pay to Waiter</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Place your order now. Your waiter will serve your food and bring the bill to your table, where you can pay via Cash, Card, or UPI scan.
            </p>
          </motion.div>
        )}

        {selectedPayment === 'COD' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 space-y-2 shadow-xs"
          >
            <div className="flex items-center gap-2 text-primary">
              <Banknote className="w-4 h-4" />
              <h3 className="font-display font-semibold text-xs text-foreground">Pay on Counter</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Place your order now. You can settle the bill with cash or card directly at the restaurant counter.
            </p>
          </motion.div>
        )}

        {selectedPayment === 'RAZORPAY' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 space-y-2.5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-primary">
              <Smartphone className="w-4.5 h-4.5" />
              <h3 className="font-display font-semibold text-xs text-foreground">Pay Online via UPI</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When you click <strong>Place Order</strong> below, a secure UPI payment window will open allowing you to pay <strong>₹{grandTotal.toFixed(2)}</strong> via Google Pay, PhonePe, Paytm, or QR scan.
            </p>
            {restaurant?.merchantName && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
                <span className="text-muted-foreground">Merchant / Payee Name:</span>
                <span className="font-semibold text-foreground">{restaurant.merchantName}</span>
              </div>
            )}
            {restaurant?.paymentUpiId && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Merchant UPI ID:</span>
                <span className="font-mono font-medium text-foreground">{restaurant.paymentUpiId}</span>
              </div>
            )}
          </motion.div>
        )}

        {activeUser && activeUser.role !== 'CUSTOMER' ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto text-red-500 text-2xl">
              🚫
            </div>
            <h2 className="font-display font-bold text-lg text-foreground">Ordering Restricted</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              You are logged in as a <strong>{activeUser.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Restaurant Owner'}</strong>. Owners and administrators are not allowed to place orders.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={activeUser.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/owner/dashboard'}
                className="w-full py-3.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-center shadow-md transition-all active:scale-95 text-sm"
              >
                Back to Dashboard
              </Link>
              <button
                onClick={() => {
                  logout();
                  toast.success('Logged out successfully');
                  router.push(`/login?restaurant=${restaurantSlug}`);
                }}
                className="w-full py-3.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl text-center transition-all active:scale-95 text-sm"
              >
                Log Out & Use Customer Account
              </button>
            </div>
          </div>
        ) : addonOrderId ? (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <h2 className="font-display font-semibold text-sm">Add Items to Active Order</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These items will be appended to your active Order #{addonOrderNum} for Table {manualTableNumber || localStorage.getItem(`table_num_${restaurantSlug}`) || '1'}.
            </p>
            <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl text-xs text-primary font-medium">
              📝 Added items will be billed to your running tab. You can settle the final amount at the end of your meal.
            </div>
            <button
              onClick={handleAddItemsToOrder}
              disabled={loading || items.length === 0}
              className="w-full py-4 rounded-2xl text-white font-bold text-base bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Adding Items...' : `Confirm & Add Items · ₹${grandTotal.toFixed(0)}`}
            </button>
          </div>
        ) : activeUser ? (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h2 className="font-display font-semibold mb-3">Your Details</h2>
            <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{activeUser.name}</p>
                <p className="text-xs text-muted-foreground">{activeUser.email}</p>
              </div>
            </div>
                          <div className="mt-4">
                <label className="text-xs font-semibold text-muted-foreground mb-1 flex items-center justify-between">
                  <span>Table Number <span className="text-red-500">*</span></span>
                  {hasTableToken || !!tableNumber ? (
                    <span className="text-[10px] text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> QR Verified (Locked)
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                      Table QR Scan Required
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="Enter Table / Room Number (e.g. 5, Room 301)"
                  value={manualTableNumber}
                  readOnly={hasTableToken || !!tableNumber}
                  onChange={(e) => !(hasTableToken || !!tableNumber) && handleTableNumberChange(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border-0 focus:outline-none text-foreground transition-all ${
                    hasTableToken || !!tableNumber
                      ? 'bg-muted/80 cursor-not-allowed font-semibold text-primary border border-primary/20 select-none'
                      : 'bg-muted focus:ring-2 focus:ring-primary/20'
                  }`}
                />
              </div>
            <button
              onClick={onUserOrder}
              disabled={loading || items.length === 0}
              className="w-full mt-4 py-4 rounded-2xl text-white font-bold text-base bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Placing Order...' : `Place Order · ₹${grandTotal.toFixed(0)}`}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(initiateGuestOrder)} className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">Your Details</h2>
              <Link
                href={`/login?restaurant=${restaurantSlug}`}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Have an account? Log in (Optional)
              </Link>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Full Name <span className="text-muted-foreground text-xs font-normal">(Optional)</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  {...register('guestName')}
                  placeholder="John Doe (Optional)"
                  className="w-full pl-9 pr-4 py-3 bg-muted rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Phone Number <span className="text-muted-foreground text-xs font-normal">(Optional)</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  {...register('guestPhone')}
                  placeholder="9876543210 (Optional)"
                  type="tel"
                  maxLength={10}
                  className="w-full pl-9 pr-4 py-3 bg-muted rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                />
              </div>
            </div>

                          <div>
                <label className="text-sm font-medium mb-1.5 flex items-center justify-between">
                  <span>Table / Room Number <span className="text-red-500">*</span></span>
                  {hasTableToken ? (
                    <span className="text-[10px] text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Scanned QR (Locked)
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Enter your table or room
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="Enter Table Number (e.g. 5, 11, Room 102)"
                  value={manualTableNumber}
                  readOnly={hasTableToken}
                  onChange={(e) => !hasTableToken && handleTableNumberChange(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl text-sm border-0 focus:outline-none text-foreground transition-all ${
                    hasTableToken
                      ? 'bg-muted/80 cursor-not-allowed font-semibold text-primary border border-primary/20 select-none'
                      : 'bg-muted focus:ring-2 focus:ring-primary/20'
                  }`}
                />
              </div>
            <button
              type="submit"
              disabled={loading || items.length === 0}
              className="w-full py-4 rounded-2xl text-white font-bold text-base bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Placing Order...' : `Place Order · ₹${grandTotal.toFixed(0)}`}
            </button>
          </form>
        )}
      </div>


      {/* Final Order Review & Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex min-h-full items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-base text-foreground">Confirm Your Order</h2>
                    <p className="text-xs text-muted-foreground">Review your dishes before sending to kitchen</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                {/* Warning Alert Banner */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                    <span className="font-semibold">Notice: Orders cannot be changed after placing!</span>
                    <p className="mt-0.5 opacity-90">
                      Once placed, your order is sent directly to the kitchen. Please check items and quantities below. If you want to change anything, you can edit it right here!
                    </p>
                  </div>
                </div>

                {/* Items List with Edit Quantities */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Items</h3>
                    <Link
                      href={`/r/${restaurantSlug}`}
                      onClick={() => setShowConfirmModal(false)}
                      className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add More Dishes
                    </Link>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 divide-y divide-border/40">
                    {items.map((item) => (
                      <div key={item.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">₹{item.unitPrice.toFixed(0)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/40">
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity > 1) updateQuantity(item.id, item.quantity - 1);
                                else removeItem(item.id);
                              }}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors font-bold text-xs"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-semibold text-sm w-14 text-right">
                            ₹{(item.unitPrice * item.quantity).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Table & Payment Details */}
                <div className="bg-muted/40 border border-border/60 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Dining Location:</span>
                    <span className="font-bold text-foreground">Table {manualTableNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment Method:</span>
                    <span className="font-semibold text-foreground">
                      {selectedPayment === 'PAY_TO_WAITER'
                        ? 'Pay to Waiter'
                        : selectedPayment === 'COD'
                        ? 'Pay on Counter'
                        : 'Pay via UPI'}
                    </span>
                  </div>
                  <div className="border-t border-border/50 pt-2 flex items-center justify-between font-bold text-sm">
                    <span className="text-foreground">Total to Pay:</span>
                    <span className="text-primary font-bold text-base">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 sm:p-5 border-t border-border bg-muted/10 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 px-3 rounded-xl border border-border font-semibold text-xs hover:bg-muted transition-colors text-foreground flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Order
                </button>
                <button
                  type="button"
                  onClick={confirmAndPlaceOrder}
                  disabled={loading || items.length === 0}
                  className="flex-[1.5] py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow-md shadow-orange-500/20 hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {loading ? 'Sending to Kitchen...' : `Confirm & Place Order · ₹${grandTotal.toFixed(0)}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UPI Intent Payment Modal & Verification Screen */}
      <AnimatePresence>
        {showUpiModal && upiData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowUpiModal(false);
                toast.info('Payment window closed. You can track payment verification on your order page.');
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10 my-auto flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 sm:p-5 relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpiModal(false);
                    toast.info('Payment window closed.');
                  }}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 mb-1">
                  <div className="bg-white/20 p-1.5 rounded-lg">
                    <Smartphone className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-bold tracking-wider uppercase opacity-90">UPI Deep Link Payment</span>
                </div>
                <h3 className="font-display font-bold text-xl">Pay with UPI App</h3>
                <p className="text-xs opacity-85 mt-1">Google Pay · PhonePe · Paytm · BHIM</p>
              </div>

              {/* Order Info & Reference */}
              <div className="p-3.5 sm:p-4 border-b border-border bg-muted/30 flex justify-between items-center flex-shrink-0">
                <div>
                  <p className="text-xs text-muted-foreground">Authoritative Amount</p>
                  <p className="font-display font-extrabold text-2xl text-foreground font-mono">₹{upiData.amount.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold inline-block border border-primary/20 font-mono">
                    Ref: {upiData.txnRef}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Pay to: <span className="font-semibold text-foreground">{upiData.merchantName}</span></p>
                </div>
              </div>

              {/* QR Code Selection Tabs if owner uploaded custom QR image */}
              {restaurant?.paymentQrCode && (
                <div className="flex border-b border-border p-1 bg-muted/20 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedQrTab('dynamic')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all ${
                      selectedQrTab === 'dynamic' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    Auto Dynamic QR (₹{upiData.amount.toFixed(0)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedQrTab('custom')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all ${
                      selectedQrTab === 'custom' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    Owner Uploaded QR Image
                  </button>
                </div>
              )}

              {/* QR Code & Mobile Launch */}
              <div className="p-4 sm:p-5 space-y-4 text-center overflow-y-auto flex-1 overscroll-contain">
                {selectedQrTab === 'custom' && restaurant?.paymentQrCode ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-border max-w-[200px] mx-auto shadow-sm p-3">
                    <img
                      src={getImageUrl(restaurant.paymentQrCode)}
                      alt="Owner Uploaded Payment QR"
                      className="w-36 h-36 object-contain"
                    />
                    <span className="text-[10px] text-gray-500 mt-2 font-semibold flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-primary" /> Owner's Uploaded QR Image
                    </span>
                  </div>
                ) : upiQrCodeDataUrl ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-border max-w-[200px] mx-auto shadow-sm p-3">
                    <img
                      src={upiQrCodeDataUrl}
                      alt="UPI Payment QR Code"
                      className="w-36 h-36 object-contain"
                    />
                    <span className="text-[10px] text-gray-500 mt-2 font-semibold flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-primary" /> Scan with any UPI App (Exact ₹{upiData.amount.toFixed(2)})
                    </span>
                  </div>
                ) : (
                  <div className="w-36 h-36 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}

                {/* Primary Open UPI App Button */}
                <a
                  href={upiData.upiIntentUrl}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Open UPI App to Pay ₹{upiData.amount.toFixed(0)}</span>
                </a>

                {/* Specific App Direct Launch Pills */}
                <div className="flex items-center gap-2 pt-0.5">
                  {upiData.phonepeUrl && (
                    <a
                      href={upiData.phonepeUrl}
                      className="flex-1 py-2 px-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
                    >
                      <span>🟣 PhonePe</span>
                    </a>
                  )}
                  {upiData.gpayUrl && (
                    <a
                      href={upiData.gpayUrl}
                      className="flex-1 py-2 px-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
                    >
                      <span>🔵 Google Pay</span>
                    </a>
                  )}
                  {upiData.paytmUrl && (
                    <a
                      href={upiData.paytmUrl}
                      className="flex-1 py-2 px-2 rounded-xl bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-all"
                    >
                      <span>💠 Paytm</span>
                    </a>
                  )}
                </div>

                {/* Anti-Fraud / "Declined by UPI Network" Guidance Card */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-left space-y-2 text-xs">
                  <div className="flex items-start gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                    <span className="text-sm">🛡️</span>
                    <div>
                      <p className="leading-tight">App says &ldquo;Declined to protect money&rdquo;?</p>
                      <p className="text-[10px] text-muted-foreground font-normal mt-0.5 leading-snug">
                        UPI security blocks web redirects for new receivers. Tap below to pay safely:
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    {upiData.fallbackUpiUrl && (
                      <a
                        href={upiData.fallbackUpiUrl}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-card border border-border font-bold text-[11px] text-center hover:bg-muted text-foreground transition-all flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span>📱 Open App & Enter ₹{upiData.amount.toFixed(0)}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(upiData.merchantVpa);
                        toast.success(`UPI ID copied: ${upiData.merchantVpa}`);
                      }}
                      className="flex-1 py-2 px-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-[11px] text-center hover:bg-primary/20 transition-all flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy UPI ID</span>
                    </button>
                  </div>
                </div>

                {/* Details Copy Bar */}
                <div className="space-y-2 text-xs text-left">
                  <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl">
                    <div className="min-w-0 pr-2">
                      <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Merchant VPA / UPI ID</span>
                      <span className="font-mono font-medium text-foreground text-[11px] truncate block">{upiData.merchantVpa}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(upiData.merchantVpa);
                        toast.success('UPI ID copied!');
                      }}
                      className="p-2 bg-muted hover:bg-muted-foreground/10 rounded-lg text-primary transition-all flex items-center justify-center shrink-0"
                      title="Copy UPI ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Real-time Verification Status Box */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div>
                    <p className="font-semibold text-xs text-foreground">Verifying payment with backend server...</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isCheckingUpiStatus ? 'Checking provider transaction state...' : 'Waiting for payment confirmation. Page will auto-update upon payment.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border flex gap-3 bg-muted/10 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpiModal(false);
                    toast.info('You can track payment status on the order tracking page.');
                  }}
                  className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors text-foreground"
                >
                  Close & View Order
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
