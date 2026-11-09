'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3, LayoutDashboard, UtensilsCrossed, ShoppingBag, Tag, Settings, LogOut,
  Menu, TrendingUp, DollarSign, Users, Calendar, Star, Palette
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api, { getSocketUrl } from '@/services/api';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/owner/dashboard' },
  { label: 'Menu', icon: UtensilsCrossed, href: '/owner/menu' },
  { label: 'Orders', icon: ShoppingBag, href: '/owner/orders' },
  { label: 'Coupons', icon: Tag, href: '/owner/coupons' },
  { label: 'Reviews', icon: Star, href: '/owner/reviews' },
  { label: 'Analytics', icon: BarChart3, href: '/owner/analytics' },
  { label: 'Customize', icon: Palette, href: '/owner/customize' },
  { label: 'Settings', icon: Settings, href: '/owner/settings' },
];

export function OwnerAnalyticsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');

  const restId = (user as any)?.restaurantId;

  useEffect(() => {
    if (!restId) return;
    const socket: Socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
    });
    const joinRest = () => socket.emit('join:restaurant', restId);
    if (socket.connected) joinRest();
    socket.on('connect', joinRest);

    const handleRefresh = () => {
      qc.invalidateQueries({ queryKey: ['owner-analytics'] });
    };

    socket.on('order:new', handleRefresh);
    socket.on('new_order', handleRefresh);
    socket.on('order:status_updated', handleRefresh);
    socket.on('order_status_changed', handleRefresh);

    return () => {
      socket.disconnect();
    };
  }, [restId, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ['owner-analytics', period],
    queryFn: async () => {
      const res = await api.get(`/owner/analytics?period=${period}`);
      return res.data.data as {
        revenueData: Array<{ date: string; revenue: number; orders: number }>;
        topItems: Array<{ name: string; quantity: number; revenue: number }>;
        reviewStats: { avgRating: number; totalReviews: number };
        summaryStats?: {
          todayRevenue: number;
          todayOrders: number;
          monthlyRevenue: number;
          monthlyOrders: number;
          todayHourlyAverage: number;
        };
        todayHourlyEarnings?: Array<{ hour: string; rawHour: number; revenue: number; orders: number }>;
      };
    },
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  const { data: restaurantData } = useQuery({
    queryKey: ['owner-restaurant-layout'],
    queryFn: async () => {
      const res = await api.get('/owner/restaurant');
      return res.data.data.restaurant as { themeColor: string | null };
    },
  });
  const themeColor = restaurantData?.themeColor ?? '#E85D04';

  const totalRevenue = data?.revenueData.reduce((sum, d) => sum + d.revenue, 0) ?? 0;
  const totalOrders = data?.revenueData.reduce((sum, d) => sum + d.orders, 0) ?? 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Analytics</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
            {(['7d', '30d'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                {p === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* KPI */}
          {(() => {
            const formatCurrency = (val: number | undefined | null) => {
              const num = Number(val) || 0;
              if (Number.isInteger(num)) return `₹${num.toLocaleString('en-IN')}`;
              return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };

            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Today's Earnings", value: formatCurrency(data?.summaryStats?.todayRevenue), icon: DollarSign, color: 'text-green-600 dark:text-green-400', bg: 'from-green-500/20 to-emerald-500/20', border: 'border-green-500/20' },
                  { label: "Monthly Earnings", value: formatCurrency(data?.summaryStats?.monthlyRevenue), icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/20' },
                  { label: "Today Hourly Avg", value: `${formatCurrency(data?.summaryStats?.todayHourlyAverage)}/hr`, icon: Calendar, color: 'text-purple-600 dark:text-purple-400', bg: 'from-purple-500/20 to-indigo-500/20', border: 'border-purple-500/20' },
                  { label: 'Period Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-500/20 to-teal-500/20', border: 'border-emerald-500/20' },
                  { label: 'Period Orders', value: totalOrders, icon: ShoppingBag, color: 'text-orange-600 dark:text-orange-400', bg: 'from-orange-500/20 to-amber-500/20', border: 'border-orange-500/20' },
                  { label: 'Avg Rating', value: `${(data?.reviewStats.avgRating ?? 0).toFixed(1)} ★`, icon: Star, color: 'text-yellow-600 dark:text-yellow-400', bg: 'from-yellow-500/20 to-amber-500/20', border: 'border-yellow-500/20' },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      className={`bg-gradient-to-br ${stat.bg} border ${stat.border} rounded-2xl p-4 flex flex-col justify-between`}>
                      <Icon className={`w-5 h-5 ${stat.color} mb-2`} />
                      <div>
                        <p className="font-display text-xl font-bold">{isLoading ? '—' : stat.value}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{stat.label}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })()}

          {/* Today's Hourly Earnings Chart */}
          {data?.todayHourlyEarnings && data.todayHourlyEarnings.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <h2 className="font-display font-semibold mb-1">Today's Hourly Earnings</h2>
              <p className="text-xs text-muted-foreground mb-4">Earnings breakdown for today (12 AM - 11 PM)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.todayHourlyEarnings}>
                  <defs>
                    <linearGradient id="hourlyGradAnalytics" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={themeColor} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={themeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip formatter={(v: number) => [`₹${v}`, 'Earnings']} labelFormatter={(l: string) => `Time: ${l}`} />
                  <Area type="monotone" dataKey="revenue" stroke={themeColor} strokeWidth={2.5} fill="url(#hourlyGradAnalytics)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Revenue Chart */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-display font-semibold mb-4">Revenue Over Time ({period === '7d' ? 'Last 7 Days' : 'Last 30 Days'})</h2>
            {data?.revenueData && data.revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.revenueData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip formatter={(v: number) => [`₹${v}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
            )}
          </div>

          {/* Top Items */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-display font-semibold mb-4">Top Selling Items</h2>
            {data?.topItems && data.topItems.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.topItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [v, 'Quantity']} />
                  <Bar dataKey="quantity" fill={themeColor} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
