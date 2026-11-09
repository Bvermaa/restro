'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tag, UtensilsCrossed, LayoutDashboard, ShoppingBag, BarChart3, Settings, LogOut,
  Menu, Plus, Trash2, ToggleLeft, ToggleRight, X, Calendar, Percent, DollarSign, Hash, Palette, Star
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';

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

type Coupon = {
  id: string; code: string; type: 'PERCENT' | 'FLAT';
  value: number; minOrderAmount: number | null; maxDiscount: number | null;
  maxUses: number | null; usedCount: number; isActive: boolean;
  expiresAt: string | null; createdAt: string;
};

export function OwnerCouponsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: '', discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    discountValue: '', minOrderValue: '', maxDiscount: '', usageLimit: '', expiresAt: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['owner-coupons'],
    queryFn: async () => {
      const res = await api.get('/owner/coupons');
      return res.data.data.coupons as Coupon[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/owner/coupons', {
        code: form.code.toUpperCase(),
        type: form.discountType === 'PERCENTAGE' ? 'PERCENT' : 'FLAT',
        value: parseFloat(form.discountValue),
        minOrderAmount: form.minOrderValue ? parseFloat(form.minOrderValue) : 0,
        ...(form.maxDiscount && { maxDiscount: parseFloat(form.maxDiscount) }),
        ...(form.usageLimit && { maxUses: parseInt(form.usageLimit, 10) }),
        ...(form.expiresAt && { expiresAt: new Date(form.expiresAt).toISOString() }),
      });
    },
    onSuccess: () => {
      toast.success('Coupon created!');
      setShowCreate(false);
      setForm({ code: '', discountType: 'PERCENTAGE', discountValue: '', minOrderValue: '', maxDiscount: '', usageLimit: '', expiresAt: '' });
      qc.invalidateQueries({ queryKey: ['owner-coupons'] });
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to create coupon';
      toast.error(errMsg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => { await api.patch(`/owner/coupons/${id}/toggle`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-coupons'] }),
    onError: () => toast.error('Failed to toggle coupon'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/owner/coupons/${id}`); },
    onSuccess: () => { toast.success('Coupon deleted'); qc.invalidateQueries({ queryKey: ['owner-coupons'] }); },
    onError: () => toast.error('Failed to delete coupon'),
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-bold text-lg">Create Coupon</h2>
                <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-xl"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Coupon Code *</label>
                  <input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. FLAT20OFF" className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Discount Type</label>
                    <select value={form.discountType} onChange={(e) => setForm(f => ({ ...f, discountType: e.target.value as 'PERCENTAGE' | 'FIXED' }))}
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                      {form.discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount ₹'} *
                    </label>
                    <input type="number" value={form.discountValue} onChange={(e) => setForm(f => ({ ...f, discountValue: e.target.value }))}
                      placeholder={form.discountType === 'PERCENTAGE' ? '20' : '50'} min="0"
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Min Order (₹)</label>
                    <input type="number" value={form.minOrderValue} onChange={(e) => setForm(f => ({ ...f, minOrderValue: e.target.value }))}
                      placeholder="e.g. 200" min="0"
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {form.discountType === 'PERCENTAGE' && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Max Discount (₹)</label>
                      <input type="number" value={form.maxDiscount} onChange={(e) => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                        placeholder="e.g. 100" min="0"
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Usage Limit</label>
                    <input type="number" value={form.usageLimit} onChange={(e) => setForm(f => ({ ...f, usageLimit: e.target.value }))}
                      placeholder="Unlimited" min="1"
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Expires At</label>
                    <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => createMutation.mutate()} disabled={!form.code || !form.discountValue || createMutation.isPending}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors">
                    {createMutation.isPending ? 'Creating...' : 'Create Coupon'}
                  </button>
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 bg-muted rounded-xl font-medium text-sm hover:bg-muted/70 transition-colors">Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Coupons</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-xs sm:text-sm hover:bg-primary/90 transition-colors shrink-0">
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Create Coupon</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="h-44 skeleton rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.map((coupon) => (
                <motion.div key={coupon.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`bg-card border rounded-2xl p-4 transition-all ${coupon.isActive ? 'border-border' : 'border-dashed border-border opacity-60'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono font-bold text-lg tracking-wider text-primary">{coupon.code}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {coupon.type === 'PERCENT' ? `${coupon.value}% off` : `₹${coupon.value} off`}
                        {coupon.maxDiscount && ` (max ₹${coupon.maxDiscount})`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${coupon.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {coupon.minOrderAmount !== null && coupon.minOrderAmount > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3" />Min order: ₹{coupon.minOrderAmount}
                      </p>
                    )}
                    {coupon.maxUses && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Hash className="w-3 h-3" />{coupon.usedCount}/{coupon.maxUses} used
                      </p>
                    )}
                    {coupon.expiresAt && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />Expires: {new Date(coupon.expiresAt).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={() => toggleMutation.mutate(coupon.id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      {coupon.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                      {coupon.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteMutation.mutate(coupon.id)}
                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
              {data?.length === 0 && (
                <div className="col-span-3 text-center py-20 text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No coupons yet</p>
                  <p className="text-sm">Create your first coupon to attract customers</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
