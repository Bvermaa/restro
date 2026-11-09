'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Store, Search, CheckCircle2, XCircle, Clock, Filter,
  LayoutDashboard, Users, BarChart3, Settings, LogOut,
  Menu, Shield, ChevronRight, Eye, AlertTriangle, RefreshCw,
  Plus, X, Loader2, CreditCard, Ticket, HandCoins, Star, Trash2, Pencil,
  SlidersHorizontal
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminRestaurantDetailModal } from '@/components/admin/AdminRestaurantDetailModal';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
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

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  cuisineType?: string | null;
  city: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isApproved: boolean;
  isSuspended: boolean;
  isOpen: boolean;
  platformType?: 'RESTAURANT' | 'HOTEL' | 'DUAL' | string;
  maxLogins?: number;
  createdAt: string;
  owner: { name: string; email: string; maxLogins?: number };
  subscription?: { id: string; isActive: boolean; plan?: { name: string; price: number } } | null;
  _count?: { orders: number };
};

const STATUS_FILTERS = ['all', 'pending', 'approved', 'suspended'];

export function AdminRestaurantsPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(1);
  const [selectedManageRestaurantId, setSelectedManageRestaurantId] = useState<string | null>(null);

  // Create Restaurant State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createCuisine, setCreateCuisine] = useState('');
  const [createCity, setCreateCity] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createPlatformType, setCreatePlatformType] = useState<'RESTAURANT' | 'HOTEL' | 'DUAL'>('RESTAURANT');
  const [createMaxLogins, setCreateMaxLogins] = useState('1');
  const [createOwnerName, setCreateOwnerName] = useState('');
  const [createOwnerEmail, setCreateOwnerEmail] = useState('');
  const [createOwnerPhone, setCreateOwnerPhone] = useState('');
  const [createOwnerPassword, setCreateOwnerPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Restaurant State
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editCuisine, setEditCuisine] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPlatformType, setEditPlatformType] = useState<'RESTAURANT' | 'HOTEL' | 'DUAL'>('RESTAURANT');
  const [editMaxLogins, setEditMaxLogins] = useState('1');
  const [editOwnerEmail, setEditOwnerEmail] = useState('');
  const [editOwnerPassword, setEditOwnerPassword] = useState('');
  const [editIsApproved, setEditIsApproved] = useState(false);
  const [editIsSuspended, setEditIsSuspended] = useState(false);
  const [editIsOpen, setEditIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleOpenEditModal = (r: Restaurant) => {
    setEditingRestaurant(r);
    setEditName(r.name || '');
    setEditSlug(r.slug || '');
    setEditCuisine(r.cuisineType || '');
    setEditCity(r.city || '');
    setEditPhone(r.phone || '');
    setEditEmail(r.email || '');
    setEditAddress(r.address || '');
    setEditPlatformType(((r as any).platformType as any) || 'RESTAURANT');
    setEditMaxLogins(String((r as any).maxLogins || r.owner?.maxLogins || 1));
    setEditOwnerEmail(r.owner?.email || '');
    setEditOwnerPassword('');
    setEditIsApproved(r.isApproved ?? false);
    setEditIsSuspended(r.isSuspended ?? false);
    setEditIsOpen(r.isOpen ?? false);
  };

  const handleUpdateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRestaurant) return;
    if (!editName) {
      toast.error('Restaurant Name is required.');
      return;
    }
    setUpdating(true);
    try {
      await api.patch(`/admin/restaurants/${editingRestaurant.id}`, {
        name: editName,
        slug: editSlug || undefined,
        cuisineType: editCuisine || undefined,
        city: editCity || undefined,
        phone: editPhone || undefined,
        email: editEmail || undefined,
        address: editAddress || undefined,
        platformType: editPlatformType,
        maxLogins: parseInt(editMaxLogins, 10) || 1,
        ownerEmail: editOwnerEmail || undefined,
        ownerPassword: editOwnerPassword || undefined,
        isApproved: editIsApproved,
        isSuspended: editIsSuspended,
        isOpen: editIsOpen,
      });
      toast.success('Restaurant & owner credentials updated successfully! Email notification dispatched. 🎉');
      setEditingRestaurant(null);
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to update restaurant';
      toast.error(errMsg);
    } finally {
      setUpdating(false);
    }
  };


  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createOwnerName || !createOwnerEmail) {
      toast.error('Name, Owner Name, and Owner Email are required.');
      return;
    }
    setCreating(true);
    try {
      await api.post('/admin/restaurants', {
        name: createName,
        slug: createSlug || undefined,
        cuisineType: createCuisine || undefined,
        city: createCity || undefined,
        phone: createPhone || undefined,
        address: createAddress || undefined,
        platformType: createPlatformType,
        maxLogins: parseInt(createMaxLogins, 10) || 1,
        ownerName: createOwnerName,
        ownerEmail: createOwnerEmail,
        ownerPhone: createOwnerPhone || undefined,
        ownerPassword: createOwnerPassword || undefined,
      });
      toast.success('Restaurant created! Email sent to owner with details & credentials. 🎉');
      setShowCreateModal(false);
      // Reset form
      setCreateName('');
      setCreateSlug('');
      setCreateCuisine('');
      setCreateCity('');
      setCreatePhone('');
      setCreateAddress('');
      setCreatePlatformType('RESTAURANT');
      setCreateMaxLogins('1');
      setCreateOwnerName('');
      setCreateOwnerEmail('');
      setCreateOwnerPhone('');
      setCreateOwnerPassword('');
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to create restaurant';
      toast.error(errMsg);
    } finally {
      setCreating(false);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-restaurants', status, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        ...(status !== 'all' && { status }),
        ...(search && { search }),
      });
      const res = await api.get(`/admin/restaurants?${params}`);
      return {
        restaurants: res.data.data.restaurants,
        pagination: res.data.pagination,
      } as {
        restaurants: Restaurant[];
        pagination: { total: number; page: number; totalPages: number };
      };
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      await api.patch(`/admin/restaurants/${id}/approve`, { isApproved: approve });
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? 'Restaurant approved!' : 'Restaurant rejected');
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
    },
    onError: () => toast.error('Action failed'),
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      await api.patch(`/admin/restaurants/${id}/suspend`, { isSuspended: suspend });
    },
    onSuccess: (_, { suspend }) => {
      toast.success(suspend ? 'Restaurant suspended' : 'Restaurant reactivated');
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
    },
    onError: () => toast.error('Action failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/restaurants/${id}`);
    },
    onSuccess: () => {
      toast.success('Restaurant deleted successfully');
      qc.invalidateQueries({ queryKey: ['admin-restaurants'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete restaurant');
    },
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally {
      logout(); router.push('/login');
    }
  };

  const getStatusBadge = (r: Restaurant) => {
    if (r.isSuspended) return { label: 'Suspended', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (!r.isApproved) return { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: 'Approved', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Restaurant Management</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold rounded-xl transition-all shadow-md shadow-primary/10 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Restaurant</span>
              <span className="sm:hidden">Add</span>
            </button>
            <button onClick={() => refetch()} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search restaurants..."
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 min-w-0 max-w-full">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => { setStatus(f); setPage(1); }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium capitalize whitespace-nowrap shrink-0 transition-all ${
                    status === f ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 skeleton rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Restaurant</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Owner</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Location</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Plan</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data?.restaurants.map((r) => {
                        const badge = getStatusBadge(r);
                        return (
                          <motion.tr
                            key={r.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedManageRestaurantId(r.id)}>
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/20 flex items-center justify-center">
                                  <Store className="w-4 h-4 text-orange-500" />
                                </div>
                                <div>
                                  <p className="font-semibold text-sm hover:text-primary transition-colors">{r.name}</p>
                                  <p className="text-xs text-muted-foreground">/{r.slug}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <Link
                                href={`/admin/users?search=${encodeURIComponent(r.owner.email)}`}
                                className="hover:underline block group"
                                title="View owner in Users tab"
                              >
                                <p className="text-sm font-semibold group-hover:text-primary transition-colors">{r.owner.name}</p>
                                <p className="text-xs text-muted-foreground">{r.owner.email}</p>
                              </Link>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <p className="text-sm text-muted-foreground">{r.city ?? '—'}</p>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  (r as any).platformType === 'DUAL'
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                    : (r as any).platformType === 'HOTEL'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                }`}>
                                  {(r as any).platformType === 'DUAL' ? '🌟 Dual (Rest + Hotel)' : (r as any).platformType === 'HOTEL' ? '🏨 Hotel Only' : '🍽️ Restaurant'}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {r.subscription?.plan?.name || 'Basic Plan'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                                  {badge.label}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${r.isOpen ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                  {r.isOpen ? '🟢 Open' : '🔴 Closed'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                                <button
                                  onClick={() => setSelectedManageRestaurantId(r.id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-xl transition-all text-xs font-bold shadow-sm"
                                  title="Full Restaurant Details, Feature Toggles & Subscription"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Manage</span>
                                </button>
                                {!r.isApproved && !r.isSuspended && (
                                  <>
                                    <button
                                      onClick={() => approveMutation.mutate({ id: r.id, approve: true })}
                                      className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                      title="Approve"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => approveMutation.mutate({ id: r.id, approve: false })}
                                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                      title="Reject"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {r.isApproved && (
                                  <button
                                    onClick={() => suspendMutation.mutate({ id: r.id, suspend: !r.isSuspended })}
                                    className={`p-1.5 rounded-lg transition-colors ${r.isSuspended ? 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20' : 'text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/20'}`}
                                    title={r.isSuspended ? "Reactivate" : "Suspend"}
                                  >
                                    {r.isSuspended ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                  </button>
                                )}
                                {r.isSuspended && (
                                  <button
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete "${r.name}"? This action will remove the restaurant.`)) {
                                        deleteMutation.mutate(r.id);
                                      }
                                    }}
                                    className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Delete Restaurant"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEditModal(r)}
                                  className="p-1.5 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                                  title="Edit Restaurant Details"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <Link
                                  href={`/r/${r.slug}`}
                                  target="_blank"
                                  className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                  title="View Menu"
                                >
                                  <Eye className="w-4 h-4" />
                                </Link>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {data?.restaurants.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                      <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No restaurants found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pagination */}
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Total: {data.pagination.total} restaurants
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm">
                      {page} / {data.pagination.totalPages}
                    </span>
                    <button
                      disabled={page === data.pagination.totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      {/* Create Restaurant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl relative my-8"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-display font-bold text-base text-foreground">Add New Restaurant</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRestaurant} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Restaurant Details</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Restaurant Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Burger Point"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Custom URL Slug (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. burger-point"
                      value={createSlug}
                      onChange={(e) => setCreateSlug(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Cuisine Type (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Fast Food, Italian"
                      value={createCuisine}
                      onChange={(e) => setCreateCuisine(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">City (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai"
                      value={createCity}
                      onChange={(e) => setCreateCity(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Phone (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={createPhone}
                      onChange={(e) => setCreatePhone(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Full Address (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 12, MG Road"
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                {/* Platform Mode & Dual Plan Selection */}
                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                    Select Platform Type & Capabilities *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCreatePlatformType('RESTAURANT')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        createPlatformType === 'RESTAURANT'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🍽️ Restaurant</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Tables, Waiter Bell, Dine-in Orders</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatePlatformType('HOTEL')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        createPlatformType === 'HOTEL'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🏨 Hotel Only</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Rooms, Room Service Calling, QR</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatePlatformType('DUAL')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        createPlatformType === 'DUAL'
                          ? 'border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-300 ring-2 ring-purple-500/40'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🌟 Dual Plan</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Both Restaurant + Hotel Access</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Owner Account & Credentials</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Owner Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajan Sharma"
                      value={createOwnerName}
                      onChange={(e) => setCreateOwnerName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Owner Email Address *</label>
                    <input
                      type="email"
                      placeholder="e.g. owner@example.com"
                      value={createOwnerEmail}
                      onChange={(e) => setCreateOwnerEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Phone (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543211"
                      value={createOwnerPhone}
                      onChange={(e) => setCreateOwnerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Password (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Owner@123456"
                      value={createOwnerPassword}
                      onChange={(e) => setCreateOwnerPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Max Concurrent Logins *</label>
                    <select
                      value={createMaxLogins}
                      onChange={(e) => setCreateMaxLogins(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      <option value="1">1 Active Device (Single Login)</option>
                      <option value="2">2 Concurrent Logins</option>
                      <option value="3">3 Concurrent Logins</option>
                      <option value="5">5 Concurrent Logins</option>
                      <option value="10">10 Concurrent Logins</option>
                    </select>
                  </div>
                </div>
                <div className="p-2.5 bg-primary/5 border border-primary/20 rounded-xl text-[11px] text-muted-foreground">
                  📧 <strong>Email Notification:</strong> An official welcome email containing the <strong>Restaurant Details</strong> (ID, Name, Slug, Platform Mode) and <strong>Owner Login Credentials</strong> (Login Email, Password, Max Devices: {createMaxLogins}) will be sent automatically to the owner's email address upon creation.
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl text-white bg-primary hover:bg-primary/95 text-xs font-semibold disabled:opacity-60 flex items-center gap-1.5 transition-all shadow-md shadow-primary/10"
                >
                  {creating && <Loader2 className="w-3 animate-spin" />}
                  Create Restaurant
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Restaurant Modal */}
      {editingRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl relative my-8"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-display font-bold text-base text-foreground">Edit Restaurant Details</h3>
                <p className="text-xs text-muted-foreground">ID: {editingRestaurant.id}</p>
              </div>
              <button
                onClick={() => setEditingRestaurant(null)}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRestaurant} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Basic Info</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Restaurant Name *</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">URL Slug</label>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Cuisine Type</label>
                    <input
                      type="text"
                      value={editCuisine}
                      onChange={(e) => setEditCuisine(e.target.value)}
                      placeholder="e.g. Fast Food, Italian"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">City</label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      placeholder="e.g. New Delhi"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Phone</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Contact Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Contact email"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Full Address</label>
                  <textarea
                    rows={2}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Restaurant full address..."
                    className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
                  />
                </div>

                {/* Platform Mode & Dual Plan Selection */}
                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                    Platform Type & Operational Mode *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditPlatformType('RESTAURANT')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        editPlatformType === 'RESTAURANT'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🍽️ Restaurant</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Tables, Waiter Bell</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditPlatformType('HOTEL')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        editPlatformType === 'HOTEL'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🏨 Hotel Only</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Rooms, Room Service</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditPlatformType('DUAL')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        editPlatformType === 'DUAL'
                          ? 'border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-300 ring-2 ring-purple-500/40'
                          : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">🌟 Dual Plan</div>
                      <p className="text-[10px] mt-0.5 opacity-80">Both Rest + Hotel</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Owner Account Credentials</h4>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Owner Login Email</label>
                    <input
                      type="email"
                      value={editOwnerEmail}
                      onChange={(e) => setEditOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">New Password</label>
                    <input
                      type="text"
                      value={editOwnerPassword}
                      onChange={(e) => setEditOwnerPassword(e.target.value)}
                      placeholder="Leave blank to keep"
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Max Concurrent Logins *</label>
                    <select
                      value={editMaxLogins}
                      onChange={(e) => setEditMaxLogins(e.target.value)}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                    >
                      <option value="1">1 Active Device (Single Login)</option>
                      <option value="2">2 Concurrent Logins</option>
                      <option value="3">3 Concurrent Logins</option>
                      <option value="5">5 Concurrent Logins</option>
                      <option value="10">10 Concurrent Logins</option>
                    </select>
                  </div>
                </div>
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-600 dark:text-amber-400">
                  📧 <strong>Credential Updates:</strong> Changing the owner&apos;s email, password, or allowed login limit ({editMaxLogins} max devices) will automatically update authentication policies and dispatch an official notification email to the owner.
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Status & Access Controls</h4>
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 p-2.5 bg-muted rounded-xl border border-border cursor-pointer hover:bg-muted/80">
                    <input
                      type="checkbox"
                      checked={editIsApproved}
                      onChange={(e) => setEditIsApproved(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs font-medium">Approved</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-muted rounded-xl border border-border cursor-pointer hover:bg-muted/80">
                    <input
                      type="checkbox"
                      checked={editIsSuspended}
                      onChange={(e) => setEditIsSuspended(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs font-medium text-rose-500">Suspended</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-muted rounded-xl border border-border cursor-pointer hover:bg-muted/80">
                    <input
                      type="checkbox"
                      checked={editIsOpen}
                      onChange={(e) => setEditIsOpen(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs font-medium text-emerald-500">Store Open</span>
                  </label>
                </div>
              </div>


              <div className="flex gap-2 justify-end border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingRestaurant(null)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2 rounded-xl text-white bg-primary hover:bg-primary/95 text-xs font-semibold disabled:opacity-60 flex items-center gap-1.5 transition-all shadow-md shadow-primary/10"
                >
                  {updating && <Loader2 className="w-3 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Full Details & Controls Modal */}
      <AdminRestaurantDetailModal
        restaurantId={selectedManageRestaurantId}
        isOpen={!!selectedManageRestaurantId}
        onClose={() => setSelectedManageRestaurantId(null)}
        onUpdated={() => qc.invalidateQueries({ queryKey: ['admin-restaurants'] })}
      />
    </main>
    </div>
  );
}
