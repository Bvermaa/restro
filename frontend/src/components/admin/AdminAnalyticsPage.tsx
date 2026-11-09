'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3, Store, Users, LayoutDashboard, Settings, LogOut, Menu, Shield,
  TrendingUp, DollarSign, ShoppingBag, CreditCard, Ticket, HandCoins, Star
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' },
  { label: 'Restaurants', icon: Store, href: '/admin/restaurants' },
  { label: 'Users', icon: Users, href: '/admin/users' },
  { label: 'Reviews', icon: Star, href: '/admin/reviews' },
  { label: 'Subscriptions', icon: CreditCard, href: '/admin/subscriptions' },
  { label: 'Coupons', icon: Ticket, href: '/admin/coupons' },
  { label: 'Payouts', icon: HandCoins, href: '/admin/payouts' },
  { label: 'Analytics', icon: BarChart3, href: '/admin/analytics' },
  { label: 'Settings', icon: Settings, href: '/admin/settings' },
];

const PIE_COLORS = ['#E85D04', '#F59E0B', '#10B981', '#6366F1', '#EC4899'];

export function AdminAnalyticsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', period],
    queryFn: async () => {
      const res = await api.get(`/admin/analytics?period=${period}`);
      return res.data.data as {
        summary: {
          totalOrders: number;
          totalRevenue: number;
          platformCommission: number;
          totalUsers: number;
          totalRestaurants: number;
        };
        topRestaurants: Array<{ restaurantId: string; name: string; totalRevenue: number; totalOrders: number; commissionEarned: number }>;
        customerGrowth: Array<{ date: string; count: number }>;
      };
    },
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-xl">Platform Analytics</h1>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                {p === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total Revenue', value: `₹${((data?.summary.totalRevenue ?? 0) / 1000).toFixed(1)}K`, icon: DollarSign, color: 'text-green-600' },
              { label: 'Commission', value: `₹${((data?.summary.platformCommission ?? 0) / 1000).toFixed(1)}K`, icon: TrendingUp, color: 'text-purple-600' },
              { label: 'Total Orders', value: data?.summary.totalOrders ?? 0, icon: ShoppingBag, color: 'text-blue-600' },
              { label: 'Customers', value: data?.summary.totalUsers ?? 0, icon: Users, color: 'text-orange-600' },
              { label: 'Restaurants', value: data?.summary.totalRestaurants ?? 0, icon: Store, color: 'text-pink-600' },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className="bg-card border border-border rounded-2xl p-4">
                  <Icon className={`w-5 h-5 ${stat.color} mb-2`} />
                  <p className="font-display text-2xl font-bold">{isLoading ? '—' : stat.value}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Customer Growth */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-display font-semibold mb-4">Customer Growth</h2>
              {data?.customerGrowth && data.customerGrowth.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.customerGrowth}>
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} fill="url(#growthGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
              )}
            </div>

            {/* Top Restaurants */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-display font-semibold mb-4">Top Restaurants by Revenue</h2>
              {data?.topRestaurants && data.topRestaurants.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topRestaurants.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${v/1000}K`} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [`₹${v}`, 'Revenue']} />
                    <Bar dataKey="totalRevenue" fill="#E85D04" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
              )}
            </div>
          </div>

          {/* Top Restaurants Table */}
          {data?.topRestaurants && data.topRestaurants.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-display font-semibold mb-4">Revenue Leaderboard</h2>
              <div className="space-y-3">
                {data.topRestaurants.map((r, i) => (
                  <div key={r.restaurantId} className="flex items-center gap-4 p-3 bg-muted/30 rounded-xl">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.totalOrders} orders</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">₹{r.totalRevenue.toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">Commission: ₹{r.commissionEarned.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
