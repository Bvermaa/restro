'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, CheckCircle2, AlertTriangle, Clock, Sparkles,
  ShieldCheck, ArrowRight, RefreshCw, Menu, Check, Zap,
  Store, Calendar, ShieldAlert, Award, Star, Loader2, HelpCircle, X
} from 'lucide-react';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import api from '@/services/api';
import { toast } from 'sonner';

type Plan = {
  id: string;
  name: string;
  price: number;
  platformType?: string;
  features: string[] | Record<string, any>;
};

type Subscription = {
  id: string;
  planId: string;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  paymentStatus?: string;
  paymentMethod?: string;
  amount?: number;
  plan: Plan;
};

function formatPlanFeatures(features: string[] | Record<string, any>, platformType?: string, planName?: string) {
  const isDual = platformType === 'DUAL' || planName?.toLowerCase().includes('dual');
  const isHotel = !isDual && (platformType === 'HOTEL' || planName?.toLowerCase().includes('hotel'));
  const isRestaurant = !isDual && (platformType === 'RESTAURANT' || planName?.toLowerCase().includes('restaurant'));

  if (Array.isArray(features)) {
    return features.map((item) => {
      if (typeof item === 'string') {
        if (isDual) {
          return item
            .replace(/\(Tables\/Rooms\)/gi, '(Tables & Rooms)')
            .replace(/Room QR Codes/gi, 'QR Codes (Tables & Rooms)')
            .replace(/Table QR Codes/gi, 'QR Codes (Tables & Rooms)');
        }
        if (isHotel) {
          return item
            .replace(/\(Tables\/Rooms\)/gi, '(Rooms)')
            .replace(/\(Tables & Rooms\)/gi, '(Rooms)')
            .replace(/Table & Room/gi, 'Room')
            .replace(/Tables and Rooms/gi, 'Rooms');
        }
        if (isRestaurant) {
          return item
            .replace(/\(Tables\/Rooms\)/gi, '(Tables)')
            .replace(/\(Tables & Rooms\)/gi, '(Tables)')
            .replace(/Table & Room/gi, 'Table')
            .replace(/Tables and Rooms/gi, 'Tables');
        }
      }
      return item;
    });
  }

  if (!features || typeof features !== 'object') return [];

  const labels: string[] = [];
  if (features.qrCodes !== undefined) {
    if (features.qrCodes === -1) {
      if (isDual) labels.push('Unlimited QR Code Tags (Tables & Rooms)');
      else if (isHotel) labels.push('Unlimited Room QR Codes');
      else if (isRestaurant) labels.push('Unlimited Table QR Codes');
      else labels.push('Unlimited QR Code Tags');
    } else {
      if (isDual) labels.push(`${features.qrCodes} QR Codes (Tables & Rooms)`);
      else if (isHotel) labels.push(`${features.qrCodes} Room QR Codes`);
      else if (isRestaurant) labels.push(`${features.qrCodes} Table QR Codes`);
      else labels.push(`${features.qrCodes} QR Codes`);
    }
  }
  if (features.maxOrders !== undefined) {
    labels.push(features.maxOrders === -1 ? 'Unlimited Orders / Month' : `${features.maxOrders} Orders / Month`);
  }
  if (features.maxMenuItems !== undefined) {
    labels.push(features.maxMenuItems === -1 ? 'Unlimited Menu Items' : `${features.maxMenuItems} Menu Items`);
  }
  if (features.callWaiterEnabled) labels.push('Dine-In Waiter Call Bell');
  if (features.roomServiceEnabled) labels.push('Hotel Room Service & Amenities');
  if (features.aiEnabled) labels.push('AI Menu Upselling & Suggestions');
  if (features.analyticsEnabled) labels.push('Real-Time Analytics & Reports');
  if (features.customBranding) labels.push('Custom Logo & Theme Branding');
  if (features.customDomain) labels.push('Custom Domain & White-Label Portal');
  if (features.prioritySupport) labels.push('24/7 Priority Support & SLA');
  if (features.dedicatedManager) labels.push('Dedicated Account Manager');
  if (features.isCustomizable) labels.push('Fully Customizable Plan & Quotas');

  Object.entries(features).forEach(([k, v]) => {
    if ([
      'qrCodes', 'maxOrders', 'maxMenuItems', 'callWaiterEnabled',
      'roomServiceEnabled', 'aiEnabled', 'analyticsEnabled', 'customBranding',
      'customDomain', 'prioritySupport', 'dedicatedManager', 'isCustomizable',
      'trialDays', 'platformType'
    ].includes(k)) {
      return;
    }
    if (v === true) labels.push(k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()));
    else if (typeof v === 'string' || typeof v === 'number') labels.push(`${k}: ${v}`);
  });

  return labels.length > 0 ? labels : Object.keys(features);
}

