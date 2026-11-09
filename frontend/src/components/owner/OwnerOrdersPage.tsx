'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ShoppingBag, UtensilsCrossed, LayoutDashboard, Tag, BarChart3, Settings, LogOut,
  Menu, Search, Clock, ChevronDown, RefreshCw, User, MapPin, Palette,
  Mail, Phone, CreditCard, Receipt, Check, Wallet, Banknote, Sparkles, Star, AlertTriangle, ChefHat, Trash2
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api, { getSocketUrl } from '@/services/api';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { WaiterBell } from '@/components/owner/WaiterBell';
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

const ORDER_STATUSES = ['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  CONFIRMED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PREPARING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  READY: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

type Order = {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  gstAmount: number;
  deliveryFee: number;
  packagingFee: number;
  discount: number;
  total: number;
  addressId: string | null;
  tableNumber: string | null;
  guestName: string | null;
  guestPhone: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  preparingAt: string | null;
  bakingAt: string | null;
  readyAt: string | null;
  onTheWayAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  user: { name: string; phone: string | null; email: string | null } | null;
  address: { flat: string; street: string; area: string; city: string; pincode: string } | null;
  items: Array<{ quantity: number; menuItem: { name: string }; subtotal: number; unitPrice: number; addOns?: any }>;
};

const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return 'Pending';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatAmount = (val: number | null | undefined) => {
  const num = Number(val) || 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

export function OwnerOrdersPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['owner-orders', statusFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '15', ...(statusFilter !== 'ALL' && { status: statusFilter }), ...(search && { search }) });
      const res = await api.get(`/owner/orders?${params}`);
      return res.data as { data: { orders: Order[] }; pagination: { total: number; totalPages: number } };
    },
    refetchInterval: 15000,
  });

  const restId = (user as any)?.restaurantId;

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
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, addOnStatus }: { id: string; status?: string; addOnStatus?: string }) => {
      await api.patch(`/owner/orders/${id}/status`, { status, addOnStatus });
    },
    onSuccess: () => {
      toast.success('Order status updated');
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: () => toast.error('Failed to update order status'),
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/owner/orders/${id}/payment`);
    },
    onSuccess: () => {
      toast.success('Payment marked as PAID');
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-analytics'] });
    },
    onError: () => toast.error('Failed to update payment status'),
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/owner/orders/${id}/payment-reject`);
    },
    onSuccess: () => {
      toast.warning('Customer notified: payment not received');
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-analytics'] });
    },
    onError: () => toast.error('Failed to send payment notification'),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/owner/orders/${id}`);
    },
    onSuccess: () => {
      toast.success('Order deleted successfully');
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: () => toast.error('Failed to delete order'),
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/owner/orders/history/clear?status=${statusFilter}`);
    },
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Order history cleared');
      qc.invalidateQueries({ queryKey: ['owner-orders'] });
      qc.invalidateQueries({ queryKey: ['owner-dashboard'] });
      qc.invalidateQueries({ queryKey: ['owner-recent-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: () => toast.error('Failed to clear order history'),
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Orders</h1>
            {data?.pagination.total !== undefined && (
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">({data.pagination.total} total)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
            <button onClick={() => refetch()} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search order ID or customer..." className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="flex gap-2 items-center overflow-x-auto no-scrollbar pb-1 min-w-0 max-w-full">
              {ORDER_STATUSES.map((s) => (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${statusFilter === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
                  {s}
                </button>
              ))}
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to clear order history for status "${statusFilter}"? This will delete these order records.`)) {
                    clearHistoryMutation.mutate();
                  }
                }}
                disabled={clearHistoryMutation.isPending || !data?.data.orders.length}
                className="flex items-center gap-1 px-3 py-2 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                title="Delete completed/cancelled order history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            </div>
          </div>

          {/* Orders */}
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
          ) : (
            <div className="space-y-3">
              {data?.data.orders.map((order) => (
                <motion.div key={order.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-sm">#{order.id.slice(-8).toUpperCase()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? ''}`}>{order.status}</span>
                        {order.tableNumber && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {order.tableNumber.toLowerCase().includes('room') || order.tableNumber.toLowerCase().includes('suite')
                              ? (order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`)
                              : (order.tableNumber.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`)}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          order.paymentMethod === 'RAZORPAY' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900/30' :
                          order.paymentMethod === 'WALLET' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900/30' :
                          order.paymentMethod === 'PAY_TO_WAITER' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900/30' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900/30'
                        }`}>
                          {order.paymentMethod === 'RAZORPAY' ? 'Online' : order.paymentMethod === 'WALLET' ? 'Wallet' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Pay on Counter'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {order.guestName ?? order.user?.name ?? 'Guest'} •
                        {' '}{order.items.slice(0,2).map(i => i.menuItem.name).join(', ')}
                        {order.items.length > 2 && ` +${order.items.length - 2} more`}
                      </p>
                    </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold">₹{formatAmount(order.total)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />
                          {formatTime(order.createdAt)}
                        </p>
                      </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete order #${order.id.slice(-8).toUpperCase()}?`)) {
                          deleteOrderMutation.mutate(order.id);
                        }
                      }}
                      disabled={deleteOrderMutation.isPending}
                      className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      title="Delete Order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`} />
                  </div>

                  {expandedOrder === order.id && (
                    <div className="px-5 pb-5 border-t border-border pt-4 bg-muted/10">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        
                        {/* Left Pane - Items and Billing Details (spans 2 columns on large screens) */}
                        <div className="lg:col-span-2 space-y-5">
                          
                          {/* Order Items Table */}
                          <div className="space-y-2">
                            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Order Items</p>
                            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 text-sm">
                                  <div className="flex-1">
                                    <span className="font-medium text-foreground">{item.menuItem.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                      ({item.quantity} × ₹{formatAmount(item.unitPrice || (item.subtotal / item.quantity))})
                                    </span>
                                    {item.addOns && Array.isArray(item.addOns) && item.addOns.length > 0 && (
                                      <div className="text-[11px] text-muted-foreground mt-0.5 ml-2">
                                        + {item.addOns.map((ao: any) => ao.name).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-semibold text-foreground">₹{formatAmount(item.subtotal)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Sub-grid: Customer info and Receipt Billing */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            
                            {/* Customer & Address Details */}
                            <div className="space-y-3 bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
                              <div>
                                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                                  <User className="w-3.5 h-3.5" /> Customer Details
                                </p>
                                <div className="space-y-2 text-sm">
                                  <p className="font-semibold text-foreground">
                                    {order.guestName ?? order.user?.name ?? 'Guest Customer'}
                                  </p>
                                  {(order.guestPhone || order.user?.phone) && (
                                    <p className="text-muted-foreground flex items-center gap-2">
                                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                      <a href={`tel:${order.guestPhone ?? order.user?.phone}`} className="hover:text-primary transition-colors">
                                        {order.guestPhone ?? order.user?.phone}
                                      </a>
                                    </p>
                                  )}
                                  {order.user?.email && (
                                    <p className="text-muted-foreground flex items-center gap-2 truncate">
                                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                                      <a href={`mailto:${order.user.email}`} className="hover:text-primary transition-colors truncate">
                                        {order.user.email}
                                      </a>
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="border-t border-border pt-3 mt-3">
                                {order.address ? (
                                  <div className="space-y-1">
                                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> Delivery Address
                                    </p>
                                    <p className="text-muted-foreground text-xs leading-relaxed">
                                      {order.address.flat}, {order.address.street}, {order.address.area}, {order.address.city} - {order.address.pincode}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Order Mode</p>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                      Dine-In {order.tableNumber ? `(Table ${order.tableNumber})` : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Billing details / Receipt Summary */}
                            <div className="space-y-3 bg-card border border-border p-4 rounded-xl">
                              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Receipt className="w-3.5 h-3.5" /> Receipt Summary
                              </p>
                              <div className="space-y-2 text-xs text-muted-foreground">
                                <div className="flex justify-between">
                                  <span>Subtotal</span>
                                  <span className="text-foreground font-medium">₹{formatAmount(order.subtotal)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>GST ({process.env.NEXT_PUBLIC_GST_RATE ?? '18'}%)</span>
                                  <span className="text-foreground font-medium">₹{formatAmount(order.gstAmount)}</span>
                                </div>
                                {order.deliveryFee > 0 && (
                                  <div className="flex justify-between">
                                    <span>Delivery Fee</span>
                                    <span className="text-foreground font-medium">₹{formatAmount(order.deliveryFee)}</span>
                                  </div>
                                )}
                                {order.packagingFee > 0 && (
                                  <div className="flex justify-between">
                                    <span>Packaging Fee</span>
                                    <span className="text-foreground font-medium">₹{formatAmount(order.packagingFee)}</span>
                                  </div>
                                )}
                                {order.discount > 0 && (
                                  <div className="flex justify-between text-green-600 dark:text-green-400 font-medium">
                                    <span>Discount</span>
                                    <span>-₹{formatAmount(order.discount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-foreground text-sm font-bold border-t border-border pt-2 mt-2">
                                  <span>Grand Total</span>
                                  <span className="text-primary text-base font-extrabold">₹{formatAmount(order.total)}</span>
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>

                        {/* Right Pane - Timeline & Payment Information & Actions */}
                        <div className="space-y-5">
                          
                          {/* Payment status, type and Action buttons */}
                          <div className="bg-card border border-border p-4 rounded-xl space-y-4">
                            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5" /> Payment Details
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              {/* Payment Method Badge */}
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                order.paymentMethod === 'RAZORPAY' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                                order.paymentMethod === 'WALLET' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                order.paymentMethod === 'PAY_TO_WAITER' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}>
                                {order.paymentMethod === 'RAZORPAY' ? <CreditCard className="w-3 h-3" /> :
                                 order.paymentMethod === 'WALLET' ? <Wallet className="w-3 h-3" /> :
                                 order.paymentMethod === 'PAY_TO_WAITER' ? <User className="w-3 h-3" /> :
                                 <Banknote className="w-3 h-3" />}
                                {order.paymentMethod === 'RAZORPAY' ? 'Pay Direct (Online)' : order.paymentMethod === 'WALLET' ? 'Wallet' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Pay on Counter'}
                              </span>
                              
                              {/* Payment Status Badge */}
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                order.paymentStatus === 'FAILED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                order.paymentStatus === 'REFUNDED' ? 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300' :
                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                              }`}>
                                {order.paymentStatus}
                              </span>
                            </div>

                            {/* Additional Payment Info / Action */}
                            <div className="pt-2 border-t border-border space-y-2">
                              {order.paymentStatus === 'PAID' ? (
                                <p className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                                  {order.paymentMethod === 'RAZORPAY' ? (
                                    <>✅ Paid Direct to Owner (Online)</>
                                  ) : order.paymentMethod === 'PAY_TO_WAITER' ? (
                                    <>💵 Paid to Waiter</>
                                  ) : (
                                    <>💵 Cash Received / Paid at Counter</>
                                  )}
                                </p>
                              ) : (
                                <>
                                  <button
                                    onClick={() => confirmPaymentMutation.mutate(order.id)}
                                    disabled={confirmPaymentMutation.isPending}
                                    className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    {confirmPaymentMutation.isPending 
                                      ? 'Confirming...' 
                                      : order.paymentMethod === 'RAZORPAY'
                                      ? 'Confirm Direct Online Payment Received'
                                      : order.paymentMethod === 'PAY_TO_WAITER' 
                                      ? 'Confirm Payment Paid to Waiter' 
                                      : 'Mark as Paid (Received Cash)'}
                                  </button>
                                  {/* Only show "not received" for direct online payment (RAZORPAY) */}
                                  {order.paymentMethod === 'RAZORPAY' && (
                                    <button
                                      onClick={() => rejectPaymentMutation.mutate(order.id)}
                                      disabled={rejectPaymentMutation.isPending}
                                      className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      {rejectPaymentMutation.isPending ? 'Notifying Customer...' : 'Payment Not Received — Notify Customer'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Add-on Order Journey Banner & Actions */}
                            {(order as any).addOnStatus && (
                              <div className={`rounded-xl p-3.5 space-y-2.5 my-2 border ${
                                (order as any).addOnStatus === 'CANCELLED'
                                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50'
                                  : 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50'
                              }`}>
                                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                                  <div className={`flex items-center gap-1.5 font-bold text-xs ${
                                    (order as any).addOnStatus === 'CANCELLED' ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'
                                  }`}>
                                    <Sparkles className="w-4 h-4 text-primary" />
                                    <span>⚡ Add-on Items Status: {(order as any).addOnStatus}</span>
                                  </div>
                                  {(order as any).lastAddOnAt && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      Added {new Date((order as any).lastAddOnAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>

                                {/* Customer Selected Payment Method for Add-ons */}
                                <div className="flex items-center justify-between text-xs bg-background/60 p-2 rounded-lg border border-border/40">
                                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                    <CreditCard className="w-3.5 h-3.5 text-primary" />
                                    <span>Payment Method:</span>
                                    <span className="text-primary font-bold">
                                      {order.paymentMethod === 'RAZORPAY' ? 'Pay Direct (Online)' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Pay on Counter'}
                                    </span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                                    order.paymentStatus === 'PAID' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : order.paymentStatus === 'FAILED' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                  }`}>
                                    {order.paymentStatus === 'PAID' ? 'PAID' : 'PAYMENT PENDING'}
                                  </span>
                                </div>

                                 {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (order as any).addOnStatus !== 'DELIVERED' && (order as any).addOnStatus !== 'CANCELLED' && (
                                   <div className="flex gap-2 flex-wrap pt-1">
                                     {(order as any).addOnStatus !== 'PREPARING' && (order as any).addOnStatus !== 'READY' && (order as any).addOnStatus !== 'DELIVERED' && (
                                       <button
                                         onClick={() => updateStatusMutation.mutate({ id: order.id, addOnStatus: 'PREPARING' })}
                                         disabled={updateStatusMutation.isPending}
                                         className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm flex items-center gap-1"
                                       >
                                         👨‍🍳 Mark Add-ons Preparing
                                       </button>
                                     )}
                                     {(order as any).addOnStatus !== 'READY' && (order as any).addOnStatus !== 'DELIVERED' && (
                                       <button
                                         onClick={() => updateStatusMutation.mutate({ id: order.id, addOnStatus: 'READY' })}
                                         disabled={updateStatusMutation.isPending}
                                         className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-sm flex items-center gap-1"
                                       >
                                         🍽️ Mark Add-ons Ready
                                       </button>
                                     )}
                                     {(order as any).addOnStatus !== 'DELIVERED' && (
                                       <button
                                         onClick={() => updateStatusMutation.mutate({ id: order.id, addOnStatus: 'DELIVERED' })}
                                         disabled={updateStatusMutation.isPending}
                                         className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center gap-1"
                                       >
                                         ✅ Mark Add-ons Served
                                       </button>
                                     )}
                                     <button
                                       onClick={() => updateStatusMutation.mutate({ id: order.id, addOnStatus: 'CANCELLED' })}
                                       disabled={updateStatusMutation.isPending}
                                       className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm flex items-center gap-1"
                                     >
                                       🚫 Cancel Add-ons
                                     </button>
                                   </div>
                                 )}
                              </div>
                            )}

                            {/* Action Buttons */}
                            {NEXT_STATUS[order.status]?.length > 0 && (
                              <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                                {NEXT_STATUS[order.status].map((next) => (
                                  <button key={next} onClick={() => updateStatusMutation.mutate({ id: order.id, status: next })}
                                    disabled={updateStatusMutation.isPending}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm ${
                                      next === 'CANCELLED' 
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200' 
                                        : 'bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow-md'
                                    }`}>
                                    {next !== 'CANCELLED' && <Check className="w-3 h-3" />}
                                    Mark as {next === 'DELIVERED' ? 'SERVED' : next}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Visual Progress Timeline */}
                          <div className="bg-card border border-border p-4 rounded-xl space-y-4">
                            <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" /> Lifecycle Timeline
                            </p>
                            
                            <div className="relative pl-3 space-y-4 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                              
                              {/* Placed Step */}
                              <div className="relative pl-5">
                                <span className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
                                <div className="text-xs">
                                  <p className="font-semibold text-foreground">Placed</p>
                                  <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.createdAt)}</p>
                                </div>
                              </div>

                              {/* Confirmed Step */}
                              <div className="relative pl-5">
                                <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full transition-all ${
                                  order.confirmedAt ? 'bg-primary ring-4 ring-primary/20' : 'bg-card border-2 border-muted-foreground/35'
                                }`} />
                                <div className="text-xs">
                                  <p className={`font-semibold ${order.confirmedAt ? 'text-foreground' : 'text-muted-foreground'}`}>Confirmed</p>
                                  <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.confirmedAt)}</p>
                                </div>
                              </div>

                              {/* Kitchen (Preparing / Baking) Step */}
                              <div className="relative pl-5">
                                <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full transition-all ${
                                  (order.preparingAt || order.bakingAt) ? 'bg-primary ring-4 ring-primary/20' : 'bg-card border-2 border-muted-foreground/35'
                                }`} />
                                <div className="text-xs">
                                  <p className={`font-semibold ${(order.preparingAt || order.bakingAt) ? 'text-foreground' : 'text-muted-foreground'}`}>Preparing</p>
                                  <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.preparingAt || order.bakingAt)}</p>
                                </div>
                              </div>

                              {/* Ready Step */}
                              <div className="relative pl-5">
                                <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full transition-all ${
                                  order.readyAt ? 'bg-primary ring-4 ring-primary/20' : 'bg-card border-2 border-muted-foreground/35'
                                }`} />
                                <div className="text-xs">
                                  <p className={`font-semibold ${order.readyAt ? 'text-foreground' : 'text-muted-foreground'}`}>Ready</p>
                                  <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.readyAt)}</p>
                                </div>
                              </div>

                              {/* Delivered / Served Step */}
                              {order.status !== 'CANCELLED' ? (
                                <div className="relative pl-5">
                                  <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full transition-all ${
                                    order.deliveredAt ? 'bg-green-500 ring-4 ring-green-500/20' : 'bg-card border-2 border-muted-foreground/35'
                                  }`} />
                                  <div className="text-xs">
                                    <p className={`font-semibold ${order.deliveredAt ? 'text-foreground' : 'text-muted-foreground'}`}>
                                      {order.addressId || order.address ? 'Delivered' : 'Served'}
                                    </p>
                                    <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.deliveredAt)}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative pl-5">
                                  <span className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20" />
                                  <div className="text-xs">
                                    <p className="font-semibold text-red-500">Cancelled</p>
                                    <p className="text-muted-foreground text-[10px] mt-0.5">{formatTime(order.cancelledAt)}</p>
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>

                        </div>

                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              {data?.data.orders.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No orders found</p>
                </div>
              )}
            </div>
          )}

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">Previous</button>
              <span className="text-sm">{page} / {data.pagination.totalPages}</span>
              <button disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors">Next</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
