'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  ChefHat,
  Package,
  Bike,
  Star,
  RotateCcw,
  Utensils,
  MapPin,
  Bed,
  CreditCard,
  Copy,
  Sparkles,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import { CustomerNotificationModal } from './CustomerNotificationModal';
import { playNewOrderSound, processRealTimeEvent } from '@/utils/audio';
import { getImageUrl } from '@/lib/image';
import { io, Socket } from 'socket.io-client';
import api, { getSocketUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { InvoiceDownload } from './InvoiceDownload';
import { useCartStore } from '@/store/cart.store';

// ─── Tracking Step Definitions ────────────────────────────────────────────────

const DELIVERY_STEPS = [
  { key: 'PENDING',    icon: <Clock className="w-5 h-5" />,        label: 'Order Placed' },
  { key: 'CONFIRMED',  icon: <CheckCircle2 className="w-5 h-5" />, label: 'Confirmed' },
  { key: 'PREPARING',  icon: <ChefHat className="w-5 h-5" />,      label: 'Preparing' },
  { key: 'READY',      icon: <Package className="w-5 h-5" />,      label: 'Ready for Pickup' },
  { key: 'ON_THE_WAY', icon: <Bike className="w-5 h-5" />,         label: 'On the Way' },
  { key: 'DELIVERED',  icon: <Star className="w-5 h-5" />,         label: 'Delivered' },
];

const DINE_IN_STEPS = [
  { key: 'PENDING',   icon: <Clock className="w-5 h-5" />,        label: 'Order Placed' },
  { key: 'CONFIRMED', icon: <CheckCircle2 className="w-5 h-5" />, label: 'Confirmed' },
  { key: 'PREPARING', icon: <ChefHat className="w-5 h-5" />,      label: 'Preparing' },
  { key: 'READY',     icon: <Utensils className="w-5 h-5" />,     label: 'Ready to Serve' },
  { key: 'DELIVERED', icon: <Star className="w-5 h-5" />,         label: 'Served & Completed' },
];

/**
 * Returns the step index for a given status.
 * 'BAKING' is treated as an intermediate state mapped to the PREPARING slot.
 */
function getStepIndex(
  status: string,
  steps: typeof DELIVERY_STEPS | typeof DINE_IN_STEPS,
): number {
  const idx = steps.findIndex((s) => s.key === status);
  if (idx !== -1) return idx;
  if (status === 'BAKING') return steps.findIndex((s) => s.key === 'PREPARING');
  return 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Address {
  id: string;
  flat: string;
  street: string;
  area: string;
  city: string;
  pincode: string;
}

interface Order {
  id: string;
  restaurantId: string;
  status: string;
  addOnStatus?: string | null;
  lastAddOnAt?: string | null;
  subtotal: number;
  gstAmount: number;
  deliveryFee: number;
  packagingFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  guestName: string | null;
  tableNumber: string | null;
  addressId: string | null;
  address: Address | null;
  createdAt: string;
  restaurant: {
    name: string;
    logo: string | null;
    themeColor: string | null;
    phone: string | null;
    paymentQrCode?: string | null;
    paymentUpiId?: string | null;
    paymentPhone?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
    bankAccountHolder?: string | null;
  };
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    menuItem: { name: string; image: string | null };
    variant: { name: string } | null;
    addOns?: any;
  }>;
  review?: { rating: number; comment?: string | null } | null;
}

interface OrderTrackingPageProps {
  orderId: string;
  restaurantSlug: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderTrackingPage({ orderId, restaurantSlug }: OrderTrackingPageProps) {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>('PENDING');
  const [currentAddOnStatus, setCurrentAddOnStatus] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [showPaymentNotReceivedModal, setShowPaymentNotReceivedModal] = useState(false);
  const [paymentNotReceivedAmount, setPaymentNotReceivedAmount] = useState<number | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch unread notifications count for customer
  const { data: customerNotifData } = useQuery({
    queryKey: ['customer-notifications-count'],
    queryFn: async () => {
      const res = await api.get('/profile/notifications');
      return res.data.data as { unreadCount: number };
    },
    enabled: !!user?.id && !!accessToken && mounted,
    retry: false,
    refetchInterval: 12000,
  });

  const unreadNotifCount = customerNotifData?.unreadCount ?? 0;

  const qc = useQueryClient();
  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/orders/${orderId}/review`, { rating, comment });
    },
    onSuccess: () => {
      toast.success('Thank you for your feedback!');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to submit rating';
      toast.error(msg);
    },
  });

  const handleAddMoreItems = () => {
    if (!order) return;
    sessionStorage.setItem('qr_restaurant_addon_order_id', orderId);
    sessionStorage.setItem('qr_restaurant_addon_order_num', order.id.slice(-8).toUpperCase());
    router.push(`/r/${restaurantSlug}`);
  };

  const handleReorder = () => {
    if (!order || !order.items || order.items.length === 0) {
      toast.error('No items found in this order to reorder.');
      return;
    }
    const { addItem, setRestaurant } = useCartStore.getState();
    if (restaurantSlug && order.restaurantId) {
      setRestaurant(restaurantSlug, order.restaurantId);
    }
    for (const item of order.items) {
      const anyItem = item as any;
      const menuItemId = anyItem.menuItemId || item.id;
      const name = anyItem.name || anyItem.menuItem?.name || 'Item';
      const image = anyItem.image || anyItem.menuItem?.image || null;
      const isVeg = anyItem.isVeg ?? anyItem.menuItem?.isVeg ?? true;
      const variantId = anyItem.variantId || null;
      const variantName = anyItem.variantName || anyItem.variant?.name || null;
      const unitPrice = item.unitPrice || anyItem.price || 0;
      const addOns = anyItem.addOns || [];
      const quantity = item.quantity || 1;

      addItem({
        menuItemId,
        name,
        image,
        isVeg,
        variantId,
        variantName,
        unitPrice,
        addOns,
        quantity,
      });
    }
    toast.success('Items added to cart!');
    router.push(`/r/${restaurantSlug}`);
  };

  // ── Fetch order data ──────────────────────────────────────────────────────
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const response = await api.get(`/orders/${orderId}`, { skipToast: true });
      return response.data.data.order as Order;
    },
    enabled: mounted && !!orderId,
    refetchInterval: (query) => {
      const orderData = query.state.data as Order | undefined;
      // Auto-poll active orders or active add-on journeys every 4 seconds
      if (
        !orderData ||
        (orderData.status !== 'DELIVERED' && orderData.status !== 'CANCELLED') ||
        (orderData.addOnStatus && orderData.addOnStatus !== 'DELIVERED' && orderData.addOnStatus !== 'CANCELLED')
      ) {
        return 4000;
      }
      return false;
    },
  });

  useEffect(() => {
    if (order?.status) {
      setCurrentStatus(order.status);
    }
    if (order?.addOnStatus !== undefined) {
      setCurrentAddOnStatus(order.addOnStatus);
    }
  }, [order?.status, order?.addOnStatus]);

  // ── Socket.io real-time tracking ──────────────────────────────────────────
  useEffect(() => {
    const socket: Socket = io(
      getSocketUrl(),
      { transports: ['polling', 'websocket'], withCredentials: true },
    );

    // ✅ Correct event name: 'join:order'
    socket.emit('join:order', orderId);

    const handleStatusUpdate = (data: {
      orderId: string;
      status?: string;
      addOnStatus?: string | null;
      paymentStatus?: string;
      reason?: string;
    }) => {
      if (data.orderId === orderId) {
        processRealTimeEvent('order_status_changed', () => {
          if (data.status) {
            setCurrentStatus(data.status);
            const statusLabels: Record<string, string> = {
              CONFIRMED: '🎉 Order Confirmed!',
              PREPARING: '👨‍🍳 Kitchen is preparing your order!',
              BAKING: '🔥 Order is in the kitchen!',
              READY: '🍽️ Order Ready!',
              ON_THE_WAY: '🚴 Order is on the way!',
              DELIVERED: '✅ Order Served!',
              CANCELLED: '❌ Order Cancelled',
            };
            if (data.status === 'CANCELLED') {
              toast.error(`Order Cancelled${data.reason ? `: ${data.reason}` : ''}`, { duration: 7000, id: 'order-status-cancelled' });
            } else {
              toast.success(statusLabels[data.status] ?? `Order status: ${data.status.replace(/_/g, ' ')}`, { id: 'order-status-update' });
            }
            if (data.status === 'DELIVERED') {
              setShowRating(true);
            }
          }

          if (data.paymentStatus === 'PAID') {
            toast.success('✅ Payment Confirmed by Restaurant!', { id: 'payment-confirmed-toast' });
          } else if (data.paymentStatus === 'FAILED') {
            toast.error('⚠️ Payment Not Confirmed by Restaurant.', { id: 'payment-failed-toast' });
          }

          if (data.addOnStatus !== undefined) {
            setCurrentAddOnStatus(data.addOnStatus);
          }

          if (data.addOnStatus) {
            const addonLabels: Record<string, string> = {
              PREPARING: '👨‍🍳 Add-on items are being prepared!',
              READY: '🍽️ Add-on items are ready to serve!',
              DELIVERED: '✅ Add-on items served!',
              CANCELLED: '🚫 Add-on items have been cancelled.',
            };
            if (data.addOnStatus === 'CANCELLED') {
              toast.error(addonLabels[data.addOnStatus], { id: 'addon-cancelled-toast' });
            } else {
              toast.info(addonLabels[data.addOnStatus] ?? `Add-on status: ${data.addOnStatus}`, { id: 'addon-status-toast' });
            }
          }
        });

        qc.invalidateQueries({ queryKey: ['order', orderId] });
      }
    };

    socket.on('order:status_updated', handleStatusUpdate);
    socket.on('order_status_changed', handleStatusUpdate);

    socket.on('order_cancelled', (data: any) => {
      if (data.orderId === orderId) {
        processRealTimeEvent('order_cancelled', () => {
          toast.error(`⚠️ Order Cancelled${data.reason ? `: ${data.reason}` : ''}`, { duration: 7000 });
          qc.invalidateQueries({ queryKey: ['order', orderId] });
        });
      }
    });

    socket.on('driver_assigned', (data: any) => {
      if (data.orderId === orderId) {
        processRealTimeEvent('driver_assigned', () => {
          toast.info(`🚗 Driver Assigned to your order!`, { duration: 7000 });
          qc.invalidateQueries({ queryKey: ['order', orderId] });
        });
      }
    });

    // Listen for payment not received notification from owner
    socket.on('payment:not_received', (data: { orderId: string; amount: number }) => {
      if (data.orderId === orderId) {
        processRealTimeEvent('order_status_changed', () => {
          setPaymentNotReceivedAmount(data.amount);
          setShowPaymentNotReceivedModal(true);
          toast.error('⚠️ Payment not received by restaurant!', { duration: 5000 });
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId, qc]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading || !order) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-8 skeleton rounded-lg w-48" />
          <div className="h-40 skeleton rounded-2xl" />
          <div className="h-32 skeleton rounded-2xl" />
          <div className="h-48 skeleton rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Determine order type and steps ────────────────────────────────────────
  const isDeliveryOrder = Boolean(order.addressId || order.address);
  const steps = isDeliveryOrder ? DELIVERY_STEPS : DINE_IN_STEPS;
  const stepIndex = getStepIndex(currentStatus, steps);

  const themeColor = order.restaurant.themeColor ?? '#E85D04';
  const isCancelled = currentStatus === 'CANCELLED';
  const isCompleted  = currentStatus === 'DELIVERED';

  const completedLabel = isDeliveryOrder ? '✅ Order Delivered!' : '✅ Enjoy Your Meal!';
  const trackingLabel  = isDeliveryOrder ? '🛵 Tracking Your Delivery' : '🍽️ Tracking Your Order';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Payment Not Received Alert Modal */}
      <AnimatePresence>
        {showPaymentNotReceivedModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="bg-card border-2 border-red-500 rounded-3xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
                <AlertTriangle className="w-8 h-8 animate-bounce" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground font-display">⚠️ Payment Not Received</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Kindly do the payment of <strong className="text-foreground font-semibold">₹{(paymentNotReceivedAmount || order.total).toFixed(2)}</strong> for processing of your order or it will be cancelled.
                </p>
              </div>

              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/30 rounded-2xl p-3 text-xs text-red-700 dark:text-red-400 font-medium">
                Please verify your transaction or pay using the restaurant payment details shown on this page.
              </div>

              <button
                onClick={() => setShowPaymentNotReceivedModal(false)}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md transition-all"
              >
                I Understand, Pay Now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restaurant Header */}
      <div
        className="px-4 py-6"
        style={{ background: `linear-gradient(135deg, ${themeColor}15, ${themeColor}05)` }}
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1.5 flex-wrap">
                <span>Order #{order.id.slice(-8).toUpperCase()}</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-orange-400" />
                  {new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              </p>
              <h1 className="font-display text-2xl font-bold">{order.restaurant.name}</h1>
            </div>
            <button
              onClick={() => setShowNotifModal(true)}
              className="relative p-2 bg-card hover:bg-muted border border-border rounded-xl text-foreground transition-all shadow-xs"
              title="View Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>
          </div>

          {/* Dine-In / Room: show table or room number */}
          {!isDeliveryOrder && order.tableNumber && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              {order.tableNumber.toLowerCase().includes('room') || order.tableNumber.toLowerCase().includes('suite') ? (
                <>
                  <Bed className="w-3.5 h-3.5" />
                  {order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`}
                </>
              ) : (
                <>
                  <Utensils className="w-3.5 h-3.5" />
                  {order.tableNumber.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`}
                </>
              )}
            </p>
          )}

          {/* Delivery: show delivery address */}
          {isDeliveryOrder && order.address && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {order.address.flat}, {order.address.street}, {order.address.city} –{' '}
              {order.address.pincode}
            </p>
          )}

          {/* Badge showing order type & payment status */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${themeColor}20`, color: themeColor }}
            >
              {isDeliveryOrder ? (
                <>
                  <Bike className="w-3 h-3" /> Home Delivery
                </>
              ) : (
                <>
                  <Utensils className="w-3 h-3" /> Dine-In
                </>
              )}
            </span>

            {order.paymentStatus === 'PAID' ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                ✅ Payment Confirmed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                ⏳ Payment Pending
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-5">
        {/* Add-on Order Journey Banner */}
        {(() => {
          const activeAddOnStatus = currentAddOnStatus !== null ? currentAddOnStatus : order.addOnStatus;
          if (!activeAddOnStatus) return null;

          return (
            <div className={`border-2 rounded-2xl p-5 shadow-lg space-y-3 ${
              activeAddOnStatus === 'CANCELLED'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-gradient-to-r from-blue-500/10 via-amber-500/10 to-emerald-500/10 border-blue-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display font-bold text-sm text-foreground">
                  <Sparkles className={`w-5 h-5 ${activeAddOnStatus === 'CANCELLED' ? 'text-red-500' : 'text-blue-500 animate-pulse'}`} />
                  <span>⚡ Add-on Items Journey</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold text-white shadow-sm ${
                  activeAddOnStatus === 'CANCELLED'
                    ? 'bg-red-500'
                    : activeAddOnStatus === 'PREPARING'
                    ? 'bg-blue-500'
                    : activeAddOnStatus === 'READY'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}>
                  {activeAddOnStatus === 'CANCELLED'
                    ? '🚫 Add-ons Cancelled'
                    : activeAddOnStatus === 'PREPARING'
                    ? '👨‍🍳 Preparing Add-ons'
                    : activeAddOnStatus === 'READY'
                    ? '🍽️ Ready to Serve'
                    : '✅ Add-ons Served'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {activeAddOnStatus === 'CANCELLED'
                  ? 'Your add-on items have been cancelled by the restaurant.'
                  : activeAddOnStatus === 'PREPARING' 
                  ? 'The kitchen has received your add-on items and is preparing them right now!' 
                  : activeAddOnStatus === 'READY' 
                  ? 'Your add-on items are ready and will be served to your table shortly!' 
                  : 'Your add-on items have been served. Enjoy your meal!'}
              </p>
              {/* Add-on Progress Steps */}
              {activeAddOnStatus !== 'CANCELLED' && (
                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[11px] font-bold">
                  <div className={`p-2 rounded-xl border transition-all ${activeAddOnStatus === 'PREPARING' ? 'bg-blue-500 text-white border-blue-600 shadow-md scale-105' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                    1. Preparing
                  </div>
                  <div className={`p-2 rounded-xl border transition-all ${activeAddOnStatus === 'READY' ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-105' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                    2. Ready to Serve
                  </div>
                  <div className={`p-2 rounded-xl border transition-all ${activeAddOnStatus === 'DELIVERED' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md scale-105' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                    3. Served
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Status tracker */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-display font-semibold mb-5">
            {isCancelled ? '❌ Order Cancelled' : isCompleted ? completedLabel : trackingLabel}
          </h2>

          {!isCancelled && (
            <div className="space-y-4">
              {steps.map((step, idx) => {
                const isStepCompleted = idx <= stepIndex;
                const isActive = idx === stepIndex;

                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isStepCompleted
                          ? 'text-white shadow-lg'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      style={isStepCompleted ? { backgroundColor: themeColor } : {}}
                    >
                      {step.icon}
                    </div>

                    <div className="flex-1">
                      <p
                        className={`font-medium text-sm ${
                          isActive || isStepCompleted
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {step.label}
                      </p>
                      {isActive && !isCompleted && (
                        <motion.p
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="text-xs"
                          style={{ color: themeColor }}
                        >
                          In progress...
                        </motion.p>
                      )}
                    </div>

                    {isStepCompleted && (
                      <CheckCircle2
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: themeColor }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Add More Items Card (Available throughout active dining) */}
        {!['DELIVERED', 'CANCELLED'].includes(currentStatus) && (
          <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border-2 border-orange-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <span>🍽️ Need more dishes, rotis or drinks?</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add extra items to your table anytime — fires directly to the kitchen without checkout!
              </p>
            </div>
            <button
              onClick={handleAddMoreItems}
              className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 whitespace-nowrap flex items-center gap-1 shrink-0"
            >
              <span>➕ Add Items</span>
            </button>
          </div>
        )}

        {/* Direct Payment Card */}
        {order.paymentStatus !== 'PAID' && order.paymentMethod === 'RAZORPAY' && (order.restaurant.paymentQrCode || order.restaurant.paymentUpiId || order.restaurant.paymentPhone || order.restaurant.bankAccountNumber) && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <CreditCard className="w-5 h-5 text-primary" style={{ color: themeColor }} />
              <h3 className="font-display font-semibold text-sm">Direct Payment Details</h3>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Please transfer the total amount of <strong className="text-foreground">₹{order.total.toFixed(2)}</strong> directly to the restaurant owner using the details below:
            </p>

            {order.restaurant.paymentQrCode && (
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-border max-w-[200px] mx-auto">
                <img
                  src={getImageUrl(order.restaurant.paymentQrCode)}
                  alt="Restaurant Payment QR"
                  className="w-40 h-40 object-contain"
                />
                <span className="text-[10px] text-gray-500 mt-1 font-semibold">Scan to Pay</span>
              </div>
            )}

            <div className="space-y-2.5 text-xs">
              {order.restaurant.paymentUpiId && (
                <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">UPI ID</span>
                    <span className="font-mono font-medium text-foreground">{order.restaurant.paymentUpiId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(order.restaurant.paymentUpiId || '');
                      toast.success('UPI ID copied!');
                    }}
                    className="p-2 bg-muted hover:bg-muted-foreground/10 rounded-lg text-primary transition-all flex items-center justify-center"
                    title="Copy UPI ID"
                    style={{ color: themeColor }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {order.restaurant.paymentPhone && (
                <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Phone for Payment</span>
                    <span className="font-mono font-medium text-foreground">{order.restaurant.paymentPhone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(order.restaurant.paymentPhone || '');
                      toast.success('Phone number copied!');
                    }}
                    className="p-2 bg-muted hover:bg-muted-foreground/10 rounded-lg text-primary transition-all flex items-center justify-center"
                    title="Copy Phone"
                    style={{ color: themeColor }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {order.restaurant.bankAccountNumber && (
                <div className="p-3 bg-muted/20 border border-border/60 rounded-xl space-y-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Bank Account Details</span>
                  
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {order.restaurant.bankAccountHolder && (
                      <div>
                        <span className="text-muted-foreground block">Holder Name</span>
                        <span className="font-medium text-foreground">{order.restaurant.bankAccountHolder}</span>
                      </div>
                    )}
                    {order.restaurant.bankName && (
                      <div>
                        <span className="text-muted-foreground block">Bank Name</span>
                        <span className="font-medium text-foreground">{order.restaurant.bankName}</span>
                      </div>
                    )}
                    <div className="col-span-2 flex items-center justify-between border-t border-border/50 pt-1.5 mt-1">
                      <div>
                        <span className="text-muted-foreground block">Account Number</span>
                        <span className="font-mono font-medium text-foreground">{order.restaurant.bankAccountNumber}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(order.restaurant.bankAccountNumber || '');
                          toast.success('Account number copied!');
                        }}
                        className="p-2 bg-muted hover:bg-muted-foreground/10 rounded-lg text-primary transition-all flex items-center justify-center"
                        title="Copy Account Number"
                        style={{ color: themeColor }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {order.restaurant.bankIfsc && (
                      <div className="col-span-2 flex items-center justify-between border-t border-border/50 pt-1.5 mt-1">
                        <div>
                          <span className="text-muted-foreground block">IFSC Code</span>
                          <span className="font-mono font-medium text-foreground">{order.restaurant.bankIfsc}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(order.restaurant.bankIfsc || '');
                            toast.success('IFSC Code copied!');
                          }}
                          className="p-2 bg-muted hover:bg-muted-foreground/10 rounded-lg text-primary transition-all flex items-center justify-center"
                          title="Copy IFSC Code"
                          style={{ color: themeColor }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl text-[11px] leading-relaxed font-medium bg-muted/50 border border-border">
              Your order has been placed. Once you complete the payment, the restaurant owner will manually confirm and mark the order as PAID.
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-display font-semibold mb-3">Your Order</h2>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="space-y-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="flex justify-between text-sm">
                  <span>
                    {item.menuItem.name}
                    {item.variant && (
                      <span className="text-muted-foreground"> ({item.variant.name})</span>
                    )}
                    <span className="text-muted-foreground"> × {item.quantity}</span>
                  </span>
                  <span>₹{(item.unitPrice * item.quantity).toFixed(0)}</span>
                </div>
                {item.addOns && Array.isArray(item.addOns) && item.addOns.length > 0 && (
                  <div className="text-[11px] text-muted-foreground pl-2">
                    + {item.addOns.map((ao: any) => ao.name).join(', ')}
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST (18%)</span>
                <span>₹{order.gstAmount.toFixed(2)}</span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span>₹{order.deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {order.packagingFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Packaging Fee</span>
                  <span>₹{order.packagingFee.toFixed(2)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Discount</span>
                  <span>-₹{order.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-bold text-base border-t border-border pt-2">
                <div>
                  <span className="block">{order.paymentStatus === 'PAID' ? 'Total Paid' : 'Total Amount'}</span>
                  <span className={`text-xs block font-extrabold ${order.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-amber-600 dark:text-amber-400 animate-pulse'}`}>
                    {order.paymentStatus === 'PAID' ? '✅ Payment Confirmed' : '⏳ Payment Pending'}
                  </span>
                </div>
                <span className="text-lg">₹{order.total.toFixed(2)}</span>
              </div>
            </div>
            {!['DELIVERED', 'CANCELLED'].includes(order.status) && (
              <div className="space-y-2 mt-3">
                {order.paymentStatus !== 'PAID' && order.tableNumber && (
                  <button
                    onClick={async () => {
                      try {
                        const token = typeof window !== 'undefined' ? localStorage.getItem(`table_token_${restaurantSlug}`) || '' : '';
                        await api.post(`/menu/${restaurantSlug}/call-waiter`, {
                          tableNumber: order.tableNumber,
                          tableToken: token,
                          type: 'payment',
                          amount: order.total,
                          paymentMethod: order.paymentMethod,
                        });
                        const isRoomOrder = Boolean(order.tableNumber && (order.tableNumber.toLowerCase().includes('room') || order.tableNumber.toLowerCase().includes('suite')));
                        const locLabel = isRoomOrder
                          ? (order.tableNumber?.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`)
                          : (order.tableNumber?.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`);
                        toast.success(`${isRoomOrder ? '🛎️ Room service call for payment sent for ' : '🙋 Call Waiter for Payment sent for '}${locLabel}!`);
                      } catch (err: any) {
                        const isServerDown = err.code === 'ERR_NETWORK' || !err.response || err.response?.status >= 500;
                        if (!isServerDown) {
                          toast.error(err.response?.data?.error || 'Could not call staff for payment.');
                        }
                      }
                    }}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>
                      {order.tableNumber && (order.tableNumber.toLowerCase().includes('room') || order.tableNumber.toLowerCase().includes('suite'))
                        ? `🛎️ Call Room Service for Payment (${order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`})`
                        : `🙋 Call Waiter for Payment (${order.tableNumber?.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`})`}
                    </span>
                  </button>
                )}
                <button
                  onClick={handleAddMoreItems}
                  className="w-full py-2.5 px-4 border border-dashed rounded-xl text-xs font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                  style={{ color: themeColor, borderColor: themeColor }}
                >
                  <span>➕ Add More Items (Roti, Paneer, etc.)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rating — shown when order is completed */}
        {(order.review || (showRating || isCompleted)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-sm"
          >
            {order.review ? (
              <div className="text-center py-2">
                <span className="text-emerald-500 font-semibold block mb-1 text-sm">🎉 Thank you for your feedback!</span>
                <div className="flex gap-1 justify-center mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="text-xl">
                      {star <= order.review!.rating ? '★' : '☆'}
                    </span>
                  ))}
                </div>
                {order.review.comment && (
                  <p className="text-xs text-muted-foreground italic bg-muted/40 p-2 rounded-lg max-w-xs mx-auto">
                    "{order.review.comment}"
                  </p>
                )}
              </div>
            ) : (
              <>
                <h2 className="font-display font-semibold mb-2 text-sm text-center">Rate Your Experience</h2>
                <div className="flex gap-2 justify-center mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                    >
                      {star <= rating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <div className="space-y-3">
                    <textarea
                      placeholder="Write an optional review message (Max 500 chars)..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={2}
                      maxLength={500}
                    />
                    <button
                      className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ backgroundColor: themeColor }}
                      onClick={() => submitReviewMutation.mutate()}
                      disabled={submitReviewMutation.isPending}
                    >
                      {submitReviewMutation.isPending ? 'Submitting...' : 'Submit Rating'}
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Link
              href={`/r/${restaurantSlug}`}
              className="flex-1 py-3 rounded-xl border border-border text-center text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center"
            >
              Back to Menu
            </Link>
            <button
              onClick={handleReorder}
              className="flex-1 py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
              style={{ backgroundColor: themeColor }}
            >
              <RotateCcw className="w-4 h-4" />
              Reorder
            </button>
          </div>
          {['CONFIRMED', 'PREPARING', 'BAKING', 'READY', 'ON_THE_WAY', 'DELIVERED'].includes(currentStatus) && (
            <InvoiceDownload order={order} themeColor={themeColor} />
          )}
        </div>
      </div>
      {/* Customer Notification Modal */}
      <CustomerNotificationModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
      />
    </div>
  );
}
