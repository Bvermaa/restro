'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingBag,
  ChefHat,
  Tag,
  Star,
  BarChart3,
  Palette,
  Settings,
  LogOut,
  X,
  Lock,
  CreditCard,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { ThemeToggle } from '@/components/ThemeToggle';
import api from '@/services/api';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export const OWNER_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/owner/dashboard' },
  { key: 'menu', label: 'Menu', icon: UtensilsCrossed, href: '/owner/menu' },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, href: '/owner/orders' },
  { key: 'kitchen-staff', label: 'Kitchen Staff', icon: ChefHat, href: '/owner/kitchen-staff' },
  { key: 'coupons', label: 'Coupons', icon: Tag, href: '/owner/coupons' },
  { key: 'reviews', label: 'Reviews', icon: Star, href: '/owner/reviews' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, href: '/owner/analytics' },
  { key: 'subscription', label: 'Subscription', icon: CreditCard, href: '/owner/subscription' },
  { key: 'customize', label: 'Customize', icon: Palette, href: '/owner/customize' },
  { key: 'settings', label: 'Settings', icon: Settings, href: '/owner/settings' },
];

interface OwnerSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function OwnerSidebar({ mobileOpen = false, onMobileClose }: OwnerSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const { data: restaurantData } = useQuery({
    queryKey: ['owner-restaurant-sidebar'],
    queryFn: async () => {
      const res = await api.get('/owner/restaurant');
      return res.data.data.restaurant as {
        id: string;
        name?: string;
        platformType?: string;
        maxLogins?: number;
        disabledTabs?: string[] | null;
      };
    },
    staleTime: 30 * 1000,
  });

  const disabledTabs: string[] = Array.isArray(restaurantData?.disabledTabs) ? restaurantData.disabledTabs : [];

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    } finally {
      logout();
      toast.success('Logged out successfully');
      router.push('/login');
    }
  };

  const sidebarContent = (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col justify-between shrink-0">
      {/* Top Header */}
      <div>
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-extrabold text-sm text-foreground tracking-tight truncate max-w-[110px]">
                  {restaurantData?.name || 'Restaurant'}
                </p>
                {restaurantData?.platformType === 'DUAL' ? (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
                    DUAL
                  </span>
                ) : restaurantData?.platformType === 'HOTEL' ? (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-500 border border-blue-500/30 shrink-0">
                    HOTEL
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium truncate">
                {restaurantData?.platformType === 'DUAL'
                  ? 'Restaurant & Hotel'
                  : restaurantData?.platformType === 'HOTEL'
                  ? 'Hotel Owner'
                  : 'Owner Panel'}
              </p>
            </div>
          </div>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-2 rounded-xl text-muted-foreground hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Links */}
        <nav className="p-4 space-y-1.5 flex-1 min-h-0 overflow-y-auto">
          {OWNER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const isTabDisabled = disabledTabs.includes(item.key);

            // If disabled by administration, hide completely from the sidebar
            if (isTabDisabled) {
              return null;
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Box */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-3 mb-3 p-2 rounded-2xl bg-muted/50 border border-border/60">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 font-extrabold flex items-center justify-center text-sm shrink-0 border border-orange-500/30">
            {user?.name?.[0]?.toUpperCase() ?? 'O'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs text-foreground truncate">{user?.name || 'Owner'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all border border-border/60"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
          <ThemeToggle size="sm" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div className="flex-1" onClick={onMobileClose} />
        </div>
      )}
    </>
  );
}
