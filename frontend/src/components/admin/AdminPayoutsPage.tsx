'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings, Store, Users, BarChart3, LayoutDashboard, LogOut, Menu,
  Shield, CreditCard, Ticket, HandCoins, DollarSign, TrendingUp, ShoppingBag, ArrowUpRight, Receipt, CheckCircle, RefreshCw, Star
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

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

type RestaurantPayoutInfo = {
  restaurantId: string;
  name: string;
  totalRevenue: number;
  totalOrders: number;
  commissionEarned: number;
};

export function AdminPayoutsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['admin-payouts-analytics'],
    queryFn: async () => {
      const response = await api.get('/admin/analytics?period=30d');
      return response.data.data as {
        summary: {
          totalOrders: number;
          totalRevenue: number;
          platformCommission: number;
        };
        topRestaurants: RestaurantPayoutInfo[];
      };
    },
  });

  const [recordedPayouts, setRecordedPayouts] = useState<Array<{ id: string; restaurantName: string; amount: number; date: string; status: 'COMPLETED' }>>([
    { id: 'pay_189a87', restaurantName: 'Upstates', amount: 4850, date: '2026-07-06', status: 'COMPLETED' },
    { id: 'pay_127b52', restaurantName: 'Pizza Palace', amount: 8200, date: '2026-07-05', status: 'COMPLETED' },
  ]);

  const handleRecordPayout = (restaurantName: string, totalRevenue: number, commissionEarned: number) => {
    const netPayout = totalRevenue - commissionEarned;
    if (netPayout <= 0) {
      toast.error('No pending balance to pay out!');
      return;
    }
    const newPayout = {
      id: `pay_${Math.random().toString(36).substr(2, 6)}`,
      restaurantName,
      amount: Math.round(netPayout),
      date: new Date().toISOString().split('T')[0],
      status: 'COMPLETED' as const,
    };
    setRecordedPayouts(prev => [newPayout, ...prev]);
    toast.success(`Successfully recorded payout of ₹${newPayout.amount} to ${restaurantName}!`);
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  const totalRevenue = analyticsData?.summary.totalRevenue ?? 0;
  const totalCommission = analyticsData?.summary.platformCommission ?? 0;
  const netEarnings = totalRevenue - totalCommission;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-xl">Payouts & Commission</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Revenue Statistics Card Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display">₹{totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Volume</p>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display">₹{totalCommission.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Platform Commission</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display">₹{netEarnings.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Restaurant Earnings</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            
            {/* Restaurant Commission list */}
            <div className="xl:col-span-2 bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-display font-semibold text-lg">Restaurant Balances</h2>
                  <p className="text-xs text-muted-foreground">Approve payouts and track commission cuts per restaurant.</p>
                </div>
                <button 
                  onClick={() => qc.invalidateQueries({ queryKey: ['admin-payouts-analytics'] })}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {analyticsData?.topRestaurants.map((rest) => {
                    const netShare = rest.totalRevenue - rest.commissionEarned;
                    return (
                      <div key={rest.restaurantId} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{rest.name}</p>
                          <p className="text-xs text-muted-foreground">Orders: {rest.totalOrders} · Total Vol: ₹{rest.totalRevenue.toLocaleString()}</p>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-bold text-sm text-green-600">₹{netShare.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">Comm: -₹{rest.commissionEarned.toLocaleString()}</p>
                          </div>
                          
                          <button
                            onClick={() => handleRecordPayout(rest.name, rest.totalRevenue, rest.commissionEarned)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg font-semibold text-xs transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Pay Out
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!analyticsData?.topRestaurants || analyticsData.topRestaurants.length === 0) && (
                    <p className="text-muted-foreground text-sm text-center py-6">No restaurant sales recorded.</p>
                  )}
                </div>
              )}
            </div>

            {/* Payout History */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-display font-semibold text-lg">Payout Logs</h2>
              
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {recordedPayouts.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-xs">{log.restaurantName}</p>
                        <p className="text-[10px] text-muted-foreground">{log.date} · {log.id}</p>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-2">
                      <span className="font-bold text-xs">₹{log.amount}</span>
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
