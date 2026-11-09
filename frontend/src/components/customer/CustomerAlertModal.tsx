'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Clock, CheckCircle2, AlertCircle, ShoppingBag, X, Bell, Sparkles } from 'lucide-react';

export interface CustomerAlertData {
  isOpen: boolean;
  type: 'WAITER_COMING' | 'WAITER_OCCUPIED' | 'ORDER_UPDATE';
  title: string;
  message: string;
  tableNumber?: string;
  orderId?: string;
  orderStatus?: string;
  timerSeconds?: number;
}

interface CustomerAlertModalProps {
  data: CustomerAlertData | null;
  onClose: () => void;
}

export function CustomerAlertModal({ data, onClose }: CustomerAlertModalProps) {
  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    if (data?.isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [data?.isOpen]);

  useEffect(() => {
    if (!data?.isOpen) return;
    if (data.timerSeconds && data.timerSeconds > 0) {
      setCountdown(data.timerSeconds);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [data]);

  if (!data || !data.isOpen) return null;

  const getHeaderIcon = () => {
    switch (data.type) {
      case 'WAITER_COMING':
        return (
          <div className="w-14 h-14 rounded-full bg-green-500/20 text-green-500 border-2 border-green-500/40 flex items-center justify-center shadow-lg shadow-green-500/20 animate-bounce">
            <ChefHat className="w-8 h-8" />
          </div>
        );
      case 'WAITER_OCCUPIED':
        return (
          <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-500 border-2 border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/20 animate-pulse">
            <Clock className="w-8 h-8" />
          </div>
        );
      case 'ORDER_UPDATE':
        return (
          <div className="w-14 h-14 rounded-full bg-blue-500/20 text-blue-500 border-2 border-blue-500/40 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShoppingBag className="w-8 h-8" />
          </div>
        );
      default:
        return (
          <div className="w-14 h-14 rounded-full bg-primary/20 text-primary border-2 border-primary/40 flex items-center justify-center shadow-lg">
            <Bell className="w-8 h-8" />
          </div>
        );
    }
  };

  const getHeaderBadge = () => {
    if (data.type === 'WAITER_COMING') {
      return <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 uppercase tracking-wider">Waiter On The Way</span>;
    }
    if (data.type === 'WAITER_OCCUPIED') {
      return <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">Staff Occupied</span>;
    }
    if (data.orderStatus) {
      return <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 uppercase tracking-wider">{data.orderStatus.replace(/_/g, ' ')}</span>;
    }
    return <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-primary/15 text-primary border border-primary/30 uppercase tracking-wider">Notification</span>;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-sm bg-card border-2 border-primary/30 rounded-3xl shadow-2xl overflow-hidden p-6 text-center space-y-4"
        >
          {/* Top Decorative Background Glow */}
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-secondary/20 rounded-full blur-2xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon Header */}
          <div className="flex flex-col items-center justify-center gap-2 pt-2">
            {getHeaderIcon()}
            <div className="pt-1">{getHeaderBadge()}</div>
          </div>

          {/* Title & Body */}
          <div className="space-y-2">
            <h3 className="text-xl font-display font-extrabold text-foreground tracking-tight">
              {data.title}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {data.message}
            </p>
          </div>

          {/* Waiter Countdown Timer if applicable */}
          {countdown > 0 && (
            <div className="py-2.5 px-4 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center gap-2 text-xs font-bold text-foreground">
              <Clock className="w-4 h-4 text-primary animate-spin" />
              <span>
                {data.type === 'WAITER_COMING' ? 'Estimated arrival: ' : 'You can retry in: '}
                <strong className="text-primary font-mono text-sm ml-1">
                  {data.type === 'WAITER_COMING'
                    ? `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')} min (${countdown}s)`
                    : `${countdown}s`}
                </strong>
              </span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary/95 text-primary-foreground font-display font-bold text-sm shadow-lg shadow-primary/25 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Got It</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
