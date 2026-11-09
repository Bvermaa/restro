'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings, Store, Users, BarChart3, LayoutDashboard, LogOut, Menu,
  Shield, CreditCard, Ticket, HandCoins, Plus, Trash2, ToggleLeft, ToggleRight, Sparkles, RefreshCw, Star
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

type Coupon = {
  id: string;
  code: string;
  type: 'FLAT' | 'PERCENT';
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
};

export function AdminCouponsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: couponData, isLoading } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const res = await api.get('/admin/coupons');
      return res.data.data as { coupons: Coupon[] };
    },
  });

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    type: 'PERCENT' as 'PERCENT' | 'FLAT',
    value: '',
    minOrderAmount: '',
    maxDiscount: '',
    maxUses: '',
    expiresAt: '',
  });

  const createCouponMutation = useMutation({
    mutationFn: async () => {
      await api.post('/admin/coupons', {
        code: newCoupon.code.toUpperCase(),
        type: newCoupon.type,
        value: parseFloat(newCoupon.value),
        minOrderAmount: parseFloat(newCoupon.minOrderAmount || '0'),
        maxDiscount: newCoupon.maxDiscount ? parseFloat(newCoupon.maxDiscount) : undefined,
        maxUses: newCoupon.maxUses ? parseInt(newCoupon.maxUses, 10) : undefined,
        expiresAt: newCoupon.expiresAt || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Global coupon created!');
      setNewCoupon({
        code: '',
        type: 'PERCENT',
        value: '',
        minOrderAmount: '',
        maxDiscount: '',
        maxUses: '',
        expiresAt: '',
      });
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: () => toast.error('Failed to create coupon'),
  });

  const toggleCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/coupons/${id}/toggle`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: () => toast.error('Failed to toggle coupon status'),
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/coupons/${id}`);
    },
    onSuccess: () => {
      toast.success('Coupon deleted');
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: () => toast.error('Failed to delete coupon'),
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
            <h1 className="font-display font-bold text-xl">Global Coupons</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            
            {/* Coupon List */}
            <div className="xl:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-lg">Active Platform Promotions</h2>
                <button 
                  onClick={() => qc.invalidateQueries({ queryKey: ['admin-coupons'] })}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-card border border-border rounded-xl h-24 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4">
                  {couponData?.coupons.map((coupon) => (
                    <motion.div
                      key={coupon.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center text-orange-600">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold font-display text-base tracking-wider bg-orange-50 dark:bg-orange-950/40 text-orange-600 border border-orange-200 dark:border-orange-900/60 px-2 py-0.5 rounded-lg text-sm">
                              {coupon.code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {coupon.type === 'PERCENT' ? `${coupon.value}% Off` : `₹${coupon.value} Off`}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                            <span>Min Order: ₹{coupon.minOrderAmount}</span>
                            {coupon.maxDiscount && <span>Max Discount: ₹{coupon.maxDiscount}</span>}
                            <span>Used: {coupon.usedCount} {coupon.maxUses ? `/ ${coupon.maxUses} times` : 'times'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => toggleCouponMutation.mutate(coupon.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            coupon.isActive 
                              ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20' 
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {coupon.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                        </button>
                        
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this coupon?')) {
                              deleteCouponMutation.mutate(coupon.id);
                            }
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {(!couponData?.coupons || couponData.coupons.length === 0) && (
                    <div className="border border-dashed border-border rounded-xl p-12 text-center">
                      <p className="text-muted-foreground text-sm">No global promo coupons configured.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Create Coupon form */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-display font-semibold text-lg">Create Global Coupon</h2>
              <p className="text-xs text-muted-foreground">Configure promotional discounts applied platform-wide across all restaurants.</p>
              
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Coupon Code</label>
                  <input
                    value={newCoupon.code}
                    onChange={(e) => setNewCoupon(c => ({ ...c, code: e.target.value }))}
                    placeholder="e.g. WELCOME50"
                    className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Discount Type</label>
                    <select
                      value={newCoupon.type}
                      onChange={(e) => setNewCoupon(c => ({ ...c, type: e.target.value as 'PERCENT' | 'FLAT' }))}
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="PERCENT">Percentage (%)</option>
                      <option value="FLAT">Flat Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Value</label>
                    <input
                      type="number"
                      value={newCoupon.value}
                      onChange={(e) => setNewCoupon(c => ({ ...c, value: e.target.value }))}
                      placeholder={newCoupon.type === 'PERCENT' ? 'e.g. 15' : 'e.g. 100'}
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Min Order (₹)</label>
                    <input
                      type="number"
                      value={newCoupon.minOrderAmount}
                      onChange={(e) => setNewCoupon(c => ({ ...c, minOrderAmount: e.target.value }))}
                      placeholder="e.g. 499"
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Max Discount (₹)</label>
                    <input
                      type="number"
                      value={newCoupon.maxDiscount}
                      onChange={(e) => setNewCoupon(c => ({ ...c, maxDiscount: e.target.value }))}
                      placeholder="e.g. 150"
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      disabled={newCoupon.type === 'FLAT'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Max Uses</label>
                    <input
                      type="number"
                      value={newCoupon.maxUses}
                      onChange={(e) => setNewCoupon(c => ({ ...c, maxUses: e.target.value }))}
                      placeholder="e.g. 500"
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5 uppercase">Expiry Date</label>
                    <input
                      type="date"
                      value={newCoupon.expiresAt}
                      onChange={(e) => setNewCoupon(c => ({ ...c, expiresAt: e.target.value }))}
                      className="w-full px-3.5 py-2 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <button
                  onClick={() => createCouponMutation.mutate()}
                  disabled={!newCoupon.code || !newCoupon.value || createCouponMutation.isPending}
                  className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/95 disabled:opacity-50 transition-colors shadow-md shadow-primary/10 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  {createCouponMutation.isPending ? 'Creating...' : 'Create Promo Coupon'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
