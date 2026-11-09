'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Store, Users, BarChart3, LayoutDashboard, LogOut, Menu,
  Shield, CreditCard, Ticket, HandCoins, Plus, CheckCircle2, RefreshCw, Trash2, Star,
  Search, Filter, Lock, Unlock, Zap, Calendar, IndianRupee, AlertTriangle, Check, X,
  Building2, Phone, Mail, ArrowUpRight, Copy, Loader2, Gift, Clock, Sparkles
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  duration?: number;
  platformType?: string;
  features: string[] | Record<string, any>;
  isActive?: boolean;
};

type FreeTrialSettings = {
  enabled: boolean;
  trialDays: number;
  planName: string;
  features: Record<string, any>;
};

type RestaurantSubscriptionItem = {
  id: string;
  restaurantId: string;
  planId: string;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  amount: number;
  paymentStatus: string;
  paymentMethod: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: string;
  plan: SubscriptionPlan;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    phone?: string;
    isSuspended: boolean;
    deletedAt?: string | null;
    owner?: {
      id: string;
      name: string;
      email: string;
      phone?: string;
      deletedAt?: string | null;
    };
  };
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

export function AdminSubscriptionsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'plans' | 'subscriptions'>('subscriptions');

  // Queries
  const { data: adminSubData, isLoading, refetch } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const res = await api.get('/admin/subscriptions');
      return res.data.data as {
        plans: SubscriptionPlan[];
        subscriptions?: RestaurantSubscriptionItem[];
        freeTrialSettings?: FreeTrialSettings;
      };
    },
  });

  const { data: restaurantsData } = useQuery({
    queryKey: ['admin-all-restaurants'],
    queryFn: async () => {
      const res = await api.get('/admin/restaurants');
      return (res.data.data?.restaurants || []) as Array<{ id: string; name: string; slug: string; isSuspended: boolean }>;
    },
  });

  // State for Create Plan
  const [newPlan, setNewPlan] = useState({ name: '', price: '', duration: '30', platformType: 'RESTAURANT', features: '' });
  const [planCategoryFilter, setPlanCategoryFilter] = useState<'ALL' | 'FREE' | 'PAID' | 'ENTERPRISE'>('ALL');

  // State for Assign Plan Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    restaurantId: '',
    planId: '',
    durationInDays: '30',
    paymentStatus: 'UNPAID',
  });

  // State for Extend Free Days Modal
  const [showExtendFreeModal, setShowExtendFreeModal] = useState<RestaurantSubscriptionItem | null>(null);
  const [extendDaysInput, setExtendDaysInput] = useState('14');

  // State for Free Trial Global Settings Modal
  const [showFreeTrialSettingsModal, setShowFreeTrialSettingsModal] = useState(false);
  const [freeTrialDaysInput, setFreeTrialDaysInput] = useState('14');

  // Search & Filters for Subscriptions list
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'FREE_TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED'>('ALL');

  // Create Plan Mutation
  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const featuresList = newPlan.features.split('\n').map((f) => f.trim()).filter(Boolean);
      await api.post('/admin/subscriptions', {
        name: newPlan.name,
        price: parseFloat(newPlan.price),
        duration: parseInt(newPlan.duration, 10),
        platformType: newPlan.platformType || 'RESTAURANT',
        features: featuresList,
      });
    },
    onSuccess: () => {
      toast.success('Subscription plan created successfully!');
      setNewPlan({ name: '', price: '', duration: '30', platformType: 'RESTAURANT', features: '' });
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create plan');
    },
  });

  // Delete Plan Mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/subscriptions/${id}`);
    },
    onSuccess: () => {
      toast.success('Subscription plan deleted!');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete plan');
    },
  });

  // Toggle Subscription Mutation (Disable / Enable Plan)
  const toggleSubMutation = useMutation({
    mutationFn: async (subId: string) => {
      const res = await api.patch(`/admin/subscriptions/${subId}/toggle`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Subscription status updated!');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-all-restaurants'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to toggle subscription status');
    },
  });

  // Toggle Payment Status Mutation (Mark Paid / Unpaid)
  const togglePaymentStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus?: string }) => {
      const res = await api.patch(`/admin/subscriptions/records/${id}/status`, { paymentStatus: newStatus });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Payment status updated!');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update payment status');
    },
  });

  // Extend / Update Free Days Mutation
  const extendFreeMutation = useMutation({
    mutationFn: async ({ id, additionalDays }: { id: string; additionalDays: number }) => {
      const res = await api.patch(`/admin/subscriptions/records/${id}/extend-free`, { additionalDays });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Free trial days updated successfully!');
      setShowExtendFreeModal(null);
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-all-restaurants'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update free days');
    },
  });

  // Update Free Trial Global Settings Mutation
  const updateFreeTrialSettingsMutation = useMutation({
    mutationFn: async (trialDays: number) => {
      const res = await api.put('/admin/subscriptions/free-trial-settings', { trialDays, enabled: true });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Free trial settings updated!');
      setShowFreeTrialSettingsModal(false);
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update free trial settings');
    },
  });

  // Delete Subscription Record Mutation
  const deleteSubRecordMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/subscriptions/records/${id}`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Subscription record deleted!');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete subscription record');
    },
  });

  // Assign Plan Mutation
  const assignPlanMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/subscriptions/assign', {
        restaurantId: assignForm.restaurantId,
        planId: assignForm.planId,
        durationInDays: parseInt(assignForm.durationInDays, 10),
        paymentStatus: assignForm.paymentStatus,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Plan assigned successfully!');
      setShowAssignModal(false);
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-all-restaurants'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to assign plan');
    },
  });

  // Approve Free Trial Mutation
  const approveTrialMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await api.patch(`/admin/subscriptions/requests/${subscriptionId}/approve`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Free trial approved and activated for 30 days! 🎉');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-all-restaurants'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to approve free trial');
    },
  });

  // Reject Free Trial Mutation
  const rejectTrialMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await api.patch(`/admin/subscriptions/requests/${subscriptionId}/reject`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Free trial request rejected.');
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-all-restaurants'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to reject trial request');
    },
  });

  // Pending Trial Requests Approval Queue
  const pendingTrialRequests = useMemo(() => {
    return (adminSubData?.subscriptions || []).filter(
      (s) => s.paymentStatus === 'TRIAL_PENDING' && !s.isActive && s.restaurant && !s.restaurant.deletedAt
    );
  }, [adminSubData?.subscriptions]);

  // Filter Subscriptions List - strict filter against dummy data, supports Free Trial!
  const filteredSubscriptions = useMemo(() => {
    const list = adminSubData?.subscriptions || [];
    const now = Date.now();

    return list.filter((sub) => {
      // Strictly exclude soft-deleted restaurants and deleted owner accounts
      if (!sub.restaurant || sub.restaurant.deletedAt) return false;
      if (sub.restaurant.owner?.deletedAt || sub.restaurant.owner?.email?.startsWith('deleted_')) return false;

      const isFreeTrial = sub.paymentStatus === 'FREE_TRIAL' || sub.paymentStatus === 'TRIAL_PENDING' || sub.paymentMethod === 'FREE_TRIAL' || sub.plan?.price === 0;

      // Exclude zero amount only if it is NOT a free trial
      if (typeof sub.amount === 'number' && sub.amount <= 0 && !isFreeTrial) return false;

      const isExpired = new Date(sub.expiresAt).getTime() < now;
      const isSuspended = sub.restaurant.isSuspended;
      const isPaid = sub.paymentStatus === 'PAID';

      if (statusFilter === 'FREE_TRIAL' && !isFreeTrial) return false;
      if (statusFilter === 'PAID' && (!isPaid || isFreeTrial)) return false;
      if (statusFilter === 'UNPAID' && (isPaid || isFreeTrial)) return false;
      if (statusFilter === 'ACTIVE' && (!sub.isActive || isExpired)) return false;
      if (statusFilter === 'EXPIRED' && !isExpired) return false;
      if (statusFilter === 'SUSPENDED' && !isSuspended) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRest = sub.restaurant.name.toLowerCase().includes(q) || sub.restaurant.slug.toLowerCase().includes(q);
        const matchesOwner = sub.restaurant.owner?.name?.toLowerCase().includes(q) || sub.restaurant.owner?.email?.toLowerCase().includes(q);
        const matchesPlan = sub.plan.name.toLowerCase().includes(q);
        const matchesPaymentId = sub.razorpayPaymentId?.toLowerCase().includes(q);
        const matchesStatus = sub.paymentStatus?.toLowerCase().includes(q);
        return matchesRest || matchesOwner || matchesPlan || matchesPaymentId || matchesStatus;
      }
      return true;
    });
  }, [adminSubData?.subscriptions, searchQuery, statusFilter]);

  // Overall statistics - ONLY sum confirmed paid revenue!
  const totalPaidRevenue = useMemo(() => {
    return (adminSubData?.subscriptions || [])
      .filter((s) => {
        if (!s.restaurant || s.restaurant.deletedAt || s.restaurant.owner?.deletedAt || s.restaurant.owner?.email?.startsWith('deleted_')) return false;
        return s.paymentStatus === 'PAID' && (s.amount || 0) > 0;
      })
      .reduce((acc, s) => acc + (s.amount || 0), 0);
  }, [adminSubData?.subscriptions]);

  const paidCount = useMemo(() => {
    return (adminSubData?.subscriptions || []).filter((s) => {
      if (!s.restaurant || s.restaurant.deletedAt || s.restaurant.owner?.deletedAt || s.restaurant.owner?.email?.startsWith('deleted_')) return false;
      return s.paymentStatus === 'PAID' && (s.amount || 0) > 0;
    }).length;
  }, [adminSubData?.subscriptions]);

  const freeTrialCount = useMemo(() => {
    return (adminSubData?.subscriptions || []).filter((s) => {
      if (!s.restaurant || s.restaurant.deletedAt || s.restaurant.owner?.deletedAt || s.restaurant.owner?.email?.startsWith('deleted_')) return false;
      const isFree = s.paymentStatus === 'FREE_TRIAL' || s.paymentMethod === 'FREE_TRIAL' || s.plan?.price === 0;
      return isFree && s.isActive;
    }).length;
  }, [adminSubData?.subscriptions]);

  const unpaidStats = useMemo(() => {
    const unpaidList = (adminSubData?.subscriptions || []).filter((s) => {
      if (!s.restaurant || s.restaurant.deletedAt || s.restaurant.owner?.deletedAt || s.restaurant.owner?.email?.startsWith('deleted_')) return false;
      const isFree = s.paymentStatus === 'FREE_TRIAL' || s.paymentMethod === 'FREE_TRIAL' || s.plan?.price === 0;
      return !isFree && s.paymentStatus !== 'PAID' && (s.amount || 0) > 0;
    });
    const count = unpaidList.length;
    const amount = unpaidList.reduce((acc, s) => acc + (s.amount || 0), 0);
    return { count, amount };
  }, [adminSubData?.subscriptions]);

  const activeCount = useMemo(() => {
    const now = Date.now();
    return (adminSubData?.subscriptions || []).filter((s) => {
      if (!s.restaurant || s.restaurant.deletedAt || s.restaurant.owner?.deletedAt || s.restaurant.owner?.email?.startsWith('deleted_')) return false;
      return s.isActive && new Date(s.expiresAt).getTime() > now;
    }).length;
  }, [adminSubData?.subscriptions]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background/95 backdrop-blur-sm gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-display font-bold text-xl flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Subscription Plans & Payments Management
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                View Razorpay billing transactions, assign plans, and control restaurant access.
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

        {/* Tab Navigation */}
        <div className="px-6 border-b border-border bg-card flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'subscriptions'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Restaurant Subscriptions & Payments</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-extrabold">
                {adminSubData?.subscriptions?.length ?? 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('plans')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'plans'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Plan Tiers ({adminSubData?.plans?.length ?? 0})</span>
            </button>
          </div>

          {activeTab === 'subscriptions' && (
            <button
              onClick={() => {
                if (adminSubData?.plans?.[0]?.id) {
                  setAssignForm((prev) => ({ ...prev, planId: adminSubData.plans[0].id }));
                }
                if (restaurantsData?.[0]?.id) {
                  setAssignForm((prev) => ({ ...prev, restaurantId: restaurantsData[0].id }));
                }
                setShowAssignModal(true);
              }}
              className="py-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/95 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Grant / Assign Plan</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {activeTab === 'subscriptions' ? (
            <div className="space-y-5">
              {/* Free Trial Automation Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg shadow-inner shrink-0">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-foreground flex items-center gap-2">
                      <span>Automatic Free Trial on Restaurant Onboarding</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                        {adminSubData?.freeTrialSettings?.trialDays ?? 14} Days Default
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      New restaurants automatically receive a free trial plan upon onboarding. You can update individual restaurant free days anytime using the "Update Free Days" button below.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFreeTrialDaysInput(String(adminSubData?.freeTrialSettings?.trialDays ?? 14));
                    setShowFreeTrialSettingsModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Configure Default Free Days</span>
                </button>
              </div>

              {/* Stat Highlights */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                <div className="p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Confirmed Paid Revenue
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-display text-emerald-500 mt-1 flex items-center">
                    ₹{totalPaidRevenue.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Excludes free trial & unpaid
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Free Trial Restaurants
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-display text-purple-600 dark:text-purple-400 mt-1 flex items-center gap-1.5">
                    <Gift className="w-5 h-5 text-purple-500" /> {freeTrialCount} on trial
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Auto-granted on onboarding
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Paid Subscriptions
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-display text-foreground mt-1 flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> {paidCount} verified
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Confirmed transactions
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Unpaid / Pending Plans
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-display text-amber-500 mt-1 flex items-center gap-1.5">
                    <span className="text-amber-500">⏳</span> {unpaidStats.count} pending
                  </div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-semibold block">
                    ₹{unpaidStats.amount.toLocaleString('en-IN')} to collect
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Active Valid Plans
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-display text-primary mt-1 flex items-center gap-1.5">
                    <span className="text-green-500">●</span> {activeCount} active
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    {restaurantsData?.filter((r) => r.isSuspended)?.length ?? 0} suspended
                  </span>
                </div>
              </div>

              {/* Pending Free Trial Requests Approval Queue Banner */}
              {pendingTrialRequests.length > 0 && (
                <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 shadow-md space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                      <h3 className="font-display font-extrabold text-sm sm:text-base text-amber-900 dark:text-amber-200">
                        Pending Free Trial Requests ({pendingTrialRequests.length})
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300">
                      Requires Admin Approval
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The following restaurants requested activation of their 30-Day Free Trial. Approving will activate ordering for 30 days and permanently hide the other trial options.
                  </p>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {pendingTrialRequests.map((reqItem) => (
                      <div
                        key={reqItem.id}
                        className="p-3.5 rounded-2xl bg-card border border-amber-500/30 shadow-sm flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-foreground text-sm truncate">
                              {reqItem.restaurant.name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                              {reqItem.plan.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {reqItem.restaurant.owner?.email || reqItem.restaurant.slug}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Requested: {new Date(reqItem.createdAt || reqItem.startsAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <button
                            type="button"
                            onClick={() => approveTrialMutation.mutate(reqItem.id)}
                            disabled={approveTrialMutation.isPending || rejectTrialMutation.isPending}
                            className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve (30d)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectTrialMutation.mutate(reqItem.id)}
                            disabled={approveTrialMutation.isPending || rejectTrialMutation.isPending}
                            className="py-1.5 px-2.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition-all cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search and Filters Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border shadow-sm">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search restaurant, owner, plan, or payment ID..."
                    className="w-full pl-9 pr-3.5 py-2 bg-muted/40 border border-border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                  {(['ALL', 'FREE_TRIAL', 'PAID', 'UNPAID', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                        statusFilter === filter
                          ? filter === 'FREE_TRIAL'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : filter === 'PAID'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : filter === 'UNPAID'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {filter === 'FREE_TRIAL' && '🎁 FREE TRIAL'}
                      {filter === 'PAID' && '✓ PAID'}
                      {filter === 'UNPAID' && '⏳ UNPAID'}
                      {filter === 'ALL' && 'ALL'}
                      {filter === 'ACTIVE' && 'ACTIVE'}
                      {filter === 'EXPIRED' && 'EXPIRED'}
                      {filter === 'SUSPENDED' && 'SUSPENDED'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subscriptions Table */}
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="py-3 px-4">Restaurant</th>
                        <th className="py-3 px-4">Plan Tier</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Payment Method & ID</th>
                        <th className="py-3 px-4">Payment Status</th>
                        <th className="py-3 px-4">Cycle & Expiration</th>
                        <th className="py-3 px-4">Plan Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSubscriptions.map((sub) => {
                        const now = Date.now();
                        const isExpired = new Date(sub.expiresAt).getTime() < now;
                        const days = Math.max(1, Math.round((new Date(sub.expiresAt).getTime() - new Date(sub.startsAt).getTime()) / (1000 * 60 * 60 * 24)));
                        const daysLeft = Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24)));
                        const isFreeTrial = sub.paymentStatus === 'FREE_TRIAL' || sub.paymentMethod === 'FREE_TRIAL' || sub.plan.price === 0;
                        const isPaid = sub.paymentStatus === 'PAID';

                        return (
                          <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                            {/* Restaurant Info */}
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <span>{sub.restaurant.name}</span>
                                {sub.restaurant.isSuspended && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-600 font-bold border border-red-500/20">
                                    Suspended
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {sub.restaurant.owner?.email || sub.restaurant.slug}
                              </div>
                            </td>

                            {/* Plan Tier */}
                            <td className="py-3.5 px-4 font-bold text-foreground">
                              {isFreeTrial ? (
                                <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25 inline-flex items-center gap-1 font-bold">
                                  <Gift className="w-3 h-3 text-purple-500" />
                                  Free Trial
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                                  {sub.plan.name}
                                </span>
                              )}
                            </td>

                            {/* Amount */}
                            <td className="py-3.5 px-4">
                              {isFreeTrial ? (
                                <div>
                                  <div className="font-extrabold text-foreground text-sm flex items-center gap-1">
                                    <span className="text-purple-600 dark:text-purple-400">₹0</span>
                                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                                      Free
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">Complimentary</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-black text-foreground text-sm">
                                    ₹{sub.amount.toLocaleString('en-IN')}
                                  </div>
                                  {!isPaid && (
                                    <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                                      Pending Payment
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Payment Method & Reference */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isFreeTrial
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25'
                                    : sub.paymentMethod === 'RAZORPAY'
                                    ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                                    : 'bg-muted text-muted-foreground border border-border'
                                }`}>
                                  {isFreeTrial ? 'FREE_TRIAL' : sub.paymentMethod}
                                </span>
                              </div>
                              {sub.razorpayPaymentId ? (
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[140px]" title={sub.razorpayPaymentId}>
                                  {sub.razorpayPaymentId}
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground italic mt-0.5">
                                  {isFreeTrial ? 'Onboarding trial' : 'No transaction ID'}
                                </div>
                              )}
                            </td>

                            {/* Payment Status - Only PAID if confirmed! */}
                            <td className="py-3.5 px-4">
                              {sub.paymentStatus === 'TRIAL_PENDING' ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 inline-flex items-center gap-1 shadow-sm">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  ⏳ PENDING APPROVAL
                                </span>
                              ) : isFreeTrial ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25 inline-flex items-center gap-1 shadow-sm">
                                  <Gift className="w-3 h-3 text-purple-500" />
                                  FREE TRIAL
                                </span>
                              ) : isPaid ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 shadow-sm">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  ✓ PAID
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 inline-flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  ⏳ UNPAID
                                </span>
                              )}
                            </td>

                            {/* Cycle & Expiration */}
                            <td className="py-3.5 px-4">
                              <div className="text-foreground font-semibold">
                                {new Date(sub.expiresAt).toLocaleDateString()}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {isExpired ? (
                                  <span className="text-red-500 font-bold">Expired</span>
                                ) : (
                                  <span className={isFreeTrial ? 'text-purple-600 dark:text-purple-400 font-bold' : 'text-emerald-500 font-bold'}>
                                    {daysLeft} days remaining
                                  </span>
                                )}{' '}
                                ({days}d cycle)
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                sub.paymentStatus === 'TRIAL_PENDING'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                  : sub.isActive && !isExpired
                                  ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                                  : 'bg-red-500/10 text-red-600 border border-red-500/20'
                              }`}>
                                {sub.paymentStatus === 'TRIAL_PENDING' ? '⏳ Awaiting Admin' : sub.isActive && !isExpired ? '🟢 Active' : '🔴 Inactive / Disabled'}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {sub.paymentStatus === 'TRIAL_PENDING' ? (
                                  <>
                                    <button
                                      onClick={() => approveTrialMutation.mutate(sub.id)}
                                      disabled={approveTrialMutation.isPending || rejectTrialMutation.isPending}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer shadow-sm transition-all"
                                      title="Approve Free Trial for 30 Days"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Approve (30d)</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Decline free trial request for ${sub.restaurant.name}?`)) {
                                          rejectTrialMutation.mutate(sub.id);
                                        }
                                      }}
                                      disabled={approveTrialMutation.isPending || rejectTrialMutation.isPending}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-red-500/30 text-red-600 hover:bg-red-500/10 cursor-pointer transition-all"
                                      title="Decline Request"
                                    >
                                      Decline
                                    </button>
                                  </>
                                ) : (
                                  <>
                                {/* Toggle Active / Disable */}
                                <button
                                  onClick={() => {
                                    const action = sub.isActive ? 'disable' : 'reactivate';
                                    if (confirm(`Are you sure you want to ${action} subscription for ${sub.restaurant.name}?`)) {
                                      toggleSubMutation.mutate(sub.id);
                                    }
                                  }}
                                  disabled={toggleSubMutation.isPending}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                                    sub.isActive
                                      ? 'border-red-500/30 text-red-600 hover:bg-red-500/10'
                                      : 'border-green-500/30 text-green-600 hover:bg-green-500/10'
                                  }`}
                                  title={sub.isActive ? 'Disable plan access' : 'Enable plan access'}
                                >
                                  {sub.isActive ? 'Disable' : 'Enable'}
                                </button>

                                {/* If Free Trial: Update / Extend Free Days; Else: Toggle Paid/Unpaid */}
                                {isFreeTrial ? (
                                  <button
                                    onClick={() => {
                                      setShowExtendFreeModal(sub);
                                      setExtendDaysInput('14');
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                                    title="Update / Add Free Days"
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>Update Free Days</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const newStatus = isPaid ? 'UNPAID' : 'PAID';
                                      const confirmMsg = isPaid
                                        ? `Mark subscription for ${sub.restaurant.name} as UNPAID?`
                                        : `Confirm payment received and mark as PAID for ${sub.restaurant.name}?`;
                                      if (confirm(confirmMsg)) {
                                        togglePaymentStatusMutation.mutate({ id: sub.id, newStatus });
                                      }
                                    }}
                                    disabled={togglePaymentStatusMutation.isPending}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                                      isPaid
                                        ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                                        : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                                    }`}
                                    title={isPaid ? 'Set to Unpaid' : 'Mark as Paid'}
                                  >
                                    {isPaid ? 'Set Unpaid' : '✓ Mark Paid'}
                                  </button>
                                )}

                                  {/* Delete Record */}
                                  <button
                                    onClick={() => {
                                      if (confirm(`Permanently delete this subscription record for ${sub.restaurant.name}?`)) {
                                        deleteSubRecordMutation.mutate(sub.id);
                                      }
                                    }}
                                    disabled={deleteSubRecordMutation.isPending}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                                    title="Delete subscription record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredSubscriptions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-muted-foreground">
                            No subscription records found matching your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Plans Management Tab */
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              {/* Active Plans Grid */}
              <div className="xl:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-semibold text-lg">Active Billing Tiers</h2>
                    <p className="text-xs text-muted-foreground">Plans available for restaurants & hotels to subscribe</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                      title="Refresh Plans"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Plan Category Filter Tabs */}
                <div className="flex items-center gap-1.5 flex-wrap bg-muted/40 p-1.5 rounded-2xl border border-border">
                  {[
                    { id: 'ALL', label: `All Tiers (${adminSubData?.plans?.length || 0})` },
                    { id: 'FREE', label: '🎁 Free Trials (3)' },
                    { id: 'PAID', label: '💼 Paid Plans (3)' },
                    { id: 'ENTERPRISE', label: '🏢 Enterprise (1)' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPlanCategoryFilter(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        planCategoryFilter === tab.id
                          ? 'bg-card text-foreground shadow-xs border border-border/80'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {isLoading ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-card border border-border rounded-2xl p-6 h-56 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {adminSubData?.plans
                      ?.filter((plan) => {
                        const isFree = plan.price === 0;
                        const isEnt = plan.name.toLowerCase().includes('enterprise');
                        if (planCategoryFilter === 'FREE') return isFree;
                        if (planCategoryFilter === 'ENTERPRISE') return isEnt;
                        if (planCategoryFilter === 'PAID') return !isFree && !isEnt;
                        return true;
                      })
                      ?.map((plan) => {
                        const features = formatPlanFeatures(plan.features, plan.platformType, plan.name);
                        const isFree = plan.price === 0;
                        const isEnterprise = plan.name.toLowerCase().includes('enterprise');
                        const isDual = plan.platformType === 'DUAL';

                        return (
                          <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`bg-card border rounded-2xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all ${
                              isEnterprise
                                ? 'border-indigo-500/50 ring-2 ring-indigo-500/10 shadow-lg shadow-indigo-500/5'
                                : isDual && !isFree
                                ? 'border-amber-500/40 ring-1 ring-amber-500/10'
                                : 'border-border'
                            }`}
                          >
                            <div>
                              {/* Badges Header */}
                              <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {plan.platformType === 'DUAL' ? (
                                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                      🌟 Dual (Restaurant + Hotel)
                                    </span>
                                  ) : plan.platformType === 'HOTEL' ? (
                                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                      🏨 Hotel Only
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                      🍽️ Restaurant
                                    </span>
                                  )}

                                  {isFree ? (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                                      Free Trial
                                    </span>
                                  ) : isEnterprise ? (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Enterprise Customizable
                                    </span>
                                  ) : isDual ? (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      2x Dual Bundle
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                      Paid Tier
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) {
                                        deletePlanMutation.mutate(plan.id);
                                      }
                                    }}
                                    disabled={deletePlanMutation.isPending}
                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                    title="Delete Plan"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="mb-4">
                                <span className="font-bold text-lg font-display text-foreground block">{plan.name}</span>
                                {isDual && !isFree && !isEnterprise && (
                                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">
                                    Double single plan rate: Restaurant (₹1,499) + Hotel (₹1,499)
                                  </span>
                                )}
                                {isEnterprise && (
                                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5">
                                    Customizable enterprise tier with custom quotas, branding, and SLA
                                  </span>
                                )}
                              </div>

                              <div className="flex items-baseline gap-1.5 mb-5">
                                <span className="text-3xl font-black font-display text-foreground">₹{plan.price.toLocaleString('en-IN')}</span>
                                <span className="text-xs text-muted-foreground font-medium">
                                  {isFree ? '/ free trial base' : '/ month (30 days base)'}
                                </span>
                              </div>

                              <div className="space-y-2.5 border-t border-border/60 pt-4">
                                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Features Included</p>
                                {features.map((feature, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span className="text-foreground/90">{String(feature)}</span>
                                  </div>
                                ))}
                                {features.length === 0 && (
                                  <p className="text-xs italic text-muted-foreground">No features specified</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Create Plan form */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="font-display font-semibold text-lg">Create New Plan</h2>
                  <p className="text-xs text-muted-foreground">Add new subscription packages for restaurants & hotels.</p>
                </div>

                <div className="space-y-3.5 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">Plan Name</label>
                    <input
                      value={newPlan.name}
                      onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Hotel Executive Suite"
                      className="w-full px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">Platform Type</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'RESTAURANT', label: '🍽️ Restaurant' },
                        { id: 'HOTEL', label: '🏨 Hotel' },
                        { id: 'DUAL', label: '🌟 Dual' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setNewPlan((p) => ({ ...p, platformType: t.id }))}
                          className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                            newPlan.platformType === t.id
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/60'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">Price (₹)</label>
                      <input
                        type="number"
                        value={newPlan.price}
                        onChange={(e) => setNewPlan((p) => ({ ...p, price: e.target.value }))}
                        placeholder="e.g. 1499"
                        className="w-full px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">Duration (days)</label>
                      <input
                        type="number"
                        value={newPlan.duration}
                        onChange={(e) => setNewPlan((p) => ({ ...p, duration: e.target.value }))}
                        placeholder="30"
                        className="w-full px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">Features (one per line)</label>
                    <textarea
                      value={newPlan.features}
                      onChange={(e) => setNewPlan((p) => ({ ...p, features: e.target.value }))}
                      placeholder="Unlimited Menu Items&#10;Advanced AI Recommendations&#10;Hotel Room Service Support"
                      rows={5}
                      className="w-full px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>

                  <button
                    onClick={() => createPlanMutation.mutate()}
                    disabled={!newPlan.name || newPlan.price === '' || createPlanMutation.isPending}
                    className="w-full flex items-center gap-2 justify-center px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/95 disabled:opacity-50 transition-colors shadow-md shadow-primary/10 mt-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {createPlanMutation.isPending ? 'Creating...' : 'Create Billing Plan'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Grant / Assign Plan Modal */}
      <AnimatePresence>
        {showAssignModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="font-display font-extrabold text-lg text-foreground flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Grant Subscription Plan
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-muted-foreground block mb-1">Select Restaurant</label>
                  <select
                    value={assignForm.restaurantId}
                    onChange={(e) => setAssignForm((p) => ({ ...p, restaurantId: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground"
                  >
                    {restaurantsData?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.slug}) {r.isSuspended ? '[Suspended]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground block mb-1">Select Subscription Plan</label>
                  <select
                    value={assignForm.planId}
                    onChange={(e) => setAssignForm((p) => ({ ...p, planId: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground"
                  >
                    {adminSubData?.plans?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — ₹{p.price}/mo
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground block mb-1">Duration Cycle</label>
                  <select
                    value={assignForm.durationInDays}
                    onChange={(e) => setAssignForm((p) => ({ ...p, durationInDays: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground"
                  >
                    <option value="7">7 Days (1 Week Trial)</option>
                    <option value="14">14 Days (2 Weeks Trial)</option>
                    <option value="30">30 Days (1 Month)</option>
                    <option value="60">60 Days (2 Months)</option>
                    <option value="90">90 Days (3 Months / Quarterly)</option>
                    <option value="180">180 Days (6 Months)</option>
                    <option value="365">365 Days (1 Year / Annual)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground block mb-1">Payment Status</label>
                  <select
                    value={assignForm.paymentStatus}
                    onChange={(e) => setAssignForm((p) => ({ ...p, paymentStatus: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground"
                  >
                    <option value="FREE_TRIAL">🎁 FREE TRIAL (Complimentary Access)</option>
                    <option value="UNPAID">⏳ UNPAID (Payment pending / To collect later)</option>
                    <option value="PAID">✓ PAID (Confirmed offline / Direct payment received)</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Select FREE TRIAL for test/demo periods, or PAID only if offline money is confirmed.
                  </p>
                </div>

                {/* Price Summary */}
                {(() => {
                  const plan = adminSubData?.plans?.find((p) => p.id === assignForm.planId);
                  const isFree = plan?.price === 0 || assignForm.paymentStatus === 'FREE_TRIAL';
                  const days = parseInt(assignForm.durationInDays, 10) || 30;
                  const months = days >= 360 ? 12 : Math.max(1, Math.round(days / 30));
                  const total = isFree ? 0 : (plan ? plan.price * months : 0);
                  return (
                    <div className="p-3 rounded-2xl bg-muted/60 border border-border flex items-center justify-between">
                      <span className="text-muted-foreground">Calculated Value:</span>
                      <span className="text-base font-extrabold text-primary">
                        {isFree ? '₹0 (Free Trial)' : `₹${total.toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => assignPlanMutation.mutate()}
                  disabled={assignPlanMutation.isPending || !assignForm.restaurantId || !assignForm.planId}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {assignPlanMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Assign Plan & Activate</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Extend / Update Free Days Modal */}
      <AnimatePresence>
        {showExtendFreeModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-base text-foreground">
                      Update / Extend Free Days
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {showExtendFreeModal.restaurant.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExtendFreeModal(null)}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* Current Expiry Info */}
                <div className="p-3 rounded-2xl bg-muted/60 border border-border flex items-center justify-between">
                  <span className="text-muted-foreground">Current Expiration:</span>
                  <span className="font-bold text-foreground">
                    {new Date(showExtendFreeModal.expiresAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Quick Add Days Buttons */}
                <div>
                  <label className="font-bold text-muted-foreground block mb-1.5">Quick Add Options</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['7', '14', '30', '60'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setExtendDaysInput(d)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          extendDaysInput === d
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-muted/40 border-border text-foreground hover:bg-muted'
                        }`}
                      >
                        +{d} Days
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Number of Days */}
                <div>
                  <label className="font-bold text-muted-foreground block mb-1">
                    Or Enter Additional Days To Add
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={extendDaysInput}
                    onChange={(e) => setExtendDaysInput(e.target.value)}
                    placeholder="e.g. 14"
                    className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                {/* Calculation Preview */}
                {(() => {
                  const addDays = parseInt(extendDaysInput, 10) || 0;
                  const now = Date.now();
                  const currentExp = new Date(showExtendFreeModal.expiresAt).getTime();
                  const base = currentExp > now ? currentExp : now;
                  const newExpiry = new Date(base + addDays * 24 * 60 * 60 * 1000);
                  const totalDaysLeft = Math.max(0, Math.ceil((newExpiry.getTime() - now) / (1000 * 60 * 60 * 24)));

                  return (
                    <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-200 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>New Expiration Date:</span>
                        <span className="font-extrabold">{newExpiry.toLocaleDateString()}</span>
                      </div>
                      <div className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                        Restaurant will have <strong>{totalDaysLeft} days remaining</strong> of full free access.
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowExtendFreeModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const days = parseInt(extendDaysInput, 10);
                    if (days > 0) {
                      extendFreeMutation.mutate({ id: showExtendFreeModal.id, additionalDays: days });
                    }
                  }}
                  disabled={extendFreeMutation.isPending || !extendDaysInput || parseInt(extendDaysInput, 10) <= 0}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {extendFreeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save & Extend Free Days</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Configure Global Free Trial Defaults Modal */}
      <AnimatePresence>
        {showFreeTrialSettingsModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="font-display font-extrabold text-base text-foreground">
                    Free Trial Onboarding Settings
                  </h3>
                </div>
                <button
                  onClick={() => setShowFreeTrialSettingsModal(false)}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-muted-foreground block mb-1">
                    Default Free Trial Period (in Days)
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Every new restaurant registered or onboarded will automatically receive this number of free trial days.
                  </p>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {['7', '14', '30', '60'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFreeTrialDaysInput(d)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          freeTrialDaysInput === d
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-muted/40 border-border text-foreground hover:bg-muted'
                        }`}
                      >
                        {d} Days
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={freeTrialDaysInput}
                    onChange={(e) => setFreeTrialDaysInput(e.target.value)}
                    placeholder="14"
                    className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-muted/60 border border-border text-muted-foreground text-xs space-y-1">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Automatic Free Onboarding is Active
                  </div>
                  <p className="text-[11px]">
                    Restaurants will have instant full access upon registration without needing upfront credit cards or payment confirmation.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowFreeTrialSettingsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const days = parseInt(freeTrialDaysInput, 10);
                    if (days > 0) {
                      updateFreeTrialSettingsMutation.mutate(days);
                    }
                  }}
                  disabled={updateFreeTrialSettingsMutation.isPending || !freeTrialDaysInput || parseInt(freeTrialDaysInput, 10) <= 0}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {updateFreeTrialSettingsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Default Days</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
