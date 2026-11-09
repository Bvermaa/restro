'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getSocketUrl } from '@/services/api';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  LogOut,
  Utensils,
  ShoppingBag,
  User,
  Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playKitchenOrderSound, processRealTimeEvent, requestDesktopNotificationPermission, sendDesktopNotification } from '@/utils/audio';

interface KitchenOrderItem {
  id: string;
  quantity: number;
  price: number;
  notes?: string | null;
  customizations?: any;
  menuItem: {
    id: string;
    name: string;
    image?: string | null;
  };
}

interface KitchenOrder {
  id: string;
  orderNumber?: number | string;
  status: 'CONFIRMED' | 'PREPARING' | 'BAKING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  orderType?: string;
  total: number;
  notes?: string | null;
  createdAt: string;
  table?: { id: string; tableNumber: number } | null;
  user?: { name: string; phone?: string | null } | null;
  items: KitchenOrderItem[];
}

export default function KitchenDashboardPage() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED'>('ALL');
  const [activeNewOrderAlert, setActiveNewOrderAlert] = useState<any | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    setMounted(true);
    requestDesktopNotificationPermission();
  }, []);

  useEffect(() => {
    if (mounted) {
      if (!isAuthenticated || !user) {
        router.push('/login');
      } else if (user.role !== 'KITCHEN' && user.role !== 'RESTAURANT_OWNER' && user.role !== 'SUPER_ADMIN') {
        router.push('/');
      }
    }
  }, [mounted, user, isAuthenticated, router]);

  // Fetch kitchen orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['kitchen-orders'],
    queryFn: async () => {
      const res = await api.get('/kitchen/orders');
      return res.data.data as { orders: KitchenOrder[]; restaurantId: string };
    },
    enabled: !!user && (user.role === 'KITCHEN' || user.role === 'RESTAURANT_OWNER' || user.role === 'SUPER_ADMIN'),
    refetchInterval: 30000, // 30s background fallback polling without page flicker
  });

  const orders = ordersData?.orders ?? [];
  const targetRestId = (user as any)?.restaurantId || ordersData?.restaurantId;

  const processedEventsRef = useRef<Map<string, number>>(new Map());

  // Socket.io Real-Time Connection
  useEffect(() => {
    if (!targetRestId) return;

    const socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    const joinRestaurant = () => {
      socket.emit('join:restaurant', targetRestId);
    };

    if (socket.connected) {
      joinRestaurant();
    }

    socket.on('connect', joinRestaurant);

    const handleNewOrder = (order?: any) => {
      const orderId = order?.id || order?.orderId || 'NEW';
      const eventKey = `kitchen_order_${orderId}`;
      const now = Date.now();
      if (processedEventsRef.current.has(eventKey) && now - (processedEventsRef.current.get(eventKey) || 0) < 4000) {
        return;
      }
      processedEventsRef.current.set(eventKey, now);

      const orderIdShort = orderId !== 'NEW' ? String(orderId).slice(-8).toUpperCase() : 'NEW';
      const itemsLabel = order?.items?.map((i: any) => `${i.menuItem?.name || i.name || 'Item'} × ${i.quantity}`).join(', ') || 'New items in kitchen';
      const locationLabel = order?.table?.tableNumber || order?.tableNumber ? `Table ${order?.table?.tableNumber || order?.tableNumber}` : 'Dine-In / Delivery';
      const totalLabel = order?.total ? `₹${Number(order.total).toFixed(2)}` : '';

      if (soundEnabledRef.current) {
        processRealTimeEvent(
          'new_order',
          undefined,
          {
            title: `👨‍🍳 ORDER CONFIRMED BY OWNER #${orderIdShort}`,
            body: `${locationLabel} ${totalLabel ? `• ${totalLabel}` : ''}\nItems: ${itemsLabel}`,
            tag: `order-${orderIdShort}`,
          },
          'kitchen'
        );
      } else {
        sendDesktopNotification(`👨‍🍳 ORDER CONFIRMED BY OWNER #${orderIdShort}`, {
          body: `${locationLabel} ${totalLabel ? `• ${totalLabel}` : ''}\nItems: ${itemsLabel}`,
          tag: `order-${orderIdShort}`,
        });
      }

      toast.success(`👨‍🍳 Order #${orderIdShort} Confirmed by Owner!`, {
        id: `kitchen_order_toast_${orderIdShort}`,
        description: `${locationLabel} • ${itemsLabel}`,
        duration: 8000,
        icon: '👨‍🍳',
      });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    };

    const handleOrderUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    };

    socket.on('order:new', handleNewOrder);
    socket.on('new_order', handleNewOrder);
    socket.on('kitchen:new_order', handleNewOrder);
    socket.on('order:status_updated', handleOrderUpdated);
    socket.on('kitchen:order_updated', handleOrderUpdated);
    socket.on('order_status_changed', handleOrderUpdated);
    socket.on('order_cancelled', handleOrderUpdated);
    socket.on('order_deleted', handleOrderUpdated);
    socket.on('driver_assigned', handleOrderUpdated);

    return () => {
      socket.disconnect();
    };
  }, [targetRestId, queryClient]);

  // Status update handler
  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    try {
      await api.patch(`/kitchen/orders/${orderId}/status`, { status: nextStatus });
      toast.success(`Order status updated to ${nextStatus}`);
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update order status');
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getElapsedTime = (createdAt?: string) => {
    if (!createdAt) return '0 mins';
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return '0 mins';
    const diff = Math.max(0, Math.floor((Date.now() - createdTime) / 1000 / 60));
    if (diff < 1) return 'Just now';
    if (diff >= 1440) return `${Math.floor(diff / 60)}h`;
    if (diff >= 60) return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    return `${diff} mins`;
  };

  const getTimerBadgeStyle = (createdAt?: string) => {
    if (!createdAt) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    const diff = Math.max(0, Math.floor((Date.now() - createdTime) / 1000 / 60));
    if (diff >= 20) return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
    if (diff >= 10) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  };

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
          <p className="text-base sm:text-lg font-semibold text-slate-300">Loading Kitchen Display System (KDS)...</p>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const confirmedOrders = orders.filter((o) => o.status === 'CONFIRMED');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING' || o.status === 'BAKING');
  const readyOrders = orders.filter((o) => o.status === 'READY');
  const completedTodayOrders = orders.filter((o) => o.status === 'DELIVERED');

  const filteredOrders = activeFilter === 'ALL'
    ? activeOrders
    : orders.filter((o) => {
        if (activeFilter === 'CONFIRMED') return o.status === 'CONFIRMED';
        if (activeFilter === 'PREPARING') return o.status === 'PREPARING' || o.status === 'BAKING';
        if (activeFilter === 'READY') return o.status === 'READY';
        if (activeFilter === 'DELIVERED') return o.status === 'DELIVERED';
        return true;
      });

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-orange-500/30">
      {/* Top KDS Navigation Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-2.5 sm:px-6 py-2 sm:py-4 flex items-center justify-between gap-2 shadow-xl sticky top-0 z-30 max-w-full">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="p-1.5 sm:p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl sm:rounded-2xl shadow-lg shadow-orange-500/20 flex-shrink-0">
            <ChefHat className="w-4 h-4 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-xl font-black tracking-tight text-white flex items-center gap-1 sm:gap-2 truncate">
              <span className="sm:hidden">KDS MONITOR</span>
              <span className="hidden sm:inline">KITCHEN DISPLAY SYSTEM</span>
              <span className="text-[9px] sm:text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 sm:px-2.5 py-0.5 rounded-full font-bold uppercase flex-shrink-0">
                LIVE
              </span>
            </h1>
            <p className="hidden sm:block text-[10px] sm:text-xs text-slate-400 font-medium truncate">
              Real-time Order Queue & Preparation Control
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
          {/* Quick Filters - Desktop */}
          <div className="hidden lg:flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'ALL' ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Queue ({activeOrders.length})
            </button>
            <button
              onClick={() => setActiveFilter('CONFIRMED')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'CONFIRMED' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              New ({confirmedOrders.length})
            </button>
            <button
              onClick={() => setActiveFilter('PREPARING')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'PREPARING' ? 'bg-blue-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Preparing ({preparingOrders.length})
            </button>
            <button
              onClick={() => setActiveFilter('READY')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'READY' ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ready ({readyOrders.length})
            </button>
            <button
              onClick={() => setActiveFilter('DELIVERED')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'DELIVERED' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Served Today ({completedTodayOrders.length})
            </button>
          </div>

          <button
            onClick={() => refetch()}
            className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg sm:rounded-xl transition-all border border-slate-700 active:scale-95"
            title="Refresh Orders"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all border active:scale-95 flex items-center gap-1.5 text-xs font-bold ${
              soundEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Toggle Sound Alerts"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" /> : <VolumeX className="w-3.5 h-3.5 sm:w-5 sm:h-5" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Audio ON' : 'Audio OFF'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg sm:rounded-xl transition-all border border-slate-700 active:scale-95"
            title="Fullscreen Monitor View"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />}
          </button>

          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="p-1.5 sm:p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg sm:rounded-xl transition-all border border-red-500/30 font-bold text-xs flex items-center gap-1.5"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Mobile Quick Filter Tabs Bar */}
      <div className="lg:hidden bg-slate-900/95 border-b border-slate-800 px-2 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar sticky top-[43px] sm:top-[65px] z-20 backdrop-blur-md">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-all ${
            activeFilter === 'ALL' ? 'bg-orange-500 text-white shadow' : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          Active ({activeOrders.length})
        </button>
        <button
          onClick={() => setActiveFilter('CONFIRMED')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-all ${
            activeFilter === 'CONFIRMED' ? 'bg-amber-500 text-white shadow' : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          New ({confirmedOrders.length})
        </button>
        <button
          onClick={() => setActiveFilter('PREPARING')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-all ${
            activeFilter === 'PREPARING' ? 'bg-blue-500 text-white shadow' : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          Preparing ({preparingOrders.length})
        </button>
        <button
          onClick={() => setActiveFilter('READY')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-all ${
            activeFilter === 'READY' ? 'bg-emerald-500 text-white shadow' : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          Ready ({readyOrders.length})
        </button>
        <button
          onClick={() => setActiveFilter('DELIVERED')}
          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold whitespace-nowrap transition-all ${
            activeFilter === 'DELIVERED' ? 'bg-purple-600 text-white shadow' : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          Served ({completedTodayOrders.length})
        </button>
      </div>

      {/* Main Kanban Grid */}
      <main className="flex-1 p-2 sm:p-6 w-full max-w-full overflow-x-hidden">
        {filteredOrders.length === 0 ? (
          <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center p-6 sm:p-8 border-2 border-dashed border-slate-800 rounded-2xl sm:rounded-3xl bg-slate-900/40">
            <div className="p-4 sm:p-6 bg-slate-900 rounded-full border border-slate-800 text-slate-600 mb-4">
              <ChefHat className="w-10 h-10 sm:w-16 sm:h-16" />
            </div>
            <h3 className="text-lg sm:text-2xl font-black text-slate-300">Kitchen Queue Clean! 🎉</h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-2">
              There are currently no active confirmed orders waiting in the kitchen. New orders will pop up automatically with sound alerts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            <AnimatePresence>
              {filteredOrders.map((order) => {
                const orderIdShort = order.id.slice(-6).toUpperCase();
                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`w-full min-w-0 max-w-full rounded-xl sm:rounded-3xl border shadow-lg sm:shadow-2xl overflow-hidden flex flex-col bg-slate-900 transition-all ${
                      order.status === 'CONFIRMED'
                        ? 'border-amber-500/50 shadow-amber-500/10'
                        : order.status === 'PREPARING' || order.status === 'BAKING'
                        ? 'border-blue-500/50 shadow-blue-500/10'
                        : 'border-emerald-500/50 shadow-emerald-500/10'
                    }`}
                  >
                    {/* Ticket Header */}
                    <div
                      className={`p-2.5 sm:p-4 flex flex-col gap-1.5 border-b ${
                        order.status === 'CONFIRMED'
                          ? 'bg-amber-500/10 border-amber-500/20'
                          : order.status === 'PREPARING' || order.status === 'BAKING'
                          ? 'bg-blue-500/10 border-blue-500/20'
                          : 'bg-emerald-500/10 border-emerald-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 w-full">
                        <span className="text-sm sm:text-lg font-black tracking-wider text-white">
                          #{orderIdShort}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] sm:text-xs font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-md border flex items-center gap-0.5 ${getTimerBadgeStyle(
                              order.createdAt
                            )}`}
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            <span>{getElapsedTime(order.createdAt)}</span>
                          </span>
                          <span
                            className={`text-[9px] sm:text-xs font-black uppercase px-2 py-0.5 rounded-lg border shrink-0 ${
                              order.status === 'CONFIRMED'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                : order.status === 'PREPARING' || order.status === 'BAKING'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {order.table?.tableNumber ? (
                          <span className="bg-orange-500 text-white font-extrabold text-[10px] sm:text-xs px-2 py-0.5 rounded-md truncate">
                            🍽️ Table {order.table.tableNumber}
                          </span>
                        ) : (
                          <span className="bg-blue-600 text-white font-extrabold text-[10px] sm:text-xs px-2 py-0.5 rounded-md truncate">
                            🍽️ Dine-In Order
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                    </div>

                    {/* Customer Info (if available) */}
                    {order.user?.name && (
                      <div className="px-2.5 sm:px-4 py-1 bg-slate-950/60 border-b border-slate-800 text-[10px] sm:text-xs text-slate-400 flex flex-wrap items-center justify-between gap-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-300 truncate">
                          <User className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{order.user.name}</span>
                        </span>
                        {order.user.phone && (
                          <span className="flex items-center gap-1 font-mono text-[9px] sm:text-xs text-slate-400">
                            <Phone className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                            {order.user.phone}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Items List */}
                    <div className="p-2.5 sm:p-4 flex-1 space-y-2 sm:space-y-3 overflow-y-auto max-h-[260px] sm:max-h-[350px]">
                      {order.items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="bg-slate-950/80 p-2 sm:p-3 rounded-xl border border-slate-800/80 flex items-start gap-2 min-w-0"
                        >
                          <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-black text-xs sm:text-sm shrink-0">
                            {item.quantity}x
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-xs sm:text-sm text-slate-100 leading-snug break-words">
                              {item.menuItem?.name || 'Menu Item'}
                            </h4>
                            
                            {/* Item Notes / Customizations */}
                            {item.notes && (
                              <p className="text-[10px] sm:text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 p-1.5 rounded-lg mt-1 break-words">
                                ⚠️ Note: {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action Button Footer */}
                    <div className="p-2.5 sm:p-4 bg-slate-950 border-t border-slate-800 mt-auto">
                      {order.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                          className="w-full py-2 sm:py-3 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-98"
                        >
                          <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> Start Preparing
                        </button>
                      )}

                      {(order.status === 'PREPARING' || order.status === 'BAKING') && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'READY')}
                          className="w-full py-2 sm:py-3 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-98"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> Mark Order Ready
                        </button>
                      )}

                      {order.status === 'READY' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'DELIVERED')}
                          className="w-full py-2 sm:py-3 px-3 bg-gradient-to-r from-slate-800 to-slate-700 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-black text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-98"
                        >
                          <Utensils className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> Complete / Served
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function Loader2Icon(props: any) {
  return <RefreshCw {...props} />;
}