export function OwnerSubscriptionPage() {
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<Record<string, number>>({});
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'ALL' | 'FREE' | 'PAID' | 'DUAL' | 'RESTAURANT' | 'HOTEL' | 'ENTERPRISE'>('ALL');
  const [showEnterpriseModal, setShowEnterpriseModal] = useState<Plan | null>(null);
  const [enterpriseConfig, setEnterpriseConfig] = useState<{
    platformType: 'RESTAURANT' | 'HOTEL' | 'DUAL';
    tables: number;
    rooms: number;
    maxOrders: number;
    multiBranch: boolean;
    customDomain: boolean;
    dedicatedManager: boolean;
  }>({
    platformType: 'DUAL',
    tables: 30,
    rooms: 30,
    maxOrders: 10000,
    multiBranch: true,
    customDomain: true,
    dedicatedManager: true,
  });

  // Dynamic Enterprise Pricing Calculation
  // - For Restaurant: capacity is calculated ONLY for tables (20 included in base)
  // - For Hotel: capacity is calculated ONLY for rooms (20 included in base)
  // - For Dual: capacity is calculated for BOTH tables + rooms (Double base fee: Restaurant + Hotel)
  const calculateEnterprisePricing = (config: typeof enterpriseConfig) => {
    const isDual = config.platformType === 'DUAL';
    const isHotel = config.platformType === 'HOTEL';
    const isRestaurant = config.platformType === 'RESTAURANT';

    // Base fee: ₹2,499 for single, ₹4,998 for dual (restaurant + hotel)
    const basePrice = isDual ? 4998 : 2499;

    let tablesCost = 0;
    let roomsCost = 0;

    // For Restaurant & Dual: tables capacity calculation
    if (isRestaurant || isDual) {
      const extraTables = Math.max(0, config.tables - 20);
      tablesCost = extraTables * 25; // ₹25 per extra table / month
    }

    // For Hotel & Dual: rooms capacity calculation
    if (isHotel || isDual) {
      const extraRooms = Math.max(0, config.rooms - 20);
      roomsCost = extraRooms * 25; // ₹25 per extra room / month
    }

    // Orders volume
    let ordersCost = 0;
    if (config.maxOrders === 5000) ordersCost = 299;
    else if (config.maxOrders === 10000) ordersCost = 599;
    else if (config.maxOrders === 25000) ordersCost = 1199;
    else if (config.maxOrders === -1) ordersCost = 1999;

    // Optional enterprise add-ons
    let addonsCost = 0;
    if (config.multiBranch) addonsCost += 799;
    if (config.customDomain) addonsCost += 499;
    if (config.dedicatedManager) addonsCost += 699;

    const monthlyTotal = basePrice + tablesCost + roomsCost + ordersCost + addonsCost;

    return {
      basePrice,
      tablesCost,
      roomsCost,
      ordersCost,
      addonsCost,
      monthlyTotal,
    };
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['owner-subscription'],
    queryFn: async () => {
      const res = await api.get('/owner/subscription');
      return res.data.data as {
        plans: Plan[];
        activeSubscription: Subscription | null;
        subscriptions: Subscription[];
        restaurant: {
          id: string;
          name: string;
          isSuspended: boolean;
          isOpen: boolean;
          platformType?: string;
          maxLogins?: number;
        };
        trialStatus?: {
          hasActiveTrial: boolean;
          hasPendingTrial: boolean;
          hasCompletedTrial: boolean;
          trialPlanId: string | null;
          pendingSubscriptionId: string | null;
        };
      };
    },
  });

  const buySubscriptionMutation = useMutation({
    mutationFn: async ({
      planId,
      durationInDays,
      customMonthlyPrice,
      customQuotas,
      platformType,
    }: {
      planId: string;
      durationInDays: number;
      customMonthlyPrice?: number;
      customQuotas?: any;
      platformType?: string;
    }) => {
      const res = await api.post('/owner/subscription/buy', {
        planId,
        durationInDays,
        customMonthlyPrice,
        customQuotas,
        platformType,
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Subscription activated successfully! 🎉', {
        description: 'Your restaurant has been automatically reactivated and is ready for orders.',
        duration: 5000,
      });
      setSubscribingPlanId(null);
      qc.invalidateQueries({ queryKey: ['owner-subscription'] });
      qc.invalidateQueries({ queryKey: ['owner-restaurant-sidebar'] });
      qc.invalidateQueries({ queryKey: ['owner-restaurant-layout'] });
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to complete subscription purchase.');
      setSubscribingPlanId(null);
    },
  });

  const activeSub = data?.activeSubscription;
  const restaurant = data?.restaurant;
  const isSuspended = restaurant?.isSuspended;

  // Calculate days remaining
  const daysRemaining = activeSub
    ? Math.max(0, Math.ceil((new Date(activeSub.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const getPlanPriceForDuration = (basePrice: number, duration: number) => {
    if (basePrice <= 0) return 0;
    if (duration === 30) return basePrice;
    if (duration === 90) return Math.round(basePrice * 3 * 0.95); // 5% discount
    if (duration === 180) return Math.round(basePrice * 6 * 0.90); // 10% discount
    if (duration === 365) return Math.round(basePrice * 12 * 0.85); // 15% discount
    const months = Math.max(1, Math.round(duration / 30));
    return basePrice * months;
  };

  const getDurationLabel = (duration: number) => {
    if (duration === 30) return '1 Mo';
    if (duration === 90) return '3 Mo';
    if (duration === 180) return '6 Mo';
    if (duration === 365) return '1 Yr';
    return `${duration}d`;
  };

  const getDurationFullText = (duration: number) => {
    if (duration === 30) return '1 Month (30 days)';
    if (duration === 90) return '3 Months (90 days)';
    if (duration === 180) return '6 Months (180 days)';
    if (duration === 365) return '1 Year (365 days)';
    return `${duration} days`;
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(false);
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleBuy = async (plan: Plan) => {
    const duration = selectedDuration[plan.id] || 30;
    const isEnterprise = plan.name.toLowerCase().includes('enterprise');
    const enterprisePricing = isEnterprise ? calculateEnterprisePricing(enterpriseConfig) : null;
    const effectiveMonthlyPrice = enterprisePricing ? enterprisePricing.monthlyTotal : plan.price;
    const totalPrice = getPlanPriceForDuration(effectiveMonthlyPrice, duration);
    const durationDesc = getDurationFullText(duration);

    setSubscribingPlanId(plan.id);

    try {
      // 1. Create order on server
      const orderRes = await api.post('/owner/subscription/create-order', {
        planId: plan.id,
        durationInDays: duration,
        customMonthlyPrice: enterprisePricing ? enterprisePricing.monthlyTotal : undefined,
        customQuotas: isEnterprise ? enterpriseConfig : undefined,
        platformType: isEnterprise ? enterpriseConfig.platformType : undefined,
      });

      const orderData = orderRes.data.data;

      // If free plan, activate directly
      if (orderData.isFree) {
        buySubscriptionMutation.mutate({
          planId: plan.id,
          durationInDays: duration,
          customMonthlyPrice: enterprisePricing ? enterprisePricing.monthlyTotal : undefined,
          customQuotas: isEnterprise ? enterpriseConfig : undefined,
          platformType: isEnterprise ? enterpriseConfig.platformType : undefined,
        });
        return;
      }

      // 2. Load Razorpay SDK
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !(window as any).Razorpay) {
        toast.info('Razorpay modal unavailable, proceeding with direct activation.');
        buySubscriptionMutation.mutate({
          planId: plan.id,
          durationInDays: duration,
          customMonthlyPrice: enterprisePricing ? enterprisePricing.monthlyTotal : undefined,
          customQuotas: isEnterprise ? enterpriseConfig : undefined,
          platformType: isEnterprise ? enterpriseConfig.platformType : undefined,
        });
        return;
      }

      // 3. Launch Razorpay Checkout Modal
      const options = {
        key: orderData.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amountInPaise,
        currency: orderData.currency || 'INR',
        name: 'EZ- Restaurant',
        description: `${plan.name} Tier Subscription (${duration} days)`,
        order_id: orderData.orderId,
        prefill: {
          name: orderData.user?.name || orderData.restaurant?.name,
          email: orderData.user?.email || '',
          contact: orderData.user?.phone || '',
        },
        theme: {
          color: '#f97316',
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await api.post('/owner/subscription/verify-payment', {
              planId: plan.id,
              durationInDays: duration,
              customMonthlyPrice: enterprisePricing ? enterprisePricing.monthlyTotal : undefined,
              customQuotas: isEnterprise ? enterpriseConfig : undefined,
              platformType: isEnterprise ? enterpriseConfig.platformType : undefined,
              razorpayOrderId: response.razorpay_order_id || orderData.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            toast.success('Payment Successful! 🎉', {
              description: verifyRes.data.message || `Your restaurant is now active under the ${plan.name} plan.`,
              duration: 5000,
            });

            qc.invalidateQueries({ queryKey: ['owner-subscription'] });
            qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
            qc.invalidateQueries({ queryKey: ['owner-restaurant-sidebar'] });
            qc.invalidateQueries({ queryKey: ['owner-restaurant-layout'] });
            qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
            refetch();
          } catch (verifyErr: any) {
            toast.error(verifyErr.response?.data?.message || 'Payment verification failed. Please contact support.');
          } finally {
            setSubscribingPlanId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setSubscribingPlanId(null);
            toast.info('Payment checkout closed.');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        toast.error(`Payment failed: ${resp.error?.description || 'Transaction declined'}`);
        setSubscribingPlanId(null);
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to initiate Razorpay subscription order');
      setSubscribingPlanId(null);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border bg-background/95 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-muted-foreground hover:bg-muted"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-xl font-bold font-display flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Subscription Plans & Billing
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Choose a plan to power your restaurant, unlock management tools, and keep ordering active.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <ThemeToggle size="sm" />
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl w-full mx-auto">
          {/* Suspended Alert Banner */}
          {isSuspended && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 sm:p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 flex items-start gap-3 shadow-md"
            >
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm">
                <p className="font-extrabold text-sm sm:text-base">Restaurant Suspended due to Inactive / Expired Subscription</p>
                <p className="mt-1 leading-relaxed opacity-90">
                  Your restaurant is currently suspended and customers cannot place orders. Please select and subscribe to any of the plans below to instantly reactivate your restaurant and reopen your digital ordering portal.
                </p>
              </div>
            </motion.div>
          )}

          {/* Active Subscription Status Banner */}
          {activeSub ? (
            <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-bl-full pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Tier</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                        🟢 Active
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black font-display text-foreground mt-0.5">
                      {activeSub.plan.name} Tier
                    </h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {restaurant?.platformType === 'DUAL' ? (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                          🌟 Dual Plan Active (Restaurant + Hotel)
                        </span>
                      ) : restaurant?.platformType === 'HOTEL' ? (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/30">
                          🏨 Hotel Mode Active
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                          🍽️ Restaurant Mode Active
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-medium">
                        • Max {restaurant?.maxLogins ?? 1} concurrent device login(s)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs sm:text-sm">
                  <div className="p-3 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-muted-foreground block text-[11px] font-semibold">Remaining Validity</span>
                    <span className="font-extrabold text-primary text-base">
                      {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-muted-foreground block text-[11px] font-semibold">Renewal Expiration</span>
                    <span className="font-bold text-foreground">
                      {new Date(activeSub.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : !isSuspended && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>You are currently on a <strong>Free Starter Trial</strong>. Upgrade to a paid plan below to unlock full restaurant capabilities!</span>
              </div>
              {restaurant && (
                <span className="text-xs font-bold text-muted-foreground hidden sm:block">
                  Max logins: {restaurant.maxLogins ?? 1} device
                </span>
              )}
            </div>
          )}

          {/* Pending Free Trial Request Alert Banner */}
          {data?.trialStatus?.hasPendingTrial && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-start gap-3 shadow-sm"
            >
              <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 text-xs sm:text-sm">
                <p className="font-extrabold text-sm sm:text-base">⏳ Free Trial Request Pending Admin Approval</p>
                <p className="mt-1 leading-relaxed opacity-90">
                  Your 30-day Free Trial request has been submitted to the platform administrator. Once approved, your restaurant ordering system will be instantly activated for 30 days!
                </p>
              </div>
            </motion.div>
          )}

          {/* Pricing Tiers Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className="font-display font-extrabold text-lg sm:text-xl text-foreground">
                  Available Subscription Plans
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select your preferred package. Dual plans unlock both dine-in tables and hotel room services.
                </p>
              </div>

              {/* Platform category selector tabs */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(() => {
                  const freePlansCount = data?.plans?.filter((p) => p.price === 0).length || 0;
                  const tabs = [
                    { id: 'ALL', label: 'All Plans' },
                    ...(freePlansCount > 0 ? [{ id: 'FREE', label: `🎁 Free Trial${freePlansCount > 1 ? `s (${freePlansCount})` : ''}` }] : []),
                    { id: 'PAID', label: '💼 Paid Plans (3)' },
                    { id: 'DUAL', label: '🌟 Dual Plan' },
                    { id: 'ENTERPRISE', label: '🏢 Enterprise' },
                  ];
                  return tabs.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedPlatformFilter(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        selectedPlatformFilter === cat.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ));
                })()}
              </div>
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-96 rounded-3xl bg-card border border-border animate-pulse p-6" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6 items-stretch">
                {data?.plans
                  ?.filter((plan) => {
                    const isFree = plan.price === 0;
                    const isEnt = plan.name.toLowerCase().includes('enterprise');
                    if (selectedPlatformFilter === 'FREE') return isFree;
                    if (selectedPlatformFilter === 'PAID') return !isFree && !isEnt;
                    if (selectedPlatformFilter === 'DUAL') return plan.platformType === 'DUAL';
                    if (selectedPlatformFilter === 'ENTERPRISE') return isEnt;
                    if (selectedPlatformFilter === 'RESTAURANT') return plan.platformType === 'RESTAURANT';
                    if (selectedPlatformFilter === 'HOTEL') return plan.platformType === 'HOTEL';
                    return true;
                  })
                  ?.map((plan) => {
                  const isCurrentPlan = activeSub?.planId === plan.id && activeSub.isActive;
                  const isFree = plan.price === 0;
                  const isEnterprise = plan.name.toLowerCase().includes('enterprise');
                  const isDual = plan.platformType === 'DUAL';
                  const isHighlighted = isEnterprise || (isDual && !isFree) || plan.name.toLowerCase().includes('pro');

                  // Normalize features list using formatPlanFeatures
                  const features = formatPlanFeatures(plan.features, plan.platformType, plan.name);
                  const duration = selectedDuration[plan.id] || 30;

                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all relative overflow-hidden border shadow-sm ${
                        isEnterprise
                          ? 'bg-card border-indigo-500/50 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
                          : isHighlighted
                          ? 'bg-card border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/5'
                          : 'bg-card border-border hover:border-primary/40'
                      }`}
                    >
                      {isEnterprise ? (
                        <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Customizable
                        </div>
                      ) : isFree && data?.trialStatus?.hasPendingTrial && data?.trialStatus?.trialPlanId === plan.id ? (
                        <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Approval Pending
                        </div>
                      ) : isFree && isCurrentPlan ? (
                        <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Active Free Trial
                        </div>
                      ) : isDual && !isFree ? (
                        <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                          2x Dual Value
                        </div>
                      ) : isHighlighted ? (
                        <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                          Recommended
                        </div>
                      ) : null}

                      <div>
                        <div className="mb-4">
                          {isEnterprise ? (
                            enterpriseConfig.platformType === 'DUAL' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 mb-2">
                                🌟 Dual Custom Tier (Tables + Rooms)
                              </span>
                            ) : enterpriseConfig.platformType === 'HOTEL' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 mb-2">
                                🏨 Hotel Custom Tier (Rooms Only)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 mb-2">
                                🍽️ Restaurant Custom Tier (Tables Only)
                              </span>
                            )
                          ) : plan.platformType === 'DUAL' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 mb-2">
                              🌟 Dual Plan (Restaurant + Hotel)
                            </span>
                          ) : plan.platformType === 'HOTEL' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 mb-2">
                              🏨 Hotel Only
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 mb-2">
                              🍽️ Restaurant
                            </span>
                          )}
                          <h3 className="font-display font-extrabold text-xl text-foreground">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isEnterprise
                              ? `Custom configured for ${
                                  enterpriseConfig.platformType === 'DUAL'
                                    ? `Dual (${enterpriseConfig.tables} tables & ${enterpriseConfig.rooms} rooms)`
                                    : enterpriseConfig.platformType === 'HOTEL'
                                    ? `Hotel (${enterpriseConfig.rooms} rooms)`
                                    : `Restaurant (${enterpriseConfig.tables} tables)`
                                } with dynamic scale pricing.`
                              : isDual && !isFree
                              ? 'Combined 2x suite: Includes both dine-in tables + hotel room service ordering.'
                              : plan.platformType === 'DUAL'
                              ? 'All-in-one suite: dine-in tables, table waiter calling + hotel room service.'
                              : plan.platformType === 'HOTEL'
                              ? 'Complete hotel suite: room QR ordering & room service calling.'
                              : plan.price === 0
                              ? 'Essential features to get started'
                              : 'Designed to accelerate growing restaurants & cafes'}
                          </p>
                        </div>

                        {/* Price */}
                        {(() => {
                          const enterprisePricing = isEnterprise ? calculateEnterprisePricing(enterpriseConfig) : null;
                          const effectiveMonthlyPrice = enterprisePricing ? enterprisePricing.monthlyTotal : plan.price;
                          const totalPrice = getPlanPriceForDuration(effectiveMonthlyPrice, duration);
                          const monthsCount = duration === 365 ? 12 : Math.max(1, Math.round(duration / 30));
                          return (
                            <div className="my-5 pb-5 border-b border-border">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-3xl sm:text-4xl font-black font-display text-foreground transition-all">
                                  ₹{totalPrice.toLocaleString('en-IN')}
                                </span>
                                <span className="text-xs text-muted-foreground font-semibold">
                                  / {getDurationLabel(duration)} ({duration} days)
                                </span>
                              </div>
                              {isEnterprise && (
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                    Base ₹{enterprisePricing?.basePrice.toLocaleString('en-IN')} + customized quotas
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                                    ₹{effectiveMonthlyPrice.toLocaleString('en-IN')}/mo
                                  </span>
                                </div>
                              )}
                              {isDual && !isFree && !isEnterprise && (
                                <div className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                  Double single rate: Restaurant (₹1,499) + Hotel (₹1,499)
                                </div>
                              )}
                              {monthsCount > 1 && effectiveMonthlyPrice > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                                  <span>Monthly: <strong className="text-foreground font-bold">₹{effectiveMonthlyPrice.toLocaleString('en-IN')}/mo</strong></span>
                                  <span>•</span>
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                    {duration === 90 ? '5% OFF' : duration === 180 ? '10% OFF' : duration === 365 ? '15% OFF' : `${monthsCount} mo`}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Duration Selector */}
                        <div className="mb-5">
                          <label className="text-[11px] font-bold text-muted-foreground block mb-2 uppercase tracking-wider">
                            {isFree ? 'Trial Period' : 'Choose Duration'}
                          </label>
                          {isFree ? (
                            <div className="py-2.5 px-3 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400">
                              <span>1 Month (30 Days)</span>
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 font-extrabold">
                                Admin Activated
                              </span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-1.5">
                              {[30, 90, 180, 365].map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setSelectedDuration({ ...selectedDuration, [plan.id]: d })}
                                  className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all border ${
                                    duration === d
                                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                      : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
                                  }`}
                                >
                                  {getDurationLabel(d)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Feature List */}
                        <div className="space-y-3 mb-6">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What's Included:</p>
                          {(() => {
                            if (isEnterprise) {
                              const entList: string[] = [];
                              if (enterpriseConfig.platformType === 'RESTAURANT') {
                                entList.push(`${enterpriseConfig.tables} Dine-In Tables with Smart QR Tags`);
                                entList.push('Dine-In Waiter Call Bell Service');
                              } else if (enterpriseConfig.platformType === 'HOTEL') {
                                entList.push(`${enterpriseConfig.rooms} Hotel Guest Rooms with Room Service QR`);
                                entList.push('Hotel Room Service & Amenities Hub');
                              } else {
                                entList.push(`${enterpriseConfig.tables} Dine-In Tables + ${enterpriseConfig.rooms} Hotel Rooms`);
                                entList.push('Dine-In Waiter Calling + Hotel Room Service');
                              }
                              entList.push(enterpriseConfig.maxOrders === -1 ? 'Unlimited Monthly Orders' : `${enterpriseConfig.maxOrders.toLocaleString()} Orders / Month`);
                              entList.push('Unlimited Menu Items & Categories');
                              entList.push('AI Upselling & Smart Suggestions');
                              entList.push('Real-Time Analytics & Reporting');
                              if (enterpriseConfig.multiBranch) entList.push('Multi-Branch & Franchise Portal');
                              if (enterpriseConfig.customDomain) entList.push('White-Label Custom Domain');
                              if (enterpriseConfig.dedicatedManager) entList.push('Dedicated 24/7 Account Manager & SLA');
                              return entList.map((feature, idx) => (
                                <div key={idx} className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  <span className="text-foreground">{feature}</span>
                                </div>
                              ));
                            }

                            return features.map((feature, idx) => (
                              <div key={idx} className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <span className="text-foreground">{String(feature)}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>

                      {/* CTA Action Button */}
                      <div className="pt-4 border-t border-border space-y-2">
                        {isEnterprise && (
                          <button
                            type="button"
                            onClick={() => setShowEnterpriseModal(plan)}
                            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Customize Plan Quotas & Platform</span>
                          </button>
                        )}

                        {(() => {
                          const enterprisePricing = isEnterprise ? calculateEnterprisePricing(enterpriseConfig) : null;
                          const effectiveMonthlyPrice = enterprisePricing ? enterprisePricing.monthlyTotal : plan.price;
                          const totalPrice = getPlanPriceForDuration(effectiveMonthlyPrice, duration);
                          const isPendingThisTrial = isFree && data?.trialStatus?.hasPendingTrial && data?.trialStatus?.trialPlanId === plan.id;
                          const isActiveThisTrial = isFree && isCurrentPlan;

                          if (isFree) {
                            if (isPendingThisTrial) {
                              return (
                                <button
                                  disabled
                                  className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-not-allowed opacity-90 shadow-sm"
                                >
                                  <Clock className="w-4 h-4 text-amber-500" />
                                  <span>⏳ Trial Requested · Awaiting Admin Approval</span>
                                </button>
                              );
                            }

                            if (isActiveThisTrial) {
                              return (
                                <button
                                  disabled
                                  className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 cursor-not-allowed shadow-sm"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  <span>🟢 Free Trial Active · 30 Days (Non-Renewable)</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                onClick={() => handleBuy(plan)}
                                disabled={buySubscriptionMutation.isPending || !!data?.trialStatus?.hasPendingTrial || !!data?.trialStatus?.hasActiveTrial}
                                className="w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white shadow-md shadow-purple-600/20 cursor-pointer transition-all"
                              >
                                {subscribingPlanId === plan.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Submitting Request...</span>
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-4 h-4" />
                                    <span>Request Free Trial (Admin Approval)</span>
                                  </>
                                )}
                              </button>
                            );
                          }

                          return (
                            <button
                              onClick={() => handleBuy(plan)}
                              disabled={buySubscriptionMutation.isPending}
                              className={`w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                                isCurrentPlan
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : isEnterprise
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25'
                                  : isHighlighted
                                  ? 'bg-primary hover:bg-primary/95 text-primary-foreground shadow-primary/20'
                                  : 'bg-foreground text-background hover:opacity-90'
                              }`}
                            >
                              {subscribingPlanId === plan.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Activating Plan...</span>
                                </>
                              ) : isCurrentPlan ? (
                                <>
                                  <RefreshCw className="w-4 h-4" />
                                  <span>Renew / Extend ({getDurationLabel(duration)} · ₹{totalPrice.toLocaleString('en-IN')})</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-4 h-4" />
                                  <span>Subscribe ({getDurationLabel(duration)} · ₹{totalPrice.toLocaleString('en-IN')})</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Subscription History Table */}
          {data?.subscriptions && data.subscriptions.length > 0 && (
            <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
              <h3 className="font-display font-bold text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Subscription & Renewal History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="pb-3 font-semibold">Tier Plan</th>
                      <th className="pb-3 font-semibold">Amount</th>
                      <th className="pb-3 font-semibold">Start Date</th>
                      <th className="pb-3 font-semibold">Expiration Date</th>
                      <th className="pb-3 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.subscriptions.map((sub) => {
                      const days = Math.max(1, Math.round((new Date(sub.expiresAt).getTime() - new Date(sub.startsAt).getTime()) / (1000 * 60 * 60 * 24)));
                      const months = days >= 360 ? 12 : Math.max(1, Math.round(days / 30));
                      const totalPaid = sub.plan.price * months;
                      return (
                        <tr key={sub.id} className="hover:bg-muted/20">
                          <td className="py-3 font-bold text-foreground">
                            {sub.plan.name}
                            <span className="text-[10px] text-muted-foreground font-normal ml-1.5">({days}d)</span>
                          </td>
                          <td className="py-3 font-semibold text-foreground">
                            ₹{totalPaid.toLocaleString('en-IN')}
                            {months > 1 && <span className="text-[10px] text-muted-foreground ml-1">(@ ₹{sub.plan.price}/mo)</span>}
                          </td>
                          <td className="py-3 text-muted-foreground">{new Date(sub.startsAt).toLocaleDateString()}</td>
                          <td className="py-3 text-muted-foreground">{new Date(sub.expiresAt).toLocaleDateString()}</td>
                          <td className="py-3 text-right">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              sub.isActive ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-muted text-muted-foreground'
                            }`}>
                              {sub.isActive ? 'Active' : 'Expired'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Enterprise Customizer Modal */}
      <AnimatePresence>
        {showEnterpriseModal && (() => {
          const enterprisePricing = calculateEnterprisePricing(enterpriseConfig);
          const activeDuration = selectedDuration[showEnterpriseModal.id] || 30;
          const durationPrice = getPlanPriceForDuration(enterprisePricing.monthlyTotal, activeDuration);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-card border border-border rounded-3xl p-5 sm:p-7 max-w-xl w-full shadow-2xl space-y-5 my-6 max-h-[90vh] overflow-y-auto"
              >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Enterprise Level Customizer
                      </span>
                    </div>
                    <h3 className="font-display font-extrabold text-xl text-foreground">
                      Customize Your Plan & Capacity
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pricing automatically recalculates based on your platform type and selected capacity.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEnterpriseModal(null)}
                    className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* 1. Platform Type Selector */}
                <div>
                  <label className="text-xs font-bold text-foreground block mb-2">
                    1. Select Venue Type / Platform
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        type: 'RESTAURANT',
                        label: 'Restaurant',
                        icon: '🍽️',
                        desc: 'Tables capacity only',
                        base: '₹2,499/mo',
                      },
                      {
                        type: 'HOTEL',
                        label: 'Hotel',
                        icon: '🏨',
                        desc: 'Rooms capacity only',
                        base: '₹2,499/mo',
                      },
                      {
                        type: 'DUAL',
                        label: 'Dual Suite',
                        icon: '🌟',
                        desc: 'Both Tables + Rooms',
                        base: '₹4,998/mo (2x)',
                      },
                    ].map((item) => {
                      const isSelected = enterpriseConfig.platformType === item.type;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setEnterpriseConfig({ ...enterpriseConfig, platformType: item.type as any })}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/20 text-foreground shadow-sm'
                              : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/60'
                          }`}
                        >
                          <div className="text-lg mb-1">{item.icon}</div>
                          <div className="text-xs font-black text-foreground">{item.label}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.desc}</div>
                          <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                            Base {item.base}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Capacity Sliders (Tables for Restaurant, Rooms for Hotel, Both for Dual) */}
                <div className="space-y-4 p-4 rounded-2xl bg-muted/20 border border-border">
                  <div className="text-xs font-bold text-foreground flex items-center justify-between">
                    <span>2. Configure Venue Capacities</span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {enterpriseConfig.platformType === 'RESTAURANT'
                        ? 'Tables only'
                        : enterpriseConfig.platformType === 'HOTEL'
                        ? 'Rooms only'
                        : 'Both Tables & Rooms'}
                    </span>
                  </div>

                  {/* Restaurant & Dual: Tables Slider */}
                  {(enterpriseConfig.platformType === 'RESTAURANT' || enterpriseConfig.platformType === 'DUAL') && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-foreground flex items-center gap-1.5">
                          <span>🍽️</span> Dine-In Tables Capacity
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black">
                          {enterpriseConfig.tables} Tables
                          {enterpriseConfig.tables > 20 && (
                            <span className="font-normal text-[10px] ml-1">
                              (+₹{(Math.max(0, enterpriseConfig.tables - 20) * 25).toLocaleString('en-IN')})
                            </span>
                          )}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="250"
                        step="5"
                        value={enterpriseConfig.tables}
                        onChange={(e) => setEnterpriseConfig({ ...enterpriseConfig, tables: parseInt(e.target.value, 10) })}
                        className="w-full accent-primary cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min: 10 tables</span>
                        <span>20 tables included in base (₹25/extra table)</span>
                        <span>Max: 250+</span>
                      </div>
                    </div>
                  )}

                  {/* Hotel & Dual: Rooms Slider */}
                  {(enterpriseConfig.platformType === 'HOTEL' || enterpriseConfig.platformType === 'DUAL') && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-foreground flex items-center gap-1.5">
                          <span>🏨</span> Hotel Guest Rooms Capacity
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-black">
                          {enterpriseConfig.rooms} Rooms
                          {enterpriseConfig.rooms > 20 && (
                            <span className="font-normal text-[10px] ml-1">
                              (+₹{(Math.max(0, enterpriseConfig.rooms - 20) * 25).toLocaleString('en-IN')})
                            </span>
                          )}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="250"
                        step="5"
                        value={enterpriseConfig.rooms}
                        onChange={(e) => setEnterpriseConfig({ ...enterpriseConfig, rooms: parseInt(e.target.value, 10) })}
                        className="w-full accent-primary cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min: 10 rooms</span>
                        <span>20 rooms included in base (₹25/extra room)</span>
                        <span>Max: 250+</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Monthly Orders Volume */}
                <div>
                  <label className="text-xs font-bold text-foreground block mb-2">
                    3. Monthly Orders Volume
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                    {[
                      { val: 2500, label: '2,500 Orders', cost: 'Included' },
                      { val: 5000, label: '5,000 Orders', cost: '+₹299/mo' },
                      { val: 10000, label: '10,000 Orders', cost: '+₹599/mo' },
                      { val: 25000, label: '25,000 Orders', cost: '+₹1,199/mo' },
                      { val: -1, label: 'Unlimited Orders', cost: '+₹1,999/mo' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setEnterpriseConfig({ ...enterpriseConfig, maxOrders: item.val })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          enterpriseConfig.maxOrders === item.val
                            ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <div className="text-[11px] font-bold">{item.label}</div>
                        <div className="text-[10px] opacity-80">{item.cost}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Enterprise Add-ons */}
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2 text-xs">
                  <div className="font-bold text-foreground mb-1 text-xs">4. Enterprise Modules & Add-Ons</div>
                  <label className="flex items-center justify-between cursor-pointer font-medium text-foreground py-1">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enterpriseConfig.multiBranch}
                        onChange={(e) => setEnterpriseConfig({ ...enterpriseConfig, multiBranch: e.target.checked })}
                        className="rounded accent-primary"
                      />
                      <span>Multi-Branch & Franchise Central Hub</span>
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">+₹799/mo</span>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer font-medium text-foreground py-1">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enterpriseConfig.customDomain}
                        onChange={(e) => setEnterpriseConfig({ ...enterpriseConfig, customDomain: e.target.checked })}
                        className="rounded accent-primary"
                      />
                      <span>Custom White-Label Domain (e.g. order.yourbrand.com)</span>
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">+₹499/mo</span>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer font-medium text-foreground py-1">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enterpriseConfig.dedicatedManager}
                        onChange={(e) => setEnterpriseConfig({ ...enterpriseConfig, dedicatedManager: e.target.checked })}
                        className="rounded accent-primary"
                      />
                      <span>Dedicated Account Manager & Priority Phone SLA</span>
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">+₹699/mo</span>
                  </label>
                </div>

                {/* 5. Live Price Calculation Breakdown Card */}
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                    <span className="font-bold text-indigo-900 dark:text-indigo-200">
                      Live Calculated Price Breakdown:
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
                      Dynamic Calculation
                    </span>
                  </div>

                  <div className="space-y-1 text-muted-foreground text-[11px]">
                    <div className="flex justify-between">
                      <span>Base {enterpriseConfig.platformType === 'DUAL' ? 'Dual (Restaurant + Hotel)' : enterpriseConfig.platformType} Platform:</span>
                      <span className="font-bold text-foreground">₹{enterprisePricing.basePrice.toLocaleString('en-IN')}/mo</span>
                    </div>

                    {(enterpriseConfig.platformType === 'RESTAURANT' || enterpriseConfig.platformType === 'DUAL') && enterprisePricing.tablesCost > 0 && (
                      <div className="flex justify-between">
                        <span>Extra Tables Capacity ({enterpriseConfig.tables - 20} tables @ ₹25):</span>
                        <span className="font-bold text-foreground">+₹{enterprisePricing.tablesCost.toLocaleString('en-IN')}/mo</span>
                      </div>
                    )}

                    {(enterpriseConfig.platformType === 'HOTEL' || enterpriseConfig.platformType === 'DUAL') && enterprisePricing.roomsCost > 0 && (
                      <div className="flex justify-between">
                        <span>Extra Rooms Capacity ({enterpriseConfig.rooms - 20} rooms @ ₹25):</span>
                        <span className="font-bold text-foreground">+₹{enterprisePricing.roomsCost.toLocaleString('en-IN')}/mo</span>
                      </div>
                    )}

                    {enterprisePricing.ordersCost > 0 && (
                      <div className="flex justify-between">
                        <span>High-Throughput Order Volume Tier:</span>
                        <span className="font-bold text-foreground">+₹{enterprisePricing.ordersCost.toLocaleString('en-IN')}/mo</span>
                      </div>
                    )}

                    {enterprisePricing.addonsCost > 0 && (
                      <div className="flex justify-between">
                        <span>Selected Enterprise Modules:</span>
                        <span className="font-bold text-foreground">+₹{enterprisePricing.addonsCost.toLocaleString('en-IN')}/mo</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-indigo-500/20 flex items-baseline justify-between">
                    <div>
                      <div className="text-sm font-black text-indigo-900 dark:text-indigo-100">
                        Monthly Rate: ₹{enterprisePricing.monthlyTotal.toLocaleString('en-IN')}/month
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Selected Duration: {getDurationLabel(activeDuration)} (Total: ₹{durationPrice.toLocaleString('en-IN')})
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black font-display text-indigo-600 dark:text-indigo-400">
                        ₹{enterprisePricing.monthlyTotal.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-semibold">/mo</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEnterpriseModal(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-border font-bold text-xs hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const planToBuy = showEnterpriseModal;
                      setShowEnterpriseModal(null);
                      toast.success(
                        `Enterprise configuration applied: ₹${enterprisePricing.monthlyTotal.toLocaleString('en-IN')}/mo for ${
                          enterpriseConfig.platformType === 'DUAL'
                            ? 'Dual (Tables + Rooms)'
                            : enterpriseConfig.platformType === 'HOTEL'
                            ? 'Hotel (Rooms Only)'
                            : 'Restaurant (Tables Only)'
                        }`
                      );
                      if (planToBuy) {
                        handleBuy(planToBuy);
                      }
                    }}
                    disabled={buySubscriptionMutation.isPending}
                    className="flex-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Apply & Subscribe (₹{durationPrice.toLocaleString('en-IN')})</span>
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
