'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { X, Bell, CheckCheck, Sparkles, CreditCard, ShoppingBag, AlertTriangle, Megaphone, Loader2, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationItem {
  id: string;
  userId: string;
  restaurantId?: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface CustomerNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerNotificationModal({ isOpen, onClose }: CustomerNotificationModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-notifications'],
    queryFn: async () => {
      const res = await api.get('/profile/notifications');
      return res.data.data as { notifications: NotificationItem[]; unreadCount: number };
    },
    enabled: isOpen && !!user,
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/profile/notifications/read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'ORDER_STATUS':
        return <ShoppingBag className="w-4 h-4 text-blue-500" />;
      case 'PAYMENT_RECEIPT':
        return <CreditCard className="w-4 h-4 text-green-500" />;
      case 'BROADCAST':
        return <Megaphone className="w-4 h-4 text-purple-500" />;
      case 'SYSTEM':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-primary" />;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-zinc-950 border-2 border-border w-full max-w-md rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh] opacity-100 text-foreground"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold relative">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-extrabold animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-foreground">Notifications</h3>
                <p className="text-[11px] text-muted-foreground">Order & System Alerts</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  onClick={() => markReadMutation.mutate()}
                  disabled={markReadMutation.isPending}
                  className="px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Read All
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!user ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-700 dark:text-amber-300">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Guest Ordering Mode — No Login Required!</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You can place orders, add items, and track order status live in real-time without creating an account.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-left space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-primary">
                    <Gift className="w-4 h-4" />
                    <span>Optional Loyalty Points Program</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Logging in is <strong>completely optional</strong>. Create a free account if you want to earn loyalty points on orders and redeem discounts on future visits!
                  </p>
                  <a
                    href="/login"
                    className="inline-block w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs text-center shadow-sm hover:opacity-95 transition-opacity"
                  >
                    Log In / Sign Up (Optional)
                  </a>
                </div>
              </div>
            ) : isLoading ? (
              <div className="py-12 flex justify-center items-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <Bell className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-sm font-semibold">No notifications yet!</p>
                <p className="text-xs">Updates about your orders & payments will appear here.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-xl border transition-all space-y-1 ${
                    !notif.isRead
                      ? 'bg-primary/5 border-primary/20 shadow-xs'
                      : 'bg-card border-border/60 hover:border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-foreground">
                      {getNotificationIcon(notif.type)}
                      <span>{notif.title}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{notif.message}</p>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
