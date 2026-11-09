'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, ShoppingBag, Tag, BarChart3, Settings,
  LogOut, Menu, Star, MessageSquare, Calendar, ChevronRight, User, Sparkles, Receipt
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';

export function OwnerReviewsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<number | 'ALL'>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-reviews'],
    queryFn: async () => {
      const response = await api.get('/owner/reviews');
      return response.data.data as {
        reviews: Array<{
          id: string;
          orderId: string;
          rating: number;
          comment: string | null;
          createdAt: string;
          user: { name: string; email: string } | null;
          order: { id: string; guestName: string | null; total: number } | null;
        }>;
        stats: {
          avgRating: number;
          totalReviews: number;
          starBreakdown: Record<number, number>;
        };
      };
    },
  });

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      logout();
      router.push('/login');
    }
  };

  const reviewsList = data?.reviews ?? [];
  const stats = data?.stats ?? { avgRating: 0, totalReviews: 0, starBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

  // Filter reviews
  const filteredReviews = ratingFilter === 'ALL'
    ? reviewsList
    : reviewsList.filter((r) => r.rating === ratingFilter);

  // Dynamic Navigation items with proper Reviews and Settings icons
  const dynamicNavItems = [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/owner/dashboard' },
    { label: 'Menu', icon: UtensilsCrossed, href: '/owner/menu' },
    { label: 'Orders', icon: ShoppingBag, href: '/owner/orders' },
    { label: 'Coupons', icon: Tag, href: '/owner/coupons' },
    { label: 'Reviews', icon: Star, href: '/owner/reviews' },
    { label: 'Analytics', icon: BarChart3, href: '/owner/analytics' },
    { label: 'Settings', icon: Settings, href: '/owner/settings' },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Customer Reviews</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
          </div>
        </header>

        {/* Reviews Dashboard View */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="h-40 skeleton rounded-2xl" />
                <div className="h-40 skeleton rounded-2xl md:col-span-2" />
              </div>
              <div className="h-96 skeleton rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Summary Stats Header Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Average Score Card */}
                <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Average Rating
                  </span>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-4xl font-extrabold text-foreground">
                      {stats.avgRating ? stats.avgRating.toFixed(1) : '0.0'}
                    </span>
                    <Star className="w-8 h-8 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= Math.round(stats.avgRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted/40'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Based on {stats.totalReviews} customer {stats.totalReviews === 1 ? 'review' : 'reviews'}
                  </span>
                </div>

                {/* Rating Distribution Progress Bars */}
                <div className="bg-card border border-border rounded-2xl p-5 md:col-span-2 flex flex-col justify-between shadow-sm">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Rating Distribution
                  </span>
                  <div className="space-y-2">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = stats.starBreakdown[stars] ?? 0;
                      const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                      return (
                        <div key={stars} className="flex items-center gap-3 text-xs">
                          <button
                            onClick={() => setRatingFilter(ratingFilter === stars ? 'ALL' : stars)}
                            className={`flex items-center gap-1 w-10 font-bold hover:text-primary transition-colors ${
                              ratingFilter === stars ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          </button>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Review Filter Tab Row */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex gap-2 overflow-x-auto">
                  <button
                    onClick={() => setRatingFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      ratingFilter === 'ALL'
                        ? 'bg-foreground text-background shadow-sm'
                        : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    All Reviews ({reviewsList.length})
                  </button>
                  {[5, 4, 3, 2, 1].map((stars) => (
                    <button
                      key={stars}
                      onClick={() => setRatingFilter(stars)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                        ratingFilter === stars
                          ? 'bg-foreground text-background shadow-sm'
                          : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {stars} ★ ({stats.starBreakdown[stars] ?? 0})
                    </button>
                  ))}
                </div>
              </div>

              {/* Reviews List */}
              <div className="space-y-4">
                {filteredReviews.length === 0 ? (
                  <div className="bg-card border border-border rounded-2xl p-10 text-center shadow-sm">
                    <MessageSquare className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                    <p className="font-semibold text-sm">No reviews found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ratingFilter === 'ALL'
                        ? "You haven't received any customer reviews yet."
                        : `No ${ratingFilter}-star reviews found matching the filter.`}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredReviews.map((review) => {
                      const reviewerName = review.user?.name || review.order?.guestName || 'Guest Customer';
                      const reviewerEmail = review.user?.email || 'N/A';
                      const formattedDate = new Date(review.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      });
                      const formattedTime = new Date(review.createdAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const orderNum = review.order?.id?.slice(-8).toUpperCase() ?? 'UNKNOWN';

                      return (
                        <motion.div
                          key={review.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {reviewerName[0]?.toUpperCase() ?? 'G'}
                              </div>
                              <div>
                                <p className="font-bold text-xs flex items-center gap-1.5">
                                  {reviewerName}
                                  {!review.user && (
                                    <span className="text-[9px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full uppercase">
                                      Guest
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{reviewerEmail}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground sm:text-right">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>
                                {formattedDate} at {formattedTime}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-b border-border/60 py-2 text-xs">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    star <= review.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-muted/30'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                              <Receipt className="w-3.5 h-3.5 text-primary/80" />
                              <span>Order: #{orderNum}</span>
                              <span className="text-foreground ml-1">
                                (₹{review.order?.total?.toFixed(0) ?? 0})
                              </span>
                            </div>
                          </div>

                          {review.comment ? (
                            <p className="text-xs text-foreground bg-muted/20 dark:bg-muted/10 p-3 rounded-xl italic leading-relaxed">
                              "{review.comment}"
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/60 italic">No comment provided.</p>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
