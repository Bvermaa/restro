'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Search, Store, LayoutDashboard, BarChart3, Settings,
  LogOut, Menu, Shield, UserX, UserCheck, Trash2, Mail, Phone, Calendar, CreditCard, Ticket, HandCoins, Star
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

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isVerified: boolean;
  isSuspended: boolean;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  restaurantId?: string | null;
  createdAt: string;
  _count?: { orders: number };
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  RESTAURANT_OWNER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CUSTOMER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export function AdminUsersPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, role, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        ...(search && { search }),
        ...(role !== 'all' && { role }),
      });
      const res = await api.get(`/admin/users?${params}`);
      return {
        users: res.data.data.users,
        pagination: res.data.pagination,
      } as {
        users: User[];
        pagination: { total: number; page: number; totalPages: number };
      };
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend?: boolean }) => {
      await api.patch(`/admin/users/${id}/suspend`, { suspend });
    },
    onSuccess: () => {
      toast.success('User suspension status updated');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error('Failed to update user suspension'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/users/${id}`);
    },
    onSuccess: () => {
      toast.success('User deleted successfully and blocked from logging in.');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => toast.error('Failed to delete user'),
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally {
      logout(); router.push('/login');
    }
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
            <h1 className="font-display font-bold text-xl">User Management</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'CUSTOMER', 'RESTAURANT_OWNER'].map((r) => (
                <button key={r} onClick={() => { setRole(r); setPage(1); }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${role === r ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
                  {r === 'all' ? 'All' : r === 'CUSTOMER' ? 'Customers' : 'Owners'}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-16 skeleton rounded-2xl" />)}</div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Joined</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data?.users.map((u) => (
                        <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{u.name[0]?.toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{u.name}</p>
                                {u.restaurantName && (
                                  <Link
                                    href={`/admin/restaurants?search=${encodeURIComponent(u.restaurantSlug || u.restaurantName)}`}
                                    className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline font-medium"
                                  >
                                    <Store className="w-3 h-3" />
                                    {u.restaurantName}
                                  </Link>
                                )}
                                {u.isSuspended && <span className="text-xs text-red-500 block">Suspended</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</span>
                              {u.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[u.role] ?? ''}`}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end items-center gap-1.5">
                              {u.role !== 'SUPER_ADMIN' && (
                                <>
                                  <button
                                    onClick={() => suspendMutation.mutate({ id: u.id, suspend: !u.isSuspended })}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      u.isSuspended
                                        ? 'text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                                        : 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/20'
                                    }`}
                                    title={u.isSuspended ? 'Reactivate user' : 'Suspend user'}
                                  >
                                    {u.isSuspended ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                                  </button>

                                  {u.isSuspended && (
                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to delete user "${u.name}"? They will be permanently removed and blocked from logging in.`)) {
                                          deleteMutation.mutate(u.id);
                                        }
                                      }}
                                      className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                      title="Delete user"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                  {data?.users.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No users found</p>
                    </div>
                  )}
                </div>
              </div>
              {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total: {data.pagination.total} users</p>
                  <div className="flex gap-2">
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">Previous</button>
                    <span className="px-3 py-1.5 text-sm">{page} / {data.pagination.totalPages}</span>
                    <button disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
