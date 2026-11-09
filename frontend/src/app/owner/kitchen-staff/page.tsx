'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { toast } from 'sonner';
import {
  ChefHat,
  Plus,
  Trash2,
  ExternalLink,
  UserCheck,
  KeyRound,
  Mail,
  User,
  RefreshCw,
  X,
  ShieldCheck,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import { WaiterBell } from '@/components/owner/WaiterBell';

interface KitchenStaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function OwnerKitchenStaffPage() {
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fetch kitchen staff
  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['owner-kitchen-staff'],
    queryFn: async () => {
      const res = await api.get('/owner/kitchen-staff');
      return res.data.data.staff as KitchenStaffUser[];
    },
  });

  // Create staff mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/owner/kitchen-staff', { name, email, password });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Kitchen staff account created!');
      queryClient.invalidateQueries({ queryKey: ['owner-kitchen-staff'] });
      setIsCreateModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create kitchen account');
    },
  });

  // Delete staff mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/owner/kitchen-staff/${id}`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Kitchen staff account deleted');
      queryClient.invalidateQueries({ queryKey: ['owner-kitchen-staff'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to delete kitchen staff');
    },
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Kitchen Staff Accounts</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
            <Link
              href="/kitchen/dashboard"
              target="_blank"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open KDS</span>
            </Link>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Kitchen Staff</span>
              <span className="sm:hidden">Add Staff</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-6 rounded-3xl border border-border shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-orange-500/10 text-orange-500 rounded-2xl border border-orange-500/20">
                <ChefHat className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                  Kitchen Accounts Overview
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                  Create and manage kitchen display login credentials for chefs and line staff.
                </p>
              </div>
            </div>
          </div>

          {/* Staff List Table */}
          <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-orange-500" /> Active Kitchen Staff Accounts ({staffList.length})
              </h3>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2 font-medium">
                <RefreshCw className="w-5 h-5 animate-spin text-orange-500" /> Loading Kitchen Staff...
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-16 h-16 bg-muted text-muted-foreground rounded-full flex items-center justify-center mx-auto">
                  <ChefHat className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">No Kitchen Accounts Created Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Create dedicated accounts for your chefs so they can log in at <strong>/login</strong> and view incoming orders on the Kitchen Display System.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition-all inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create First Kitchen Account
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {staffList.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 font-bold flex items-center justify-center text-lg border border-orange-500/20">
                        {staff.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-foreground">{staff.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {staff.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold uppercase">
                        KITCHEN STAFF
                      </span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete kitchen staff account for ${staff.name}?`)) {
                            deleteMutation.mutate(staff.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                        title="Delete Account"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Create Kitchen Account */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/10 text-orange-500 rounded-2xl border border-orange-500/20">
                <ChefHat className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Add Kitchen Staff Account</h3>
                <p className="text-xs text-muted-foreground">Credentials for logging into Kitchen Display</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Staff Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Head Chef Mario"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Kitchen Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. kitchen@myrestaurant.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span>When logging in with this account at <strong>/login</strong>, user will be redirected directly to the Kitchen Dashboard.</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
