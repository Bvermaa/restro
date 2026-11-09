'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Store, Users, BarChart3, Settings, LogOut,
  Menu, TrendingUp, DollarSign, ShoppingBag, CheckCircle2,
  XCircle, Clock, ChevronRight, Shield, CreditCard, Ticket, HandCoins, Megaphone, MessageSquare, Star
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api, { getSocketUrl } from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { io } from 'socket.io-client';
import { SuperAdminBroadcastModal } from './SuperAdminBroadcastModal';
import { AdminOwnerChatModal } from './AdminOwnerChatModal';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/restaurants', label: 'Restaurants', icon: Store },
  { href: '/admin/coupons', label: 'Global Coupons', icon: Ticket },
  { href: '/admin/settlements', label: 'Settlements', icon: HandCoins },
  { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone },
  { href: '/admin/chat', label: 'Owner Messages', icon: MessageSquare },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const socket = io(getSocketUrl(), { transports: ['polling', 'websocket'], withCredentials: true });

    socket.emit('join:user', user.id);

    socket.on('notification:new', (notif: any) => {
      toast.info(notif.title || '💬 New Message / Notification', {
        description: notif.message,
        duration: 8000,
        icon: '💬',
      });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-contacts'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', period],
    queryFn: async () => {
      const response = await api.get(`/admin/analytics?period=${period}`);
      return response.data.data as {
        summary: {
          totalOrders: number;
          totalRevenue: number;
          platformCommission: number;
          totalUsers: number;
          totalRestaurants: number;
        };
        topRestaurants: Array<{
          restaurantId: string;
          name: string;
          totalRevenue: number;
          totalOrders: number;
          commissionEarned: number;
        }>;
        customerGrowth: Array<{ date: string; count: number }>;
      };
    },
  });

  const { data: pendingRestaurants } = useQuery({
    queryKey: ['admin-pending-restaurants'],
    queryFn: async () => {
      const response = await api.get('/admin/restaurants?status=pending&limit=5');
      return response.data.data.restaurants as Array<{
        id: string; name: string; city: string | null;
        owner: { name: string; email: string };
        createdAt: string;
      }>;
    },
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally {
      logout(); router.push('/login');
    }
  };

  const approveRestaurant = async (id: string) => {
    try {
      await api.patch(`/admin/restaurants/${id}/approve`, { isApproved: true });
      toast.success('Restaurant approved!');
    } catch {
      toast.error('Failed to approve restaurant');
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar Backdrop */}
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Platform Overview</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1 shrink min-w-0">
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Broadcast Announcement"
            >
              <Megaphone className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Broadcast Announcement</span>
              <span className="md:hidden">Broadcast</span>
            </button>
            <button
              onClick={() => setShowChatModal(true)}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="1-to-1 Live Support Chat"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">1-to-1 Live Support Chat</span>
              <span className="md:hidden">Live Chat</span>
            </button>
            {(['7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                  period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {p === '7d' ? '7D' : '30D'}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Summary Stats */}
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
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-card border border-border rounded-2xl p-4"
                >
                  <Icon className={`w-5 h-5 ${stat.color} mb-2`} />
                  <p className="font-display text-2xl font-bold">{stat.value}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Top Restaurants by Revenue */}
            {data?.topRestaurants && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-semibold">Top Restaurants</h2>
                  <Link href="/admin/restaurants" className="text-sm text-primary flex items-center gap-1">
                    View all <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.topRestaurants.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v/1000}K`} />
                    <Tooltip formatter={(v: number) => [`₹${v}`, 'Revenue']} />
                    <Bar dataKey="totalRevenue" fill="#E85D04" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pending Approvals */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold">Pending Approvals</h2>
                <Link href="/admin/restaurants?status=pending" className="text-sm text-primary flex items-center gap-1">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="space-y-3">
                {pendingRestaurants?.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-8">No pending approvals 🎉</p>
                )}
                {pendingRestaurants?.map((restaurant) => (
                  <div key={restaurant.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{restaurant.name}</p>
                      <p className="text-xs text-muted-foreground">{restaurant.owner.name} • {restaurant.city ?? 'N/A'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveRestaurant(restaurant.id)}
                        className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Broadcast & Chat Modals */}
      <SuperAdminBroadcastModal isOpen={showBroadcastModal} onClose={() => setShowBroadcastModal(false)} />
      <AdminOwnerChatModal isOpen={showChatModal} onClose={() => setShowChatModal(false)} />
    </div>
  );
}
