'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Search, Filter, ShoppingCart, Clock, MapPin, Star, Bot, X, ChevronUp, QrCode, ChevronRight, BellRing, Gift, Ban, Bed, Sparkles, Utensils, Shirt, Bath, Luggage, Wrench, MessageSquare, CheckCircle2, ChevronDown, Lock } from 'lucide-react';
import api, { getSocketUrl } from '@/services/api';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { MenuItemCard } from './MenuItemCard';
import { CartDrawer } from './CartDrawer';
import { AIChatbot } from './AIChatbot';
import { AIRecommendations } from './AIRecommendations';
import { CustomerNotificationModal } from './CustomerNotificationModal';
import { CustomerAlertModal, CustomerAlertData } from './CustomerAlertModal';
import { playWaiterCallSound, playNewOrderSound, processRealTimeEvent } from '@/utils/audio';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getDetailedStatus, formatTime12h } from '@/utils/operatingHours';
import { ThemeToggle } from '@/components/ThemeToggle';
import { io } from 'socket.io-client';
import { generateTableToken } from '@qr-restaurant/shared';

const WAITER_COOLDOWN_SECONDS = 30;

export const HOTEL_ROOM_PURPOSES = [
  { id: 'Room Cleaning', label: '🧹 Room Cleaning', desc: 'Housekeeping, room tidy & trash pickup' },
  { id: 'Food & Water', label: '🍽️ Food, Cutlery & Water', desc: 'Extra plates, spoons, glasses & drinking water' },
  { id: 'Iron & Laundry', label: '👔 Iron / Ironing Board & Laundry', desc: 'Iron box, ironing board & clothes pressing' },
  { id: 'Towels & Toiletries', label: '🛏️ Fresh Towels & Toiletries', desc: 'Fresh towels, soap, shampoo & bath kit' },
  { id: 'Luggage & Bellboy', label: '🧳 Luggage / Bellboy Assistance', desc: 'Luggage assistance & check-out bags' },
  { id: 'Room Maintenance', label: '🔧 Room Maintenance', desc: 'AC cooling, TV remote, electrical or plumbing' },
  { id: 'General Assistance', label: '🔔 General Room Service', desc: 'Staff visit to the room for assistance' },
  { id: 'Custom Request', label: '✍️ Custom Request / Other', desc: 'Specify any special requirement or custom service' },
];

export const DINE_IN_PURPOSES = [
  { id: 'Food & Cutlery', label: '🍽️ Extra Cutlery, Water & Napkins', desc: 'Drinking water, extra spoons, plates & tissues' },
  { id: 'Table Cleaning', label: '🧹 Clean Table', desc: 'Wipe table, clear used plates' },
  { id: 'Bill & Payment', label: '💳 Bill & Payment Request', desc: 'Request bill copy, payment machine or cash collection' },
  { id: 'Call Waiter', label: '🙋 Call Waiter to Table', desc: 'Assistance with menu, recommendations & order' },
  { id: 'Custom Request', label: '✍️ Custom Request / Other', desc: 'Specify custom request' },
];

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface RestaurantMenuPageProps {
  slug: string;
  tableNumber?: string;
  tableToken?: string;
  isTableVerified?: boolean;
  searchParams?: {
    table?: string;
    t?: string;
    token?: string;
    preview?: string;
    themeColor?: string;
    name?: string;
    description?: string;
    logo?: string;
    banner?: string;
    layout?: string;
  };
}

