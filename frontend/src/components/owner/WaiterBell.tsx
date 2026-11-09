'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import { useWaiterStore, WaiterCall, LiveOrderAlert } from '@/store/waiter.store';
import {
  Bell,
  BellRing,
  DollarSign,
  X,
  Check,
  Banknote,
  Sparkles,
  Megaphone,
  CheckCheck,
  Loader2,
  ShoppingBag,
  Volume2,
  VolumeX,
  ArrowRight,
  Clock,
  User,
  Utensils
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playNewOrderSound, playWaiterCallSound } from '@/utils/audio';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function WaiterBell() {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number; left?: number | string; width?: string }>({ top: 60, right: 16, left: 'auto', width: '384px' });

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    waiterCalls,
    newOrders,
    removeWaiterCall,
    removeNewOrder,
    clearAll,
    soundEnabled,
    setSoundEnabled
  } = useWaiterStore();

  const [showWaiterPanel, setShowWaiterPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'calls' | 'orders' | 'activity'>('calls');
  const queryClient = useQueryClient();

  const calculatePanelPos = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        setPanelPos({
          top: Math.min(rect.bottom + 8, window.innerHeight - 100),
          right: 8,
          left: 8,
          width: 'calc(100vw - 16px)'
        });
      } else {
        const right = Math.max(16, window.innerWidth - rect.right);
        const top = rect.bottom + 8;
        setPanelPos({ top, right, left: 'auto', width: '384px' });
      }
    }
  };

  const togglePanel = () => {
    if (!showWaiterPanel) {
      calculatePanelPos();
    }
    setShowWaiterPanel((v) => !v);
  };

  useEffect(() => {
    if (!showWaiterPanel) return;
    const handleResize = () => calculatePanelPos();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showWaiterPanel]);

  const { user } = useAuthStore();

  // 1. Fetch recent activity notifications
  const { data: notifData, isLoading: isLoadingNotifs } = useQuery({
    queryKey: ['owner-notifications'],
    queryFn: async () => {
      const res = await api.get('/profile/notifications');
      return res.data.data as { notifications: NotificationItem[]; unreadCount: number };
    },
    enabled: !!user,
    refetchInterval: 8000,
  });

  // 2. Fetch live recent orders
  const { data: recentOrdersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['owner-recent-orders-popover'],
    queryFn: async () => {
      const res = await api.get('/owner/orders?limit=10');
      return res.data.data.orders as any[];
    },
    enabled: showWaiterPanel,
    refetchInterval: 8000,
  });

  // Sync unread WAITER_CALL notifications from database into active waiter store
  useEffect(() => {
    if (!notifData?.notifications) return;
    const waiterNotifs = notifData.notifications.filter((n) => !n.isRead && n.type === 'WAITER_CALL');
    waiterNotifs.forEach((n) => {
      const match = n.title.match(/(?:Table|Room)\s+([A-Za-z0-9_-]+)/i) || n.message.match(/(?:Table|Room)\s+([A-Za-z0-9_-]+)/i);
      const isRoom = /Room/i.test(n.title) || /Room/i.test(n.message);
      let tableNumber = match ? match[1] : 'Unknown';
      if (isRoom && !tableNumber.toLowerCase().startsWith('room')) {
        tableNumber = `Room ${tableNumber}`;
      }
      const existing = waiterCalls.some((c) => c.tableNumber === tableNumber);
      const isHandled = useWaiterStore.getState().handledTables.includes(tableNumber);
      const purposeMatch = n.title.match(/\(([^)]+)\)/);
      const purpose = purposeMatch ? purposeMatch[1] : undefined;
      const customNote = n.message.includes('"') ? n.message.split('"')[1] : undefined;
      if (!existing && !isHandled) {
        // Sync into store for badge/list only — NEVER trigger modal popup on page load or refresh
        useWaiterStore.getState().addWaiterCall({
          tableNumber,
          calledAt: n.createdAt,
          type: 'default',
          purpose,
          customNote,
          restaurantId: (n as any).restaurantId,
        }, false);
      }
    });
  }, [notifData, waiterCalls]);

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/profile/notifications/read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-notifications'] });
    },
  });

  const notifications = notifData?.notifications ?? [];
  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  const dbRecentOrders = recentOrdersData ?? [];
  const pendingOrders = dbRecentOrders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
  const combinedOrdersCount = Math.max(newOrders.length, pendingOrders.length);

  const totalUnreadCount = waiterCalls.length + combinedOrdersCount + unreadNotifCount;

  const handleTestSound = () => {
    playWaiterCallSound();
    setTimeout(() => {
      playNewOrderSound();
    }, 400);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className="relative p-2.5 rounded-xl hover:bg-muted/80 transition-all duration-200 active:scale-95 group"
        title="Live Notifications, Waiter Calls & Orders"
      >
        {totalUnreadCount > 0 ? (
          <div className="relative">
            <BellRing className="w-5 h-5 text-primary animate-[ring_1.5s_ease-in-out_infinite]" />
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse border-2 border-background">
              {totalUnreadCount}
            </span>
          </div>
        ) : (
          <Bell className="w-5 h-5 text-foreground/80 group-hover:text-foreground transition-colors" />
        )}
      </button>

      {/* Notifications Drawer Popover - Portalled directly to body */}
      {showWaiterPanel && mounted && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[999999] pointer-events-auto">
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[1px]" onClick={() => setShowWaiterPanel(false)} />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{
                top: `${panelPos.top}px`,
                right: `${panelPos.right}px`,
                left: panelPos.left !== 'auto' ? `${panelPos.left}px` : undefined,
                width: panelPos.width || undefined,
              }}
              className="fixed z-[1000000] max-w-[calc(100vw-1rem)] bg-white dark:bg-zinc-950 border-2 border-border shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] rounded-2xl overflow-hidden flex flex-col opacity-100 text-foreground"
            >
              {/* Sound Controls Header */}
              <div className="px-3 sm:px-4 py-2.5 bg-slate-100 dark:bg-zinc-900 border-b border-border flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate">Live Notification Center</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playWaiterCallSound();
                    }}
                    className="p-1 px-1.5 rounded-lg border border-border bg-card hover:bg-accent text-[10px] font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Preview Waiter Call Desk Bell Sound"
                  >
                    <span>🛎️ Bell</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playNewOrderSound();
                    }}
                    className="p-1 px-1.5 rounded-lg border border-border bg-card hover:bg-accent text-[10px] font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Preview Incoming Order POS Chime Sound"
                  >
                    <span>🛍️ Order Chime</span>
                  </button>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`p-1 px-2 rounded-lg transition-colors border text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                      soundEnabled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                    title="Toggle Sound Alerts"
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5 shrink-0" /> : <VolumeX className="w-3.5 h-3.5 shrink-0" />}
                    <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
                  </button>
                </div>
              </div>

              {/* Tab Selector Header */}
              <div className="flex border-b border-border bg-slate-100/90 dark:bg-zinc-900 p-1 gap-1 min-w-0">
                <button
                  onClick={() => setActiveTab('calls')}
                  className={`flex-1 min-w-0 py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                    activeTab === 'calls'
                      ? 'bg-card text-primary shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span className="truncate">Calls</span>
                  {waiterCalls.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-orange-500 text-white rounded-full text-[10px] font-extrabold shrink-0">
                      {waiterCalls.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('orders')}
                  className={`flex-1 min-w-0 py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                    activeTab === 'orders'
                      ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">Orders</span>
                  {combinedOrdersCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px] font-extrabold shrink-0">
                      {combinedOrdersCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex-1 min-w-0 py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                    activeTab === 'activity'
                      ? 'bg-card text-blue-600 dark:text-blue-400 shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Megaphone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="truncate">Activity</span>
                  {unreadNotifCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-blue-500 text-white rounded-full text-[10px] font-extrabold shrink-0">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>
              </div>

              {/* TAB 1: Waiter Calls */}
              {activeTab === 'calls' && (
                <>
                  <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-orange-500/5 dark:bg-orange-950/20 gap-2 min-w-0">
                    <span className="text-[10px] sm:text-[11px] font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-wider truncate">
                      Live Table & Payment Requests
                    </span>
                    {waiterCalls.length > 0 && (
                      <button
                        onClick={() => {
                          const socket = useWaiterStore.getState().socket;
                          waiterCalls.forEach((call) => {
                            if (socket && call.restaurantId) {
                              socket.emit('waiter:dismiss', {
                                restaurantId: call.restaurantId,
                                tableNumber: call.tableNumber,
                              });
                            }
                          });
                          clearAll();
                        }}
                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {waiterCalls.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-xs space-y-2">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto opacity-40">
                          <Bell className="w-5 h-5" />
                        </div>
                        <p className="font-semibold">No active waiter calls</p>
                        <p className="text-[11px] opacity-70">Calls from dining tables will appear here live</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {waiterCalls.map((call) => {
                          const isPayOnCounter = call.paymentMethod === 'COD';
                          const isPayToWaiter = call.paymentMethod === 'PAY_TO_WAITER';
                          const isAddon = call.type === 'addons';
                          const isPayment = call.type === 'payment';

                          let containerClass = "bg-orange-50 dark:bg-zinc-900 border-orange-200 dark:border-orange-500/40";
                          let iconClass = "bg-orange-500 text-white";
                          let IconComponent = BellRing;

                          if (isAddon) {
                            containerClass = "bg-blue-50 dark:bg-zinc-900 border-blue-200 dark:border-blue-500/40";
                            iconClass = "bg-blue-500 text-white";
                            IconComponent = isPayOnCounter ? Banknote : isPayToWaiter ? DollarSign : Sparkles;
                          } else if (isPayment) {
                            containerClass = "bg-amber-50 dark:bg-zinc-900 border-amber-200 dark:border-amber-500/40";
                            iconClass = "bg-amber-500 text-white";
                            IconComponent = isPayOnCounter ? Banknote : DollarSign;
                          }

                          return (
                            <motion.div
                              key={call.id}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex items-center justify-between border rounded-xl p-3 shadow-xs ${containerClass}`}
                            >
                              <div
                                onClick={() => {
                                  useWaiterStore.getState().setActiveWaiterAlert(call);
                                  setShowWaiterPanel(false);
                                }}
                                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
                              >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${iconClass}`}>
                                  <IconComponent className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-black text-foreground">
                                      {call.tableNumber.toLowerCase().includes('room') || call.tableNumber.toLowerCase().includes('suite')
                                        ? (call.tableNumber.toLowerCase().startsWith('room') ? call.tableNumber : `Room ${call.tableNumber}`)
                                        : `Table ${call.tableNumber}`}
                                    </span>
                                    {call.purpose && (
                                      <span className="text-[9px] bg-primary/15 text-primary dark:text-primary-foreground dark:bg-primary/25 px-1.5 py-0.5 rounded-full font-bold border border-primary/20">
                                        {call.purpose}
                                      </span>
                                    )}
                                    {isPayment && (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                                        Payment
                                      </span>
                                    )}
                                    {isAddon && (
                                      <span className="text-[9px] bg-blue-500/20 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-bold border border-blue-500/30">
                                        Add-on
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                    {isPayment ? (
                                      <span className="font-bold text-amber-600 dark:text-amber-400">
                                        {isPayOnCounter ? 'Counter Cash' : 'Pay to Waiter'} {call.amount ? `(₹${call.amount.toFixed(0)})` : ''}
                                      </span>
                                    ) : isAddon ? (
                                      <span className="font-bold text-blue-600 dark:text-blue-400">
                                        {isPayOnCounter ? 'Add-on Counter Pay' : isPayToWaiter ? 'Add-on Waiter Pay' : 'Add-on Added'} {call.amount ? `(₹${call.amount.toFixed(0)})` : ''}
                                      </span>
                                    ) : call.purpose ? (
                                      <span className="font-medium text-foreground">
                                        {call.purpose}{call.customNote ? `: "${call.customNote}"` : ''}
                                      </span>
                                    ) : (
                                      <span>
                                        {call.tableNumber.toLowerCase().includes('room') || call.tableNumber.toLowerCase().includes('suite')
                                          ? 'Requested room service'
                                          : 'Requested waiter assistance'}
                                      </span>
                                    )}
                                  </p>
                                  <span className="text-[10px] text-muted-foreground/80 block mt-0.5 font-medium">
                                    {new Date(call.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <button
                                  onClick={() => {
                                    const socket = useWaiterStore.getState().socket;
                                    if (socket && call.restaurantId) {
                                      socket.emit('waiter:respond', {
                                        restaurantId: call.restaurantId,
                                        tableNumber: call.tableNumber,
                                      });
                                    }
                                    useWaiterStore.getState().dismissWaiterCall(call.id, call.tableNumber);
                                    markReadMutation.mutate();
                                  }}
                                  className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-xs"
                                  title="Send Waiter Now"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    const socket = useWaiterStore.getState().socket;
                                    if (socket && call.restaurantId) {
                                      socket.emit('waiter:dismiss', {
                                        restaurantId: call.restaurantId,
                                        tableNumber: call.tableNumber,
                                      });
                                    }
                                    useWaiterStore.getState().dismissWaiterCall(call.id, call.tableNumber);
                                    markReadMutation.mutate();
                                  }}
                                  className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                                  title="Dismiss Call"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 2: Incoming Orders */}
              {activeTab === 'orders' && (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-emerald-500/5 dark:bg-emerald-950/20">
                    <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      Live Incoming Orders
                    </span>
                    <Link
                      href="/owner/orders"
                      onClick={() => setShowWaiterPanel(false)}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      View All Orders <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {isLoadingOrders ? (
                      <div className="py-10 flex justify-center items-center">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : dbRecentOrders.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-xs space-y-2">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto opacity-40">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                        <p className="font-semibold">No recent orders</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dbRecentOrders.map((order: any) => {
                          const orderIdShort = order.id ? order.id.slice(-6).toUpperCase() : 'ORD';
                          const itemsSummary = order.items?.map((i: any) => `${i.menuItem?.name || i.name || 'Item'} x${i.quantity}`).join(', ');
                          const isPending = order.status === 'PENDING' || order.status === 'CONFIRMED';

                          return (
                            <div
                              key={order.id}
                              onClick={() => {
                                useWaiterStore.getState().setActiveNewOrderAlert(order);
                                setShowWaiterPanel(false);
                              }}
                              className={`p-3 rounded-xl border transition-all cursor-pointer hover:border-emerald-500 hover:scale-[1.01] ${
                                isPending
                                  ? 'bg-emerald-50 dark:bg-zinc-900 border-emerald-200 dark:border-emerald-500/40'
                                  : 'bg-white dark:bg-zinc-900 border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-foreground font-mono">#{orderIdShort}</span>
                                  {order.tableNumber && (
                                    <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full border border-primary/20">
                                      {order.tableNumber.toLowerCase().includes('room') || order.tableNumber.toLowerCase().includes('suite')
                                        ? (order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`)
                                        : `Table ${order.tableNumber}`}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  ₹{order.total ? Number(order.total).toFixed(0) : '0'}
                                </span>
                              </div>

                              <p className="text-[11px] text-muted-foreground line-clamp-1 italic mb-1.5">
                                {itemsSummary || 'Customer order items'}
                              </p>

                              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 opacity-60" /> {order.user?.name || order.guestName || 'Customer'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 opacity-60" /> {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 3: Activity Notifications */}
              {activeTab === 'activity' && (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-blue-500/5 dark:bg-blue-950/20">
                    <span className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      System Activity Logs
                    </span>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={() => markReadMutation.mutate()}
                        disabled={markReadMutation.isPending}
                        className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5"
                      >
                        <CheckCheck className="w-3 h-3" /> Read All
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
                    {isLoadingNotifs ? (
                      <div className="py-10 flex justify-center items-center text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-xs space-y-2">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto opacity-40">
                          <Bell className="w-5 h-5" />
                        </div>
                        <p className="font-semibold">No activity notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-2.5 rounded-xl border text-xs space-y-1 transition-all ${
                            !notif.isRead
                              ? 'bg-blue-50 dark:bg-zinc-900 border-blue-200 dark:border-blue-900/50 font-medium'
                              : 'bg-white dark:bg-zinc-900 border-border/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground truncate">{notif.title}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
