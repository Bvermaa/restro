'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, ShoppingBag, Tag, BarChart3, Settings,
  LogOut, Menu, X, TrendingUp, Users, DollarSign, Clock, Bell, ChevronRight,
  Power, Star, Palette, BellRing, ChefHat, CreditCard, AlertTriangle, Calendar, ShieldCheck, Zap
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api, { getSocketUrl } from '@/services/api';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { useWaiterStore } from '@/store/waiter.store';
import { MessageSquare } from 'lucide-react';
import { AdminOwnerChatModal } from '@/components/admin/AdminOwnerChatModal';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/owner/dashboard' },
  { label: 'Menu', icon: UtensilsCrossed, href: '/owner/menu' },
  { label: 'Orders', icon: ShoppingBag, href: '/owner/orders' },
  { label: 'Kitchen Staff', icon: ChefHat, href: '/owner/kitchen-staff' },
  { label: 'Coupons', icon: Tag, href: '/owner/coupons' },
  { label: 'Reviews', icon: Star, href: '/owner/reviews' },
  { label: 'Analytics', icon: BarChart3, href: '/owner/analytics' },
  { label: 'Customize', icon: Palette, href: '/owner/customize' },
  { label: 'Settings', icon: Settings, href: '/owner/settings' },
];

export function OwnerDashboard() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['owner-dashboard'],
    queryFn: async () => {
      const response = await api.get('/owner/dashboard');
      return response.data.data as {
        restaurant: { id: string; name: string; isOpen: boolean; isSuspended?: boolean; themeColor: string | null };
        subscription?: {
          id: string;
          planName: string;
          planPrice: number;
          amount: number;
          paymentStatus: string;
          paymentMethod: string;
          startsAt: string;
          expiresAt: string;
          isActive: boolean;
          daysRemaining: number;
          planFeatures?: any;
        } | null;
        stats: {
          todayRevenue: number;
          todayOrders: number;
          monthlyRevenue: number;
          monthlyOrders: number;
          todayHourlyAverage: number;
          pendingOrders: number;
          avgOrderValue: number;
          avgRating: number;
          totalReviews: number;
        };
        recentOrders: Array<{
          id: string; status: string; total: number; createdAt: string;
          guestName: string | null; user: { name: string } | null;
          items: Array<{ menuItem: { name: string } }>;
          paymentMethod: string;
        }>;
        last7DaysRevenue: Array<{ date: string; revenue: number; orders: number }>;
        todayHourlyEarnings: Array<{ hour: string; rawHour: number; revenue: number; orders: number }>;
      };
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const restId = (user as any)?.restaurantId || data?.restaurant?.id;

  // Real-time socket updates for order status, new orders, deleted orders
  useEffect(() => {
    if (!restId) return;

    const socket: Socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
    });

    const joinRest = () => {
      socket.emit('join:restaurant', restId);
    };

    if (socket.connected) {
      joinRest();
    }
    socket.on('connect', joinRest);

    const handleRefresh = () => {
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-analytics'] });
    };

    socket.on('order:new', handleRefresh);
    socket.on('new_order', handleRefresh);
    socket.on('order:status_updated', handleRefresh);
    socket.on('order_status_changed', handleRefresh);
    socket.on('order_cancelled', handleRefresh);
    socket.on('order_deleted', handleRefresh);

    return () => {
      socket.disconnect();
    };
  }, [restId, qc]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      logout();
      router.push('/login');
    }
  };

  const toggleRestaurant = async () => {
    if (!data) return;
    try {
      await api.patch('/owner/restaurant/toggle', { isOpen: !data.restaurant.isOpen });
      toast.success(`Restaurant is now ${!data.restaurant.isOpen ? 'OPEN' : 'CLOSED'}`);
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
    } catch {
      toast.error('Failed to update restaurant status');
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    CONFIRMED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    PREPARING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    READY: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Dashboard</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {data && (
              <button
                onClick={toggleRestaurant}
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                  data.restaurant.isOpen
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'
                }`}
              >
                <Power className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{data.restaurant.isOpen ? 'Open' : 'Closed'}</span>
              </button>
            )}
            {/* Waiter Calls Bell */}
            <WaiterBell />

            {/* Admin Support Chat Button */}
            <button
              onClick={() => setShowChatModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition-all shadow-sm shrink-0"
              title="Chat 1-to-1 with Super Admin"
            >
              <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">Admin Support Chat</span>
            </button>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 skeleton rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Subscription Status & Cycle Banner */}
              {(() => {
                const sub = data?.subscription;
                const isSuspended = data?.restaurant?.isSuspended;

                if (isSuspended) {
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 sm:p-5 rounded-3xl bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-500/20">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm sm:text-base text-red-600 dark:text-red-400">
                            Restaurant Suspended — Subscription Expired
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Customer digital ordering is currently offline. Please purchase or renew a subscription plan to immediately reactivate your restaurant.
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/owner/subscription"
                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all shrink-0 text-center flex items-center justify-center gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        <span>Renew / Buy Subscription</span>
                      </Link>
                    </motion.div>
                  );
                }

                if (sub) {
                  const days = Math.max(1, Math.round((new Date(sub.expiresAt).getTime() - new Date(sub.startsAt).getTime()) / (1000 * 60 * 60 * 24)));
                  const cycleText = days >= 360 ? '1 Year Annual Cycle' : days >= 170 ? '6 Months Cycle' : days >= 80 ? '3 Months Quarterly Cycle' : '1 Month Monthly Cycle';
                  const isExpiringSoon = sub.daysRemaining <= 5;

                  return (
                    <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-amber-500 text-white flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Active Plan</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                              🟢 Active
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              {cycleText} ({days}d)
                            </span>
                          </div>
                          <h2 className="text-base sm:text-lg font-black font-display text-foreground mt-0.5 truncate">
                            {sub.planName} Tier
                          </h2>
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 text-xs">
                        <div className="p-2.5 sm:p-3 rounded-2xl bg-muted/40 border border-border flex-1 sm:flex-initial">
                          <span className="text-muted-foreground block text-[10px] font-semibold">Remaining Validity</span>
                          <span className={`font-extrabold text-sm ${isExpiringSoon ? 'text-amber-500 font-black' : 'text-primary'}`}>
                            {sub.daysRemaining} {sub.daysRemaining === 1 ? 'day' : 'days'}
                            {isExpiringSoon && ' (Expiring Soon!)'}
                          </span>
                        </div>
                        <div className="p-2.5 sm:p-3 rounded-2xl bg-muted/40 border border-border flex-1 sm:flex-initial">
                          <span className="text-muted-foreground block text-[10px] font-semibold">Valid Till / Ends On</span>
                          <span className="font-bold text-foreground text-sm">
                            {new Date(sub.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                        <Link
                          href="/owner/subscription"
                          className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-muted hover:bg-muted-foreground/10 text-foreground font-bold text-xs border border-border transition-all flex items-center justify-center gap-2 shrink-0 shadow-sm"
                        >
                          <span>Manage / Renew</span>
                          <ChevronRight className="w-4 h-4 text-primary" />
                        </Link>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>No active subscription tier found. You are currently on free starter mode.</span>
                    </div>
                    <Link
                      href="/owner/subscription"
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/95 transition-all shrink-0 text-center shadow-sm"
                    >
                      Subscribe to a Plan ➔
                    </Link>
                  </div>
                );
              })()}

              {/* Stats */}
              {(() => {
                const formatCurrency = (val: number | undefined | null) => {
                  const num = Number(val) || 0;
                  if (Number.isInteger(num)) return `₹${num.toLocaleString('en-IN')}`;
                  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };

                return (
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    {[
                      {
                        label: "Today's Earnings",
                        value: formatCurrency(data?.stats?.todayRevenue),
                        subtitle: `${data?.stats?.todayOrders ?? 0} orders today`,
                        icon: DollarSign,
                        color: 'from-green-500/20 to-emerald-500/20',
                        border: 'border-green-500/20',
                        text: 'text-green-600 dark:text-green-400',
                      },
                      {
                        label: "Monthly Earnings",
                        value: formatCurrency(data?.stats?.monthlyRevenue),
                        subtitle: `${data?.stats?.monthlyOrders ?? 0} orders this month`,
                        icon: TrendingUp,
                        color: 'from-blue-500/20 to-cyan-500/20',
                        border: 'border-blue-500/20',
                        text: 'text-blue-600 dark:text-blue-400',
                      },
                      {
                        label: "Today Hourly Avg",
                        value: `${formatCurrency(data?.stats?.todayHourlyAverage)}/hr`,
                        subtitle: 'Avg earning per hour',
                        icon: Clock,
                        color: 'from-purple-500/20 to-indigo-500/20',
                        border: 'border-purple-500/20',
                        text: 'text-purple-600 dark:text-purple-400',
                      },
                      {
                        label: 'Pending Orders',
                        value: data?.stats?.pendingOrders ?? 0,
                        subtitle: 'Needs confirmation',
                        icon: Clock,
                        color: 'from-orange-500/20 to-amber-500/20',
                        border: 'border-orange-500/20',
                        text: 'text-orange-600 dark:text-orange-400',
                      },
                      {
                        label: 'Avg. Order',
                        value: formatCurrency(data?.stats?.avgOrderValue),
                        subtitle: 'Per completed order',
                        icon: ShoppingBag,
                        color: 'from-pink-500/20 to-rose-500/20',
                        border: 'border-pink-500/20',
                        text: 'text-pink-600 dark:text-pink-400',
                      },
                      {
                        label: 'Avg. Rating',
                        value: data?.stats?.avgRating ? `${(data.stats.avgRating as number).toFixed(1)} ★` : '0.0 ★',
                        subtitle: `${data?.stats?.totalReviews ?? 0} reviews`,
                        icon: Star,
                        color: 'from-amber-500/20 to-yellow-500/20',
                        border: 'border-amber-500/20',
                        text: 'text-amber-600 dark:text-amber-400',
                      },
                    ].map((stat, i) => {
                      const Icon = stat.icon;
                      return (
                        <motion.div
                          key={stat.label}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className={`bg-gradient-to-br ${stat.color} border ${stat.border} rounded-2xl p-4 flex flex-col justify-between`}
                        >
                          <div className={`w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-2 ${stat.text}`}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <p className="font-display text-xl font-bold tracking-tight">{stat.value}</p>
                            <p className="font-semibold text-xs text-foreground/80 mt-0.5">{stat.label}</p>
                            <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Charts Grid: Today's Hourly Earnings + 7 Days Revenue */}
              {(() => {
                const themeColor = data?.restaurant.themeColor ?? '#E85D04';
                const formatCurrency = (val: number | undefined | null) => {
                  const num = Number(val) || 0;
                  if (Number.isInteger(num)) return `₹${num.toLocaleString('en-IN')}`;
                  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Today's Hourly Earnings Chart */}
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" /> Today's Hourly Earnings
                          </h2>
                          <p className="text-xs text-muted-foreground">Earnings broken down by hour (12 AM - 11 PM)</p>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                          Today: {formatCurrency(data?.stats.todayRevenue)}
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={210}>
                        <AreaChart data={data?.todayHourlyEarnings ?? []}>
                          <defs>
                            <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={themeColor} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={themeColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                          <Tooltip formatter={(value: number) => [`₹${value}`, 'Earnings']} labelFormatter={(l: string) => `Time: ${l}`} />
                          <Area type="monotone" dataKey="revenue" stroke={themeColor} strokeWidth={2.5} fill="url(#hourlyGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 7 Days Revenue Chart */}
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="font-display font-bold text-base text-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue (Last 7 Days)
                          </h2>
                          <p className="text-xs text-muted-foreground">Daily revenue trend over the past week</p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={210}>
                        <AreaChart data={data?.last7DaysRevenue ?? []}>
                          <defs>
                            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                          <Tooltip formatter={(value: number) => [`₹${value}`, 'Revenue']} />
                          <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revenueGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Recent Orders */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold">Recent Orders</h2>
                  <Link href="/owner/orders" className="text-sm text-primary flex items-center gap-1 hover:gap-2 transition-all">
                    View all <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {data?.recentOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      onClick={() => router.push('/owner/orders')}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/80 transition-all cursor-pointer border border-transparent hover:border-primary/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            #{order.id.slice(-8).toUpperCase()}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? ''}`}>
                            {order.status}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
                            order.paymentMethod === 'RAZORPAY' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900/30' :
                            order.paymentMethod === 'WALLET' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900/30' :
                            order.paymentMethod === 'PAY_TO_WAITER' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900/30' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900/30'
                          }`}>
                            {order.paymentMethod === 'RAZORPAY' ? 'Online' : order.paymentMethod === 'WALLET' ? 'Wallet' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Pay on Counter'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.guestName ?? order.user?.name ?? 'Guest'} •{' '}
                          {order.items.slice(0, 2).map((i) => i.menuItem.name).join(', ')}
                          {order.items.length > 2 && ` +${order.items.length - 2}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm">
                          ₹{order.total % 1 === 0 ? order.total.toLocaleString('en-IN') : order.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* 1-to-1 Live Support Chat Modal */}
      <AdminOwnerChatModal isOpen={showChatModal} onClose={() => setShowChatModal(false)} />
    </div>
  );
}