export function RestaurantMenuPage({ slug, tableNumber, tableToken, isTableVerified, searchParams }: RestaurantMenuPageProps) {
  const queryClient = useQueryClient();
  const isPreview = searchParams?.preview === 'true';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'VEG' | 'NON_VEG' | 'VEGAN'>('ALL');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [priceSort, setPriceSort] = useState<'DEFAULT' | 'LOW_TO_HIGH' | 'HIGH_TO_LOW'>('DEFAULT');

  const hasActiveFilters = activeFilter !== 'ALL' || maxPrice !== null || priceSort !== 'DEFAULT' || !!searchQuery;
  type WaiterStatus = 'IDLE' | 'PENDING' | 'COMING' | 'OCCUPIED';
  const [waiterStatus, setWaiterStatus] = useState<WaiterStatus>('IDLE');
  const [waiterCooldown, setWaiterCooldown] = useState(0);
  const [waiterLoading, setWaiterLoading] = useState(false);
  const [showTableInput, setShowTableInput] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<string>('Room Cleaning');
  const [customServiceNote, setCustomServiceNote] = useState<string>('');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [waiterComingTimer, setWaiterComingTimer] = useState(0);
  const [waiterPendingTimer, setWaiterPendingTimer] = useState(0);
  const waiterComingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waiterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<any>(null);

  const clearWaiterTimers = useCallback(() => {
    if (waiterTimerRef.current) {
      clearInterval(waiterTimerRef.current);
      waiterTimerRef.current = null;
    }
    if (waiterComingRef.current) {
      clearInterval(waiterComingRef.current);
      waiterComingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && slug) {
      localStorage.setItem('scanned_restaurant_slug', slug);
      if (tableNumber) {
        localStorage.setItem('scanned_table_number', tableNumber);
      }
    }
  }, [slug, tableNumber]);

  const getTableStorageKey = useCallback((tbl?: string | null) => {
    const activeTbl = tbl || tableNumber || manualTableNumber || (typeof window !== 'undefined' ? localStorage.getItem(`table_num_${slug}`) : null);
    return activeTbl ? `${slug}_t_${String(activeTbl).trim()}` : null;
  }, [slug, tableNumber, manualTableNumber]);

  const resetWaiterState = useCallback((tbl?: string | null) => {
    clearWaiterTimers();
    setWaiterStatus('IDLE');
    setWaiterCooldown(0);
    setWaiterComingTimer(0);
    setWaiterPendingTimer(0);
    if (typeof window !== 'undefined') {
      const key = getTableStorageKey(tbl);
      if (key) {
        localStorage.removeItem(`waiter_status_${key}`);
        localStorage.removeItem(`waiter_timer_until_${key}`);
      }
    }
  }, [clearWaiterTimers, getTableStorageKey]);

  const startComingTimer = useCallback((seconds: number, tbl?: string | null) => {
    clearWaiterTimers();
    setWaiterStatus('COMING');
    setWaiterComingTimer(seconds);
    setWaiterCooldown(0);

    const until = Date.now() + seconds * 1000;
    const key = getTableStorageKey(tbl);
    if (typeof window !== 'undefined' && key) {
      localStorage.setItem(`waiter_status_${key}`, 'COMING');
      localStorage.setItem(`waiter_timer_until_${key}`, String(until));
    }

    waiterComingRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setWaiterComingTimer(remaining);
      if (remaining <= 0) {
        resetWaiterState(tbl);
      }
    }, 1000);
  }, [clearWaiterTimers, getTableStorageKey, resetWaiterState]);

  const startOccupiedTimer = useCallback((seconds: number, tbl?: string | null) => {
    clearWaiterTimers();
    setWaiterStatus('OCCUPIED');
    setWaiterCooldown(seconds);
    setWaiterComingTimer(0);

    const until = Date.now() + seconds * 1000;
    const key = getTableStorageKey(tbl);
    if (typeof window !== 'undefined' && key) {
      localStorage.setItem(`waiter_status_${key}`, 'OCCUPIED');
      localStorage.setItem(`waiter_timer_until_${key}`, String(until));
    }

    waiterTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setWaiterCooldown(remaining);
      if (remaining <= 0) {
        resetWaiterState(tbl);
      }
    }, 1000);
  }, [clearWaiterTimers, getTableStorageKey, resetWaiterState]);

  const startPendingState = useCallback((tbl?: string | null, seconds: number = 30) => {
    clearWaiterTimers();
    setWaiterStatus('PENDING');
    setWaiterPendingTimer(seconds);
    setWaiterCooldown(0);
    setWaiterComingTimer(0);

    const until = Date.now() + seconds * 1000;
    const key = getTableStorageKey(tbl);
    if (typeof window !== 'undefined' && key) {
      localStorage.setItem(`waiter_status_${key}`, 'PENDING');
      localStorage.setItem(`waiter_timer_until_${key}`, String(until));
    }

    waiterTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setWaiterPendingTimer(remaining);
      if (remaining <= 0) {
        resetWaiterState(tbl);
      }
    }, 1000);
  }, [clearWaiterTimers, getTableStorageKey, resetWaiterState]);

  // Restore running timer state ONLY for the specific table
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getTableStorageKey();
    if (!key) {
      setWaiterStatus('IDLE');
      setWaiterCooldown(0);
      setWaiterComingTimer(0);
      return;
    }

    const storedStatus = localStorage.getItem(`waiter_status_${key}`) as WaiterStatus | null;
    const storedUntil = Number(localStorage.getItem(`waiter_timer_until_${key}`) || 0);

    if (storedStatus && storedUntil > Date.now()) {
      const remaining = Math.ceil((storedUntil - Date.now()) / 1000);
      if (storedStatus === 'COMING') {
        startComingTimer(remaining, tableNumber || manualTableNumber);
      } else if (storedStatus === 'OCCUPIED') {
        startOccupiedTimer(remaining, tableNumber || manualTableNumber);
      } else if (storedStatus === 'PENDING') {
        startPendingState(tableNumber || manualTableNumber, remaining);
      }
    } else {
      localStorage.removeItem(`waiter_status_${key}`);
      localStorage.removeItem(`waiter_timer_until_${key}`);
      setWaiterStatus('IDLE');
    }
  }, [getTableStorageKey, startComingTimer, startOccupiedTimer, startPendingState, tableNumber, manualTableNumber]);

  const { items: cartItems, itemCount, setRestaurant, total: getCartTotal } = useCartStore();
  const { user: rawUser, accessToken, logout } = useAuthStore();
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [customerAlert, setCustomerAlert] = useState<CustomerAlertData | null>(null);

  // Fetch latest user profile to keep loyalty points synced in real-time
  const { data: userProfileData } = useQuery({
    queryKey: ['user-profile-loyalty'],
    queryFn: async () => {
      const res = await api.get('/profile');
      return res.data.data.user as { id: string; loyaltyPoints: number };
    },
    enabled: !!rawUser?.id && !!accessToken,
    staleTime: 60000,
    retry: false,
    refetchInterval: 60000,
  });

  // Fetch dynamic loyalty program rules configured by Super Admin
  const { data: loyaltySettings } = useQuery({
    queryKey: ['loyalty-settings'],
    queryFn: async () => {
      const res = await api.get('/menu/loyalty-settings');
      return res.data.data?.settings || {};
    },
  });

  const loyaltyEnabled = loyaltySettings?.enabled !== false;

  // Fetch unread notifications count for customer
  const { data: customerNotifData } = useQuery({
    queryKey: ['customer-notifications-count'],
    queryFn: async () => {
      const res = await api.get('/profile/notifications');
      return res.data.data as { unreadCount: number };
    },
    enabled: !!rawUser?.id && !!accessToken,
    staleTime: 60000,
    retry: false,
    refetchInterval: 60000,
  });

  const unreadNotifCount = customerNotifData?.unreadCount ?? 0;

  const currentPoints = userProfileData?.loyaltyPoints ?? rawUser?.loyaltyPoints ?? 0;

  const activeUser = useMemo(() => {
    if (!rawUser) return null;
    return rawUser;
  }, [rawUser]);

  const [showHours, setShowHours] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  const isAnyModalOpen = showLoyaltyModal || showTableInput || showHours || showNotifModal || showServiceModal;

  useEffect(() => {
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isAnyModalOpen]);

  const [addonOrderId, setAddonOrderId] = useState<string | null>(null);
  const [addonOrderNum, setAddonOrderNum] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = sessionStorage.getItem('qr_restaurant_addon_order_id');
      const storedNum = sessionStorage.getItem('qr_restaurant_addon_order_num');
      if (storedId) {
        setAddonOrderId(storedId);
        setAddonOrderNum(storedNum);
      }
    }
  }, []);

  const [recentOrders, setRecentOrders] = useState<Array<{ orderId: string; restaurantSlug: string; createdAt: number }>>([]);

  const [savedTable, setSavedTable] = useState<string | null>(null);
  const [savedToken, setSavedToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || isPreview) return;
    const tokenInQuery = searchParams?.token;

    if (tableNumber && tokenInQuery) {
      localStorage.setItem(`table_num_${slug}`, tableNumber);
      localStorage.setItem(`table_token_${slug}`, tokenInQuery);
      setSavedTable(tableNumber);
      setSavedToken(tokenInQuery);
    } else if (tableNumber && !tokenInQuery) {
      localStorage.setItem(`table_num_${slug}`, tableNumber);
      setSavedTable(tableNumber);
      if (searchParams?.table) {
        localStorage.removeItem(`table_token_${slug}`);
        setSavedToken(null);
      } else {
        setSavedToken(localStorage.getItem(`table_token_${slug}`));
      }
    } else {
      // Recover from localStorage on page refresh/reload without query params
      const storedNum = localStorage.getItem(`table_num_${slug}`);
      const storedTok = localStorage.getItem(`table_token_${slug}`);
      if (storedNum) setSavedTable(storedNum);
      if (storedTok) setSavedToken(storedTok);
    }
  }, [tableNumber, searchParams, slug, isPreview]);

  const displayTableNumber = isPreview ? (searchParams?.table || undefined) : (tableNumber || savedTable || manualTableNumber || undefined);
  const displayTableToken = isPreview ? (searchParams?.token || undefined) : (searchParams?.token || savedToken || undefined);



  
  useEffect(() => {
    const orders = localStorage.getItem('qr_restaurant_recent_orders');
    if (orders) {
      try {
        const parsed = JSON.parse(orders);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const filtered = parsed.filter(
            (o: any) =>
              o.restaurantSlug === slug &&
              o.orderId &&
              now - o.createdAt < 24 * 60 * 60 * 1000 // 24 hours
          );
          
          // Deduplicate by orderId
          const uniqueMap = new Map<string, any>();
          filtered.forEach((o: any) => {
            if (!uniqueMap.has(o.orderId)) {
              uniqueMap.set(o.orderId, o);
            }
          });
          const uniqueFiltered = Array.from(uniqueMap.values());
          setRecentOrders(uniqueFiltered);
        }
      } catch (e) {
        console.error('Failed to parse recent orders', e);
      }
    }
  }, [slug]);

  const { data: activeOrdersDetails } = useQuery({
    queryKey: ['active-orders', slug, recentOrders.map(o => o.orderId).join(',')],
    queryFn: async () => {
      if (recentOrders.length === 0) return [];
      const promises = recentOrders.map(async (o) => {
        try {
          const res = await api.get(`/orders/${o.orderId}`, { skipToast: true });
          return res.data.data.order;
        } catch (err: any) {
          const status = err?.response?.status;
          // If the order is forbidden (403) or not found (404), remove it from localStorage
          if (status === 404 || status === 403) {
            try {
              const orders = localStorage.getItem('qr_restaurant_recent_orders');
              if (orders) {
                let parsed = JSON.parse(orders);
                if (Array.isArray(parsed)) {
                  parsed = parsed.filter((item: any) => item.orderId !== o.orderId);
                  localStorage.setItem('qr_restaurant_recent_orders', JSON.stringify(parsed));
                  setRecentOrders((prev) => prev.filter((item) => item.orderId !== o.orderId));
                }
              }
            } catch (e) {
              console.error(e);
            }
          } else {
            console.warn(`Order ${o.orderId} fetch failed:`, err?.message ?? err);
          }
          return null;
        }
      });
      const results = await Promise.all(promises);
      const validOrders = results.filter(Boolean);
      
      // Deduplicate valid orders just in case
      const uniqueMap = new Map<string, any>();
      validOrders.forEach((order: any) => {
        if (!uniqueMap.has(order.id)) {
          uniqueMap.set(order.id, order);
        }
      });
      return Array.from(uniqueMap.values());
    },
    enabled: recentOrders.length > 0,
    refetchInterval: 60000,
  });

  // Previous Orders for logged-in users
  const { data: previousOrders } = useQuery({
    queryKey: ['previous-orders', slug],
    queryFn: async () => {
      const res = await api.get('/orders');
      const allOrders = res.data.data.orders as any[];
      return allOrders.filter((o: any) => o.restaurant.slug === slug);
    },
    enabled: !!activeUser,
    refetchInterval: 30000,
  });

  // Default tab selection on load
  useEffect(() => {
    if (activeOrdersDetails && activeOrdersDetails.length > 0) {
      setActiveTab('active');
    } else if (activeUser && previousOrders && previousOrders.length > 0) {
      setActiveTab('history');
    }
  }, [activeOrdersDetails, previousOrders, activeUser]);

  const handleDismissOrder = (orderId: string) => {
    try {
      const orders = localStorage.getItem('qr_restaurant_recent_orders');
      if (orders) {
        let parsed = JSON.parse(orders);
        if (Array.isArray(parsed)) {
          parsed = parsed.filter((o: any) => o.orderId !== orderId);
          localStorage.setItem('qr_restaurant_recent_orders', JSON.stringify(parsed));
          setRecentOrders(parsed.filter((o: any) => o.restaurantSlug === slug));
        }
      }
    } catch (e) {
      console.error('Failed to dismiss order', e);
    }
  };

  const getOrderStatusDetails = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { label: 'Order Placed', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', progress: 20 };
      case 'CONFIRMED':
        return { label: 'Confirmed', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', progress: 40 };
      case 'PREPARING':
      case 'BAKING':
        return { label: 'Preparing', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', progress: 60 };
      case 'READY':
        return { label: 'Ready', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', progress: 80 };
      case 'ON_THE_WAY':
        return { label: 'Out for Delivery', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', progress: 90 };
      case 'DELIVERED':
        return { label: 'Served & Completed', color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20', progress: 100 };
      case 'CANCELLED':
        return { label: 'Cancelled', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', progress: 100 };
      default:
        return { label: 'Pending', color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20', progress: 10 };
    }
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['menu', slug],
    queryFn: async () => {
      const response = await api.get(`/menu/${slug}`);
      return response.data.data as {
        restaurant: {
          id: string;
          name: string;
          slug: string;
          logo: string | null;
          banner: string | null;
          description: string | null;
          cuisineType: string | null;
          isOpen: boolean;
          operatingHours: Record<string, { open: string; close: string; closed: boolean }> | null;
          minOrderValue: number;
          themeColor: string | null;
          menuTemplate?: string | null;
          customFields?: Array<{ id: string; key: string; value: string; icon: string }> | null;
          featureFlags?: Record<string, boolean> | null;
        };
        categories: Array<{
          id: string;
          name: string;
          items: Array<{
            id: string;
            name: string;
            description: string | null;
            price: number;
            image: string | null;
            isVeg: boolean;
            isVegan: boolean;
            isAvailable: boolean;
            badges: string[];
            variants: Array<{ id: string; name: string; price: number }>;
            addOns: Array<{ id: string; name: string; price: number }>;
          }>;
        }>;
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const restaurantPlatformType = (data?.restaurant as any)?.platformType || 'RESTAURANT';
  const isHotelPlatform = restaurantPlatformType === 'HOTEL';
  const isRestaurantPlatform = restaurantPlatformType === 'RESTAURANT';

  const isExplicitRoom = Boolean(
    (displayTableNumber &&
      (displayTableNumber.toLowerCase().includes('room') ||
       displayTableNumber.toLowerCase().includes('suite') ||
       displayTableNumber.toLowerCase().startsWith('rm') ||
       displayTableNumber.toLowerCase().includes('hotel'))) ||
    (manualTableNumber &&
      (manualTableNumber.toLowerCase().includes('room') ||
       manualTableNumber.toLowerCase().includes('suite'))) ||
    searchParams?.table?.toLowerCase().includes('room')
  );

  const isHotelRoom = isHotelPlatform ? true : isRestaurantPlatform ? false : isExplicitRoom;

  useEffect(() => {
    if (isHotelRoom) {
      setSelectedPurpose((prev) => (prev === 'Food & Cutlery' ? 'Room Cleaning' : prev));
    } else {
      setSelectedPurpose((prev) => (prev === 'Room Cleaning' ? 'Food & Cutlery' : prev));
    }
  }, [isHotelRoom]);

  const statusInfo = useMemo(() => {
    if (!data?.restaurant) return { status: 'CLOSED' as const, badgeText: 'Closed', detailText: 'Closed' };
    return getDetailedStatus(data.restaurant.operatingHours as any, data.restaurant.isOpen);
  }, [data]);

  const isQrDisabledGlobally = (data?.restaurant as any)?.qrSettings?.enabled === false;
  const disabledLocations: string[] = Array.isArray((data?.restaurant as any)?.qrSettings?.disabledLocations)
    ? (data?.restaurant as any).qrSettings.disabledLocations
    : [];

  const activeLocation = displayTableNumber || tableNumber || savedTable;

  const isTableQrDisabledByAdmin =
    (data?.restaurant as any)?.platformType === 'HOTEL' ||
    (data?.restaurant as any)?.featureFlags?.callWaiterEnabled === false ||
    (data?.restaurant as any)?.featureFlags?.tableQrEnabled === false;

  const isRoomQrDisabledByAdmin =
    (data?.restaurant as any)?.platformType === 'RESTAURANT' ||
    (data?.restaurant as any)?.featureFlags?.roomServiceEnabled === false ||
    (data?.restaurant as any)?.featureFlags?.roomQrEnabled === false;

  const locationDisableReason = useMemo(() => {
    if (isQrDisabledGlobally) {
      return 'Digital QR Ordering is currently disabled for this restaurant by administration.';
    }
    if (activeLocation) {
      const cleanLoc = String(activeLocation).trim().toLowerCase();
      if (isHotelRoom) {
        if (isRoomQrDisabledByAdmin) {
          const roomLabel = cleanLoc.startsWith('room') ? activeLocation : `Room ${activeLocation}`;
          return `Hotel Room QR Service (${roomLabel}) is disabled by administration.`;
        }
      } else {
        if (isTableQrDisabledByAdmin) {
          const tableLabel = cleanLoc.startsWith('table') ? activeLocation : `Table ${activeLocation}`;
          return `Dine-In Table QR Ordering (${tableLabel}) is disabled by administration.`;
        }
      }
      if (disabledLocations.some((d) => String(d).trim().toLowerCase() === cleanLoc)) {
        const locLabel = isHotelRoom
          ? (cleanLoc.startsWith('room') ? activeLocation : `Room ${activeLocation}`)
          : (cleanLoc.startsWith('table') ? activeLocation : `Table ${activeLocation}`);
        return `Ordering for ${locLabel} is temporarily disabled by restaurant management.`;
      }
    }
    return null;
  }, [isQrDisabledGlobally, activeLocation, isHotelRoom, isRoomQrDisabledByAdmin, isTableQrDisabledByAdmin, disabledLocations]);

  const isLocationDisabled = !!locationDisableReason;

  useEffect(() => {
    if (data?.restaurant) {
      setRestaurant(slug, data.restaurant.id);
    }
  }, [data, slug, setRestaurant]);

  // Ordering location is already shown clearly in the header pill; no toast popup on every request/mount.

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      clearWaiterTimers();
    };
  }, [clearWaiterTimers]);

  const handleCallWaiter = useCallback(async (
    tableNum?: string,
    purpose?: string,
    customNote?: string
  ) => {
    const storedTable = typeof window !== 'undefined' ? localStorage.getItem(`table_num_${slug}`) : null;
    const effectiveTable = tableNum || tableNumber || manualTableNumber || storedTable;

    if (!effectiveTable || !String(effectiveTable).trim()) {
      setShowTableInput(true);
      return;
    }

    const cleanTable = String(effectiveTable).trim();
    const isRoom = isHotelPlatform ? true : isRestaurantPlatform ? false : (cleanTable.toLowerCase().includes('room') || cleanTable.toLowerCase().includes('suite'));
    const label = isRoom ? (cleanTable.toLowerCase().startsWith('room') ? cleanTable : `Room ${cleanTable}`) : `Table ${cleanTable}`;

    const flags = (data?.restaurant as any)?.featureFlags || {};
    if (isRoom && flags.roomServiceEnabled === false) {
      toast.error('Hotel room service is currently disabled for this restaurant by administration.');
      return;
    }
    if (!isRoom && flags.callWaiterEnabled === false) {
      toast.error('Waiter call service is currently disabled for this restaurant by administration.');
      return;
    }

    if (waiterLoading) return;

    setWaiterLoading(true);
    try {
      let token = tableToken || searchParams?.t || searchParams?.token || (typeof window !== 'undefined' ? localStorage.getItem(`table_token_${slug}`) : '') || '';
      if (!token) {
        try {
          token = generateTableToken(slug, cleanTable);
        } catch {
          token = '';
        }
      }

      const chosenPurpose = purpose || (isRoom ? 'Room Cleaning' : 'General Assistance');
      await api.post(`/menu/${slug}/call-waiter`, {
        tableNumber: cleanTable,
        tableToken: token,
        purpose: chosenPurpose,
        customNote: customNote?.trim() || undefined,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem(`table_num_${slug}`, cleanTable);
        if (token) {
          localStorage.setItem(`table_token_${slug}`, token);
        }
      }
      setManualTableNumber(cleanTable);

      if (socketRef.current && data?.restaurant?.id) {
        socketRef.current.emit('join:table', { restaurantId: data.restaurant.id, tableNumber: cleanTable });
      }

      toast.success(
        isRoom
          ? `🛎️ Room service requested for ${label}!`
          : `🙋 Waiter called for ${label}!`,
        {
          description: customNote?.trim()
            ? `${chosenPurpose} — "${customNote.trim()}"`
            : `${chosenPurpose}. Staff will arrive shortly.`,
          duration: 5000,
        }
      );

      setShowServiceModal(false);
      setShowTableInput(false);
      setCustomServiceNote('');
      setIsEditingLocation(false);
      startPendingState(cleanTable, 30);
    } catch (err: any) {
      const isServerDown = err.code === 'ERR_NETWORK' || !err.response || err.response?.status >= 500;
      if (!isServerDown) {
        const errMsg = err.response?.data?.error || err.response?.data?.message || 'Could not send request. Please try again.';
        toast.error(errMsg);
      }
    } finally {
      setWaiterLoading(false);
    }
  }, [slug, tableNumber, manualTableNumber, tableToken, waiterStatus, waiterLoading, searchParams, startPendingState, isHotelPlatform, isRestaurantPlatform, data]);

  useEffect(() => {
    if (!data?.restaurant?.id) return;
    const socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      withCredentials: true,
    });
    socketRef.current = socket;

    const joinCustomerRooms = () => {
      if (activeUser?.id) {
        socket.emit('join:user', activeUser.id);
      }
      if (data?.restaurant?.id) {
        socket.emit('join:restaurant', data.restaurant.id);
      }
      const storedTable = typeof window !== 'undefined' ? localStorage.getItem(`table_num_${slug}`) : null;
      const activeTable = tableNumber || manualTableNumber || storedTable;
      if (activeTable) {
        socket.emit('join:table', { restaurantId: data.restaurant.id, tableNumber: String(activeTable).trim() });
      }
      recentOrders.forEach((o) => {
        if (o.orderId) {
          socket.emit('join:order', o.orderId);
        }
      });
    };

    socket.on('connect', joinCustomerRooms);
    socket.on('connect_error', (err) => {
      console.warn('Real-time socket notice:', err.message);
    });
    joinCustomerRooms();

    const handleWaiterResponded = (resData: { tableNumber?: string; message?: string }) => {
      const currentTable = tableNumber || manualTableNumber || (typeof window !== 'undefined' ? localStorage.getItem(`table_num_${slug}`) : null);
      if (!currentTable || !resData?.tableNumber) return;
      if (String(currentTable).trim() === String(resData.tableNumber).trim()) {
        processRealTimeEvent('waiter_called', () => {
          startComingTimer(60, resData.tableNumber);
          setCustomerAlert({
            isOpen: true,
            type: 'WAITER_COMING',
            title: '👨‍🍳 Waiter Is Coming!',
            message: resData.message || `Waiter is coming in a few minutes to Table ${resData.tableNumber}!`,
            tableNumber: resData.tableNumber,
            timerSeconds: 60,
          });
        });
      }
    };

    socket.on('waiter:responded', handleWaiterResponded);
    socket.on('waiter_responded', handleWaiterResponded);

    const handleWaiterDismissed = (resData: { tableNumber?: string; message?: string }) => {
      const currentTable = tableNumber || manualTableNumber || (typeof window !== 'undefined' ? localStorage.getItem(`table_num_${slug}`) : null);
      if (!currentTable || !resData?.tableNumber) return;
      if (String(currentTable).trim() === String(resData.tableNumber).trim()) {
        processRealTimeEvent('order_cancelled', () => {
          startOccupiedTimer(50, resData.tableNumber);
          setCustomerAlert({
            isOpen: true,
            type: 'WAITER_OCCUPIED',
            title: '⏳ Waiter Is Busy Right Now',
            message: resData.message || `Waiter is busy right now. You can call again after 50 seconds.`,
            tableNumber: resData.tableNumber,
            timerSeconds: 50,
          });
        });
      }
    };

    socket.on('waiter:dismissed', handleWaiterDismissed);
    socket.on('waiter_dismissed', handleWaiterDismissed);

    socket.on('notification:new', () => {
      queryClient.invalidateQueries({ queryKey: ['customer-notifications-count'] });
    });

    socket.on('user:loyalty_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile-loyalty'] });
    });

    const handleOrderStatusUpdated = (payload: { orderId?: string; status?: string; paymentStatus?: string; reason?: string; userId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['previous-orders'] });

      const isMyOrder = !payload?.orderId || recentOrders.some((o) => o.orderId === payload.orderId) || (activeUser?.id && payload?.userId === activeUser.id);
      if (!isMyOrder) return;

      const isCancelled = payload?.status === 'CANCELLED';
      const eventType = isCancelled ? 'order_cancelled' : 'order_status_changed';

      const statusMap: Record<string, { label: string; text: string; icon: string }> = {
        CONFIRMED: { label: 'Order Confirmed', text: 'The restaurant has confirmed your order!', icon: '✅' },
        PREPARING: { label: 'Preparing Order', text: 'The kitchen has started preparing your delicious food!', icon: '👨‍🍳' },
        BAKING: { label: 'Cooking & Baking', text: 'Your food is in the kitchen oven/stove!', icon: '🔥' },
        READY: { label: 'Order Ready!', text: 'Your order is ready to be served!', icon: '🍽️' },
        ON_THE_WAY: { label: 'Out for Delivery', text: 'Your order is on the way!', icon: '🚴' },
        DELIVERED: { label: 'Served & Completed', text: 'Your order has been served. Enjoy your meal!', icon: '🎉' },
        CANCELLED: { label: 'Order Cancelled', text: payload?.reason ? `Order cancelled: ${payload.reason}` : 'Your order was cancelled by the restaurant.', icon: '❌' },
      };

      const info = payload?.status && statusMap[payload.status] ? statusMap[payload.status] : {
        label: `Order ${payload?.status ? payload.status.replace(/_/g, ' ') : 'Updated'}`,
        text: `Your order status was updated to ${payload?.status || 'UPDATED'}.`,
        icon: '🔔',
      };

      processRealTimeEvent(
        eventType,
        () => {
          setCustomerAlert({
            isOpen: true,
            type: 'ORDER_UPDATE',
            title: `${info.icon} ${info.label}`,
            message: info.text,
            orderId: payload?.orderId,
            orderStatus: payload?.status,
          });
        },
        {
          title: `${info.icon} ${info.label}`,
          body: info.text,
          tag: `customer-order-${payload?.orderId || Date.now()}`,
        }
      );
    };

    socket.on('order:status_updated', handleOrderStatusUpdated);
    socket.on('order_status_changed', handleOrderStatusUpdated);

    socket.on('order_cancelled', (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['previous-orders'] });
      const isMyOrder = !payload?.orderId || recentOrders.some((o) => o.orderId === payload.orderId) || (activeUser?.id && payload?.userId === activeUser.id);
      if (!isMyOrder) return;

      processRealTimeEvent(
        'order_cancelled',
        () => {
          setCustomerAlert({
            isOpen: true,
            type: 'ORDER_UPDATE',
            title: '⚠️ Order Cancelled',
            message: payload?.reason ? `Order cancelled: ${payload.reason}` : 'Your order was cancelled.',
            orderId: payload?.orderId,
            orderStatus: 'CANCELLED',
          });
        },
        {
          title: '⚠️ Order Cancelled',
          body: payload?.reason ? `Order cancelled: ${payload.reason}` : 'Your order was cancelled.',
          tag: `customer-cancel-${payload?.orderId || Date.now()}`,
        }
      );
    });

    socket.on('driver_assigned', (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      const isMyOrder = !payload?.orderId || recentOrders.some((o) => o.orderId === payload.orderId) || (activeUser?.id && payload?.userId === activeUser.id);
      if (!isMyOrder) return;

      processRealTimeEvent(
        'driver_assigned',
        () => {
          setCustomerAlert({
            isOpen: true,
            type: 'ORDER_UPDATE',
            title: '🚗 Driver Assigned',
            message: 'A driver has been assigned to your order!',
            orderId: payload?.orderId,
            orderStatus: payload?.status || 'ON_THE_WAY',
          });
        },
        {
          title: '🚗 Driver Assigned',
          body: 'A driver has been assigned to your order!',
          tag: `customer-driver-${payload?.orderId || Date.now()}`,
        }
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [data?.restaurant?.id, tableNumber, manualTableNumber, activeUser?.id, queryClient, recentOrders, slug, startComingTimer, startOccupiedTimer]);

  const filteredCategories = useMemo(() => {
    if (!data) return [];
    return data.categories
      .map((cat) => ({
        ...cat,
        items: cat.items
          .filter((item) => {
            const matchesSearch =
              !searchQuery ||
              item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.description?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesFilter =
              activeFilter === 'ALL' ||
              (activeFilter === 'VEG' && item.isVeg && !item.isVegan) ||
              (activeFilter === 'NON_VEG' && !item.isVeg) ||
              (activeFilter === 'VEGAN' && item.isVegan);

            const matchesMaxPrice = maxPrice === null || item.price <= maxPrice;

            return matchesSearch && matchesFilter && matchesMaxPrice;
          })
          .sort((a, b) => {
            if (priceSort === 'LOW_TO_HIGH') return a.price - b.price;
            if (priceSort === 'HIGH_TO_LOW') return b.price - a.price;
            return 0;
          }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [data, searchQuery, activeFilter, maxPrice, priceSort]);

  const cartCount = itemCount();

  if (isLoading) {
    return <MenuSkeleton />;
  }

  if (error || !data || !data.restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-display font-bold mb-2">Restaurant Not Found</h2>
        <p className="text-muted-foreground">This restaurant may have moved or is temporarily unavailable.</p>
      </div>
    );
  }

  const { restaurant, categories = [] } = data;
  
  const themeColor = isPreview && searchParams?.themeColor ? searchParams.themeColor : (restaurant.themeColor ?? '#E85D04');
  const restaurantName = isPreview && searchParams?.name !== undefined ? searchParams.name : restaurant.name;
  const restaurantDesc = isPreview && searchParams?.description !== undefined ? searchParams.description : restaurant.description;
  const restaurantLogo = isPreview && searchParams?.logo !== undefined ? (searchParams.logo || null) : restaurant.logo;
  const restaurantBanner = isPreview && searchParams?.banner !== undefined ? (searchParams.banner || null) : restaurant.banner;

  return (
    <div className="min-h-screen bg-background pb-28 sm:pb-32 relative w-full max-w-full overflow-x-hidden min-w-0">
      {isPreview && (
        <style>{`
          [data-sonner-toaster], .data-sonner-toaster {
            display: none !important;
          }
        `}</style>
      )}
      {isLocationDisabled && !isPreview && (
        <div className="bg-red-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-bold shadow-lg flex items-center justify-center gap-2 relative z-40 border-b border-red-700">
          <Ban className="w-4 h-4 shrink-0" />
          <span>
            {isHotelRoom
              ? `Room Service Ordering for ${activeLocation ? (activeLocation.toLowerCase().startsWith('room') ? activeLocation : `Room ${activeLocation}`) : 'this room'} is currently disabled by management. Please contact reception.`
              : `Table Ordering for ${activeLocation ? (activeLocation.toLowerCase().startsWith('table') ? activeLocation : `Table ${activeLocation}`) : 'this table'} is currently disabled by management. Please speak with staff.`
            }
          </span>
        </div>
      )}
      {/* Floating Navigation Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent gap-2 min-w-0 max-w-full">
        <div className="flex items-center gap-1.5 text-white drop-shadow-md shrink-0 select-none">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-md text-white" style={{ backgroundColor: themeColor }}>
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-xs sm:text-sm tracking-tight hidden sm:block truncate max-w-[120px] md:max-w-none">{restaurantName || 'Digital Menu'}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto no-scrollbar py-0.5 shrink min-w-0">
          {/* Loyalty Points Header Badge */}
          {loyaltyEnabled && (
            <button
              onClick={() => setShowLoyaltyModal(true)}
              className="text-[10px] sm:text-xs bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/50 text-amber-200 px-2 sm:px-2.5 py-1.5 rounded-lg backdrop-blur-md font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0"
              title="Click to view Loyalty Points details"
            >
              <Gift className="w-3.5 h-3.5 text-amber-300 animate-pulse shrink-0" />
              {activeUser ? (
                <span>⭐ {currentPoints} Pts</span>
              ) : (
                <span>⭐ Points</span>
              )}
            </button>
          )}

          {/* Notifications Bell Button */}
          {activeUser && (
            <button
              onClick={() => setShowNotifModal(true)}
              className="relative p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-all backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5 text-white" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>
          )}

          {activeUser ? (
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <span className="text-xs text-white/90 font-semibold bg-white/10 px-2.5 py-1.5 rounded-lg backdrop-blur-md hidden sm:inline-block">
                Hi, {activeUser.name.split(' ')[0]}
              </span>
              {activeUser.role !== 'CUSTOMER' ? (
                <Link
                  href={activeUser.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/owner/dashboard'}
                  className="text-[10px] sm:text-xs bg-primary hover:bg-primary/95 border border-primary/20 px-2 sm:px-2.5 py-1.5 rounded-lg text-white font-semibold shadow-sm transition-all whitespace-nowrap shrink-0"
                >
                  Dashboard
                </Link>
              ) : null}
              {activeUser.role === 'CUSTOMER' && (
                <button
                  onClick={() => {
                    setActiveTab('history');
                    setTimeout(() => {
                      document.getElementById('orders-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="text-[10px] sm:text-xs bg-white/10 hover:bg-white/20 border border-white/20 px-2 sm:px-2.5 py-1.5 rounded-lg text-white font-semibold shadow-sm transition-all whitespace-nowrap shrink-0"
                >
                  History
                </button>
              )}
              <button
                onClick={() => {
                  logout();
                  toast.success('Logged out successfully');
                }}
                className="text-[10px] sm:text-xs bg-red-500/80 hover:bg-red-500 border border-red-500/20 px-2 sm:px-2.5 py-1.5 rounded-lg text-white font-semibold shadow-sm transition-all whitespace-nowrap shrink-0"
              >
                Logout
              </button>
            </div>
          ) : (
            <>
              <Link
                href={`/login?restaurant=${slug}`}
                className="text-[10px] sm:text-xs bg-primary hover:bg-primary/95 border border-primary/20 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-white font-semibold shadow-sm transition-all whitespace-nowrap shrink-0"
                title="Login is optional for earning loyalty points & order history"
              >
                Login (Optional)
              </Link>
            </>
          )}
          <ThemeToggle size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 shrink-0" />
        </div>
      </div>
      {addonOrderId && (
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-semibold px-4 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span>Adding extra dishes to active Order #{addonOrderNum}. Items fire directly to the kitchen without needing checkout!</span>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('qr_restaurant_addon_order_id');
              sessionStorage.removeItem('qr_restaurant_addon_order_num');
              setAddonOrderId(null);
              setAddonOrderNum(null);
              toast.info('Cancelled adding items to order.');
            }}
            className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg transition-colors font-bold text-[11px] shrink-0 ml-2"
          >
            Cancel Add-on
          </button>
        </div>
      )}
      {locationDisableReason && !isPreview && (
        <div className="bg-red-600 text-white text-xs font-semibold px-4 py-3 flex items-center justify-between shadow-md border-b border-red-700">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{locationDisableReason} Menu browsing is available, but ordering and staff calls are locked.</span>
          </div>
        </div>
      )}
      {/* Banner */}
      <div className="relative h-48 md:h-64 w-full overflow-hidden">
        {restaurantBanner ? (
          <img src={restaurantBanner} alt={restaurantName || 'Banner'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: themeColor }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      </div>

      {/* Restaurant Header Info */}
      <div className="px-4 md:px-8 -mt-16 relative z-10 mb-6 min-w-0 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 min-w-0">
          <div className="flex items-end gap-3.5 min-w-0 flex-1">
            {restaurantLogo ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-4 border-background shadow-xl shrink-0">
                <img src={restaurantLogo} alt={restaurantName || 'Logo'} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-background shadow-xl shrink-0 flex items-center justify-center text-2xl sm:text-3xl text-white font-bold"
                style={{ backgroundColor: themeColor }}>
                {restaurantName?.[0] ?? '🍽️'}
              </div>
            )}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap relative min-w-0">
                <h1 className="font-display text-lg sm:text-2xl md:text-3xl font-bold text-foreground truncate max-w-[170px] min-[400px]:max-w-[240px] sm:max-w-none">
                  {restaurantName}
                </h1>
                
                {/* Interactive Status Badge & Weekly Hours Dropdown */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowHours(!showHours)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold shadow-sm transition-all whitespace-nowrap hover:scale-105 active:scale-95 ${
                      statusInfo.status === 'OPEN'
                        ? 'bg-green-500/10 text-green-600 border border-green-500/20 dark:bg-green-500/20 dark:text-green-400'
                        : statusInfo.status === 'TEMPORARILY_CLOSED'
                        ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'bg-red-500/10 text-red-600 border border-red-500/20 dark:bg-red-500/20 dark:text-red-400'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                      statusInfo.status === 'OPEN'
                        ? 'bg-green-500'
                        : statusInfo.status === 'TEMPORARILY_CLOSED'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`} />
                    <span className="whitespace-nowrap">{statusInfo.badgeText}</span>
                    <span className="text-[10px] opacity-75 font-normal whitespace-nowrap">({statusInfo.detailText})</span>
                    <Clock className="w-3 h-3 ml-0.5 opacity-60 shrink-0" />
                  </button>

                  {/* Dropdown Weekly Hours */}
                  <AnimatePresence>
                    {showHours && restaurant.operatingHours && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowHours(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 mt-2 z-50 w-72 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-4 text-card-foreground"
                        >
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-primary" /> Weekly Hours
                            </h4>
                            <button onClick={() => setShowHours(false)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                              const dayHours = (restaurant.operatingHours as any)?.[day];
                              const isToday = new Date().getDay() === ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day);
                              return (
                                <div
                                  key={day}
                                  className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                                    isToday
                                      ? 'bg-primary/10 text-primary border border-primary/20 font-semibold shadow-sm'
                                      : 'text-muted-foreground'
                                  }`}
                                >
                                  <span className="capitalize">{day}</span>
                                  <span>
                                    {dayHours?.closed || !dayHours?.open
                                      ? 'Closed'
                                      : `${formatTime12h(dayHours.open)} - ${formatTime12h(dayHours.close)}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              {restaurant.cuisineType && (
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 truncate">{restaurant.cuisineType}</p>
              )}
              {displayTableNumber && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold mt-1" style={{ color: themeColor }}>
                  {isHotelRoom ? (
                    <>
                      <Bed className="w-3.5 h-3.5 shrink-0" />
                      {displayTableNumber.toLowerCase().startsWith('room') || displayTableNumber.toLowerCase().startsWith('suite')
                        ? displayTableNumber
                        : `Room ${displayTableNumber}`}
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      Table {displayTableNumber}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Upper Section Responsive Call Waiter / Room Service Button */}
          {(() => {
            const isServiceDisabled =
              (isHotelRoom && isRoomQrDisabledByAdmin) ||
              (!isHotelRoom && isTableQrDisabledByAdmin);
            return (
              <div className="shrink-0 w-full sm:w-auto flex flex-col gap-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: isServiceDisabled ? 1 : 1.02 }}
                  whileTap={{ scale: isServiceDisabled ? 1 : 0.98 }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (isServiceDisabled) {
                      toast.error(isHotelRoom ? 'Hotel room service is currently disabled by administration.' : 'Waiter calling is currently disabled by administration.');
                      return;
                    }
                    if (!displayTableNumber && !manualTableNumber) {
                      setShowTableInput(true);
                      return;
                    }
                    handleCallWaiter(displayTableNumber || manualTableNumber, undefined, customServiceNote);
                  }}
                  disabled={waiterLoading || isServiceDisabled}
                  style={{
                    backgroundColor:
                      isServiceDisabled
                        ? '#64748b'
                        : waiterStatus === 'COMING'
                        ? '#059669'
                        : waiterStatus === 'OCCUPIED'
                        ? '#475569'
                        : waiterStatus === 'PENDING'
                        ? '#f59e0b'
                        : themeColor,
                    borderColor:
                      isServiceDisabled
                        ? '#475569'
                        : waiterStatus === 'COMING'
                        ? '#047857'
                        : waiterStatus === 'OCCUPIED'
                        ? '#334155'
                        : waiterStatus === 'PENDING'
                        ? '#d97706'
                        : 'transparent',
                    opacity: isServiceDisabled ? 0.65 : 1,
                  }}
                  className={`w-full sm:w-auto px-5 py-3 rounded-2xl sm:rounded-full text-white font-extrabold text-sm sm:text-base shadow-xl flex items-center justify-center gap-2 transition-all border whitespace-nowrap hover:opacity-95 ${isServiceDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <BellRing className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${!isServiceDisabled && (waiterStatus === 'COMING' || waiterStatus === 'PENDING') ? 'animate-pulse' : waiterStatus === 'OCCUPIED' || isServiceDisabled ? '' : 'animate-bounce'}`} />
                  <span className="tracking-wide font-bold whitespace-nowrap">
                    {waiterLoading
                      ? 'Sending Request...'
                      : isServiceDisabled
                      ? (isHotelRoom ? 'Room Service Disabled' : 'Waiter Call Disabled')
                      : waiterStatus === 'PENDING'
                      ? `${isHotelRoom ? 'Request Sent' : 'Waiter Call Sent'} (${waiterPendingTimer}s)`
                      : waiterStatus === 'COMING'
                      ? `${isHotelRoom ? 'Staff Coming' : 'Waiter Coming'} (${waiterComingTimer}s)`
                      : waiterStatus === 'OCCUPIED'
                      ? `Staff Busy (retry in ${waiterCooldown}s)`
                      : isHotelRoom
                      ? 'Call Room Service'
                      : 'Call Waiter'}
                  </span>
                </motion.button>

                {/* Extra notes input directly below button */}
                {!isServiceDisabled && waiterStatus === 'IDLE' && (
                  <div className="relative w-full sm:min-w-[260px]">
                    <input
                      type="text"
                      value={customServiceNote}
                      onChange={(e) => setCustomServiceNote(e.target.value)}
                      placeholder={isHotelRoom ? "Add extra note (e.g. water, towels)..." : "Add extra note (e.g. water, bill, napkins)..."}
                      maxLength={120}
                      className="w-full text-xs px-3.5 py-2 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-xs"
                    />
                    {customServiceNote && (
                      <button
                        type="button"
                        onClick={() => setCustomServiceNote('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Minimum order info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 25–35 min</span>
          <span>Min order: ₹{restaurant.minOrderValue}</span>
          <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 4.5</span>
        </div>
      </div>

      {/* Active/Recent Orders & History Section */}
      {((activeOrdersDetails && activeOrdersDetails.length > 0) || activeUser || (previousOrders && previousOrders.length > 0)) && (
        <div id="orders-section" className="px-4 md:px-8 mb-6 space-y-3">
          {/* Header & Tabs */}
          {!activeUser ? (
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Active Orders ({activeOrdersDetails?.length ?? 0})
              </h3>
              <span className="text-[10px] text-muted-foreground animate-pulse">Auto-updating...</span>
            </div>
          ) : (
            <div className="flex items-center justify-between border-b border-border">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('active')}
                  style={activeTab === 'active' ? { borderColor: themeColor, color: themeColor } : {}}
                  className={`pb-2 font-display font-bold text-sm tracking-tight transition-all border-b-2 ${
                    activeTab === 'active'
                      ? 'font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Active Orders ({activeOrdersDetails?.length ?? 0})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  style={activeTab === 'history' ? { borderColor: themeColor, color: themeColor } : {}}
                  className={`pb-2 font-display font-bold text-sm tracking-tight transition-all border-b-2 ${
                    activeTab === 'history'
                      ? 'font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Past Orders ({previousOrders?.length ?? 0})
                </button>
              </div>
              {activeTab === 'active' && (
                <span className="text-[10px] text-muted-foreground animate-pulse mb-2">Auto-updating...</span>
              )}
            </div>
          )}
          {/* Tab Content: Active Orders */}
          {(activeTab === 'active' || !activeUser) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {!activeOrdersDetails || activeOrdersDetails.length === 0 ? (
                <div className="sm:col-span-2 py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl bg-card">
                  No active orders right now
                </div>
              ) : (
                activeOrdersDetails.map((order: any) => {
                  if (!order) return null;
                  const statusDetails = getOrderStatusDetails(order.status);

                  return (
                    <div
                      key={order.id}
                      className="relative group bg-card hover:bg-card/85 border border-border rounded-2xl p-4 shadow-sm transition-all duration-200"
                    >
                      {['DELIVERED', 'CANCELLED'].includes(order.status) && (
                        <button
                          onClick={() => handleDismissOrder(order.id)}
                          className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      <Link href={`/r/${slug}/order/${order.id}`} className="block space-y-3">
                        <div className="flex items-center justify-between pr-6">
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Order #{order.id.slice(-8).toUpperCase()}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDetails.color}`}>
                            {statusDetails.label}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {order.items?.map((item: any) => {
                              const addOnsLabel = item.addOns && item.addOns.length > 0 ? ` (+ ${item.addOns.map((ao: any) => ao.name).join(', ')})` : '';
                              return `${item.menuItem.name}${addOnsLabel} × ${item.quantity}`;
                            }).join(', ')}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>₹{order.total.toFixed(0)}</span>
                            <span>•</span>
                            <span>
                              {order.paymentStatus === 'PAID' ? (
                                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                  ✅ Paid ({order.paymentMethod === 'RAZORPAY' ? 'Online' : order.paymentMethod === 'COD' ? 'Counter' : 'Waiter'})
                                </span>
                              ) : (
                                <span className="font-extrabold text-amber-600 dark:text-amber-400 animate-pulse">
                                  ⏳ Payment Pending ({order.paymentMethod === 'RAZORPAY' ? 'Online' : order.paymentMethod === 'COD' ? 'Pay on Counter' : 'Pay to Waiter'})
                                </span>
                              )}
                            </span>
                            {order.tableNumber ? (
                              <>
                                <span>•</span>
                                <span className="font-semibold text-primary">
                                  {isHotelRoom || order.tableNumber.toLowerCase().includes('room')
                                    ? (order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`)
                                    : (order.tableNumber.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`)}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span>Delivery</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 ease-out"
                              style={{
                                width: `${statusDetails.progress}%`,
                                backgroundColor: order.status === 'CANCELLED' ? '#ef4444' : themeColor,
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                          <span>Track Live Status</span>
                          <ChevronRight className="w-3.5 h-3.5" style={{ color: themeColor }} />
                        </div>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab Content: Order History */}
          {activeTab === 'history' && activeUser && (
            <div className="grid gap-3 sm:grid-cols-2">
              {!previousOrders || previousOrders.length === 0 ? (
                <div className="sm:col-span-2 py-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl bg-card">
                  No previous orders found at this restaurant
                </div>
              ) : (
                previousOrders.map((order: any) => {
                  if (!order) return null;
                  const statusDetails = getOrderStatusDetails(order.status);

                  return (
                    <div
                      key={order.id}
                      className="group bg-card hover:bg-card/85 border border-border rounded-2xl p-4 shadow-sm transition-all duration-200"
                    >
                      <Link href={`/r/${slug}/order/${order.id}`} className="block space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Order #{order.id.slice(-8).toUpperCase()}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()} at{' '}
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusDetails.color}`}>
                            {statusDetails.label}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {order.items?.map((item: any) => {
                              const addOnsLabel = item.addOns && item.addOns.length > 0 ? ` (+ ${item.addOns.map((ao: any) => ao.name).join(', ')})` : '';
                              return `${item.menuItem.name}${addOnsLabel} × ${item.quantity}`;
                            }).join(', ')}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>₹{order.total.toFixed(0)}</span>
                            <span>•</span>
                            <span>
                              {order.paymentMethod === 'RAZORPAY' ? 'Paid Online' : order.paymentMethod === 'COD' ? 'Pay on Counter' : order.paymentMethod === 'PAY_TO_WAITER' ? 'Pay to Waiter' : 'Wallet'}
                            </span>
                            {order.tableNumber ? (
                              <>
                                <span>•</span>
                                <span className="font-semibold text-primary">
                                  {isHotelRoom || order.tableNumber.toLowerCase().includes('room')
                                    ? (order.tableNumber.toLowerCase().startsWith('room') ? order.tableNumber : `Room ${order.tableNumber}`)
                                    : (order.tableNumber.toLowerCase().startsWith('table') ? order.tableNumber : `Table ${order.tableNumber}`)}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span>Delivery</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                          <span>View Order Details & Invoice</span>
                          <ChevronRight className="w-3.5 h-3.5" style={{ color: themeColor }} />
                        </div>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Recommendations (logged-in only) */}
      {activeUser && activeUser.role === 'CUSTOMER' && (
        <div className="px-4 md:px-8 mb-4">
          <AIRecommendations restaurantId={restaurant.id} themeColor={themeColor} />
        </div>
      )}

      {/* Search and Filters */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 md:px-8 py-3">
        <div className="flex gap-3 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-muted rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {/* Interactive Filter Button */}
          <button
            onClick={() => setShowFilterDrawer((prev) => !prev)}
            className={`relative p-2.5 rounded-xl border transition-all active:scale-95 flex items-center justify-center shrink-0 ${
              hasActiveFilters
                ? 'text-white shadow-md'
                : 'bg-muted text-muted-foreground hover:text-foreground border-transparent'
            }`}
            style={hasActiveFilters ? { backgroundColor: themeColor } : {}}
            title="Filter & Sort Menu"
          >
            <Filter className="w-4 h-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping border border-background" />
            )}
          </button>
        </div>

        {/* Filter Popup Panel */}
        <AnimatePresence>
          {showFilterDrawer && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mb-3 bg-card border border-border rounded-2xl p-4 shadow-xl space-y-4 text-card-foreground overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h4 className="font-display font-bold text-sm flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" style={{ color: themeColor }} /> Menu Filters & Sorting
                </h4>
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setActiveFilter('ALL');
                      setMaxPrice(null);
                      setPriceSort('DEFAULT');
                      setSearchQuery('');
                    }}
                    className="text-xs font-semibold text-red-500 hover:underline"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>

              {/* Dietary Filter */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">Dietary Type</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'ALL', label: 'All Items' },
                    { key: 'VEG', label: '🟢 Veg Only' },
                    { key: 'NON_VEG', label: '🔴 Non-Veg' },
                    { key: 'VEGAN', label: '🌿 Vegan' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setActiveFilter(f.key as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        activeFilter === f.key
                          ? 'text-white border-transparent shadow-sm'
                          : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                      style={activeFilter === f.key ? { backgroundColor: themeColor } : {}}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Price Filter */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">Max Budget Price</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Any Price', val: null },
                    { label: 'Under ₹150', val: 150 },
                    { label: 'Under ₹250', val: 250 },
                    { label: 'Under ₹500', val: 500 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setMaxPrice(p.val)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        maxPrice === p.val
                          ? 'text-white border-transparent shadow-sm'
                          : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                      style={maxPrice === p.val ? { backgroundColor: themeColor } : {}}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sorting Options */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">Sort By Price</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'DEFAULT', label: 'Default Order' },
                    { key: 'LOW_TO_HIGH', label: 'Price: Low to High 📈' },
                    { key: 'HIGH_TO_LOW', label: 'Price: High to Low 📉' },
                  ].map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setPriceSort(s.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        priceSort === s.key
                          ? 'text-white border-transparent shadow-sm'
                          : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                      style={priceSort === s.key ? { backgroundColor: themeColor } : {}}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => setShowFilterDrawer(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-xl text-xs font-extrabold text-foreground transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Veg/Non-veg filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar scrollbar-hide pb-1 pr-6 whitespace-nowrap flex-nowrap min-w-0 max-w-full">
          {(['ALL', 'VEG', 'NON_VEG', 'VEGAN'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeFilter === filter
                  ? 'text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              style={activeFilter === filter ? { backgroundColor: themeColor } : {}}
            >
              {filter === 'ALL' ? 'All Items' : filter === 'VEG' ? '🟢 Veg' : filter === 'NON_VEG' ? '🔴 Non-Veg' : '🌿 Vegan'}
            </button>
          ))}

          <div className="w-px bg-border mx-1 flex-shrink-0" />

          {/* Category quick jump */}
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat.id
                  ? 'text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
              style={activeCategory === cat.id ? { backgroundColor: themeColor } : {}}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Categories */}
      <div className="px-4 md:px-8 pt-4 space-y-8">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="font-display font-semibold text-lg mb-2">No items found</h3>
            <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} id={`cat-${category.id}`}>
              <h2 className="font-display text-xl font-bold mb-4">{category.name}</h2>
              <div className="grid gap-4">
                {category.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    themeColor={themeColor}
                    restaurantId={restaurant.id}
                    restaurantSlug={slug}
                    layoutStyle={(searchParams?.layout as any) || (restaurant.menuTemplate as any) || 'modern'}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Button */}
      <AnimatePresence>
        {cartCount > 0 && !cartOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-6 sm:right-6 z-40"
          >
            <button
              onClick={() => {
                if (isLocationDisabled) {
                  toast.error(`QR ordering for ${activeLocation || 'this restaurant'} is currently disabled by management.`);
                  return;
                }
                setCartOpen(true);
              }}
              className="w-full flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl text-white shadow-[0_10px_30px_rgba(0,0,0,0.4)] hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer border-2 border-white/30 backdrop-blur-md"
              style={{ backgroundColor: themeColor }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-sm font-bold shadow-inner shrink-0">
                  {cartCount}
                </div>
                <span className="font-semibold text-base sm:text-lg tracking-wide truncate">
                  {addonOrderId ? `⚡ Add to Order #${addonOrderNum}` : 'View Cart'}
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-bold text-base sm:text-lg">₹{getCartTotal().toFixed(0)}</span>
                <ShoppingCart className="w-5 h-5" />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        restaurantSlug={slug}
        tableNumber={displayTableNumber}
        tableToken={tableToken}
        isTableVerified={isTableVerified}
        themeColor={themeColor}
      />

      {/* AI Chatbot */}
      <AnimatePresence>
        {chatOpen && (
          <AIChatbot
            restaurantId={restaurant.id}
            restaurantName={restaurantName}
            themeColor={themeColor}
            onClose={() => setChatOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Simple Table / Room Number Input Modal ONLY when QR was not scanned and no table is known */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showTableInput && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pointer-events-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-card border border-border rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 text-foreground"
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                      style={{ backgroundColor: themeColor }}
                    >
                      <BellRing className="w-4 h-4" />
                    </div>
                    <h3 className="font-display font-bold text-sm text-foreground">
                      {isHotelRoom ? 'Enter Hotel Room Number' : 'Enter Table Number'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowTableInput(false)}
                    className="p-1.5 rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    {isHotelRoom ? 'Hotel Room Number / Suite' : 'Table Number'}
                  </label>
                  <input
                    type="text"
                    placeholder={isHotelRoom ? 'e.g. 101, 204, Suite 3' : 'e.g. 5, 12, A2'}
                    value={manualTableNumber}
                    onChange={(e) => setManualTableNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground font-semibold"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTableInput(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!manualTableNumber.trim()) {
                        toast.error(isHotelRoom ? 'Please enter your room number' : 'Please enter your table number');
                        return;
                      }
                      setShowTableInput(false);
                      handleCallWaiter(manualTableNumber.trim(), undefined, customServiceNote);
                    }}
                    style={{ backgroundColor: themeColor }}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-all hover:opacity-95 cursor-pointer"
                  >
                    {isHotelRoom ? 'Call Room Service' : 'Call Waiter'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Floating Action Buttons — right column */}
      <div className={`fixed ${cartCount > 0 && !cartOpen ? 'bottom-20 sm:bottom-24' : 'bottom-4 sm:bottom-6'} right-3 sm:right-6 z-40 flex flex-col gap-2.5 items-end transition-all duration-300 pointer-events-auto`}>
        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-background/95 backdrop-blur-md border border-border/80 shadow-xl flex items-center justify-center hover:bg-muted transition-all active:scale-95 text-foreground cursor-pointer"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        )}


        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 border-2 border-white/30 backdrop-blur-md cursor-pointer"
            style={{ backgroundColor: themeColor }}
            title="Ask AI Assistant"
          >
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>

      {/* AI Assistant Chatbot Window */}
      <AnimatePresence>
        {chatOpen && (
          <AIChatbot
            restaurantId={restaurant?.id || ''}
            restaurantName={restaurant?.name || searchParams?.name || 'Restaurant'}
            themeColor={themeColor}
            onClose={() => setChatOpen(false)}
            onSearchDish={(dishName) => {
              setSearchQuery(dishName);
              setChatOpen(false);
              const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
              if (searchInput) {
                searchInput.focus();
              }
            }}
            onSelectCategory={(catName) => {
              setActiveCategory(catName);
              setChatOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Loyalty Points Instructions & Info Modal */}
      <AnimatePresence>
        {showLoyaltyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative overflow-hidden text-foreground"
            >
              <button
                onClick={() => setShowLoyaltyModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg flex-shrink-0">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">⭐ Customer Loyalty Program</h3>
                  <p className="text-xs text-muted-foreground">Earn rewards on every meal order!</p>
                </div>
              </div>

              {/* Current Balance Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/30 space-y-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Your Balance</p>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {activeUser ? `${currentPoints} Points` : '0 Points'}
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    ₹{(currentPoints / (Number(loyaltySettings?.pointsPerDiscountRupee) || 50)).toFixed(2)} Value
                  </p>
                </div>
                {!activeUser && (
                  <p className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold mt-1">
                    🔑 Log in to start earning and redeeming loyalty points!
                  </p>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-foreground uppercase tracking-wider text-[11px]">How Loyalty Points Work:</h4>
                
                <div className="p-3 bg-muted/40 rounded-xl space-y-1 border border-border/40">
                  <p className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    💳 Conversion Ratio
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {loyaltySettings?.conversionRuleText || '50 Loyalty Points = ₹1.00 Discount. Every 50 points saved gives you ₹1 off your total bill!'}
                  </p>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl space-y-1 border border-emerald-200 dark:border-emerald-900/40">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    📈 How Points Increase (+)
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {loyaltySettings?.increaseRuleText || 'Earn 1 point for every ₹10 spent. Points are credited to your account when the restaurant owner completes/confirms payment on your order.'}
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl space-y-1 border border-blue-200 dark:border-blue-900/40">
                  <p className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    📉 How Points Decrease (-)
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {loyaltySettings?.decreaseRuleText || 'When placing an order, tick "Redeem Loyalty Points" on checkout. Points are deducted to give you an instant bill discount!'}
                  </p>
                </div>
              </div>

              {!activeUser ? (
                <Link
                  href={`/login?restaurant=${slug}`}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-bold text-xs shadow-md block"
                >
                  Log In to Access Loyalty Points
                </Link>
              ) : (
                <button
                  onClick={() => setShowLoyaltyModal(false)}
                  className="w-full py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs transition-colors"
                >
                  Close
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Notification Modal */}
      <CustomerNotificationModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
      />

      {/* Customer Real-Time Alert Modal */}
      <CustomerAlertModal
        data={customerAlert}
        onClose={() => setCustomerAlert(null)}
      />
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-48 skeleton" />
      <div className="px-4 pt-4 space-y-4">
        <div className="flex gap-4">
          <div className="w-20 h-20 skeleton rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="h-7 skeleton rounded-lg w-2/3" />
            <div className="h-4 skeleton rounded-lg w-1/2" />
          </div>
        </div>
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-10 skeleton rounded-xl" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 skeleton rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
