'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings, UtensilsCrossed, LayoutDashboard, ShoppingBag, Tag, BarChart3, LogOut,
  Menu, Save, Globe, Phone, MapPin, Clock, Palette, QrCode, Download, CreditCard, Banknote, Building2, Smartphone, Star, Printer,
  Upload, Trash2, CheckCircle2, Sparkles, RefreshCw, FileImage, Info, Bed, Power, Ban, Plus, Check, Lock, X
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import { getImageUrl } from '@/lib/image';
import { DAYS_OF_WEEK } from '@/utils/operatingHours';
import QRCode from 'qrcode';
import { downloadPlacardImage, printPlacard, formatLocationBadgeText } from '@/utils/qrPlacard';
import { generateUniqueTableCode } from '@/utils/tableCode';
import { TableQrGallery } from './TableQrGallery';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/owner/dashboard' },
  { label: 'Menu', icon: UtensilsCrossed, href: '/owner/menu' },
  { label: 'Orders', icon: ShoppingBag, href: '/owner/orders' },
  { label: 'Coupons', icon: Tag, href: '/owner/coupons' },
  { label: 'Reviews', icon: Star, href: '/owner/reviews' },
  { label: 'Analytics', icon: BarChart3, href: '/owner/analytics' },
  { label: 'Customize', icon: Palette, href: '/owner/customize' },
  { label: 'Settings', icon: Settings, href: '/owner/settings' },
];

type OperatingHoursDay = {
  open: string;
  close: string;
  closed: boolean;
};

type OperatingHours = {
  monday: OperatingHoursDay;
  tuesday: OperatingHoursDay;
  wednesday: OperatingHoursDay;
  thursday: OperatingHoursDay;
  friday: OperatingHoursDay;
  saturday: OperatingHoursDay;
  sunday: OperatingHoursDay;
};

type Restaurant = {
  id: string; name: string; slug: string; description: string | null;
  phone: string | null; address: string | null; city: string | null;
  state: string | null; country: string | null; pincode: string | null;
  themeColor: string | null;
  logo: string | null; banner: string | null; isOpen: boolean;
  hasDelivery: boolean;
  operatingHours: OperatingHours | null;
  platformType?: string;
  featureFlags?: {
    roomServiceEnabled?: boolean;
    callWaiterEnabled?: boolean;
    tableQrEnabled?: boolean;
    roomQrEnabled?: boolean;
    [key: string]: any;
  } | null;
  // Direct & UPI payment settings
  paymentEnabled?: boolean;
  upiEnabled?: boolean;
  merchantName?: string | null;
  paymentQrCode: string | null;
  paymentUpiId: string | null;
  paymentPhone: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountHolder: string | null;
  qrSettings?: { enabled?: boolean; disabledLocations?: string[]; customLocations?: string[]; deletedLocations?: string[] } | null;
};

export function OwnerSettingsPage() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form, setForm] = useState<Partial<Restaurant>>({});
  const formInitialized = useRef(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [paymentQrPreviewUrl, setPaymentQrPreviewUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [qrMode, setQrMode] = useState<'TABLE' | 'ROOM'>('TABLE');
  const [roomNumber, setRoomNumber] = useState('');
  const [newCustomLocation, setNewCustomLocation] = useState('');
  const [qrSettings, setQrSettings] = useState<{
    enabled: boolean;
    disabledLocations: string[];
    customLocations: string[];
    deletedLocations: string[];
  }>({
    enabled: true,
    disabledLocations: [],
    customLocations: [],
    deletedLocations: [],
  });

  const handleAddCustomLocation = () => {
    const val = newCustomLocation.trim();
    if (!val) {
      toast.error('Please enter a location name (e.g. Room 305, Pool Bar)');
      return;
    }

    const currentCustoms = qrSettings.customLocations || [];
    const exists = currentCustoms.some(
      (loc) => loc.trim().toLowerCase() === val.toLowerCase()
    );

    if (exists) {
      toast.error(`Location "${val}" already exists!`);
      return;
    }

    const updatedCustoms = [...currentCustoms, val];
    setQrSettings((prev) => ({
      ...prev,
      customLocations: updatedCustoms,
    }));

    setNewCustomLocation('');
    toast.success(`Custom location "${val}" added! Click "Save Settings" to save.`);

    if (data?.platformType === 'HOTEL') {
      setQrMode('ROOM');
      setRoomNumber(val);
    } else if (data?.platformType === 'RESTAURANT') {
      setQrMode('TABLE');
      setTableNumber(val);
    } else {
      if (val.toLowerCase().startsWith('room') || val.toLowerCase().includes('suite') || val.toLowerCase().includes('bed')) {
        setQrMode('ROOM');
        setRoomNumber(val);
      } else {
        setQrMode('TABLE');
        setTableNumber(val);
      }
    }
  };

  const handleGenerateAndSaveTable = () => {
    const val = tableNumber.trim();
    if (!val) {
      toast.error('Please enter a table number (e.g. 11, Patio 2)');
      return;
    }

    const formattedName = val.toLowerCase().startsWith('table') ? val : `Table ${val}`;
    const cleanNumber = val.replace(/^(table)\s+/i, '').trim();

    const isAlreadyInDefaults = ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 10']
      .some((d) => d.toLowerCase() === formattedName.toLowerCase());

    const currentCustoms = qrSettings.customLocations || [];
    const existsInCustoms = currentCustoms.some(
      (loc) => loc.trim().toLowerCase() === formattedName.toLowerCase()
    );

    let updatedCustoms = currentCustoms;
    if (!isAlreadyInDefaults && !existsInCustoms) {
      updatedCustoms = [...currentCustoms, formattedName];
    }

    const currentDeleted = qrSettings.deletedLocations || [];
    const updatedDeleted = currentDeleted.filter(
      (d) => d.trim().toLowerCase() !== formattedName.toLowerCase()
    );

    const nextSettings = {
      ...qrSettings,
      customLocations: updatedCustoms,
      deletedLocations: updatedDeleted,
    };

    setQrSettings(nextSettings);
    setTableNumber(cleanNumber);

    saveMutation.mutate(nextSettings);
    toast.success(`${formattedName} QR code generated & saved permanently! 🎉`);
  };

  const handleGenerateAndSaveRoom = () => {
    const val = roomNumber.trim();
    if (!val) {
      toast.error('Please enter a room number (e.g. 105, Suite 4)');
      return;
    }

    const formattedName = val.toLowerCase().startsWith('room') || val.toLowerCase().includes('suite') ? val : `Room ${val}`;
    const cleanNumber = val.replace(/^(room)\s+/i, '').trim();

    const isAlreadyInDefaults = ['Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 201', 'Room 202']
      .some((d) => d.toLowerCase() === formattedName.toLowerCase());

    const currentCustoms = qrSettings.customLocations || [];
    const existsInCustoms = currentCustoms.some(
      (loc) => loc.trim().toLowerCase() === formattedName.toLowerCase()
    );

    let updatedCustoms = currentCustoms;
    if (!isAlreadyInDefaults && !existsInCustoms) {
      updatedCustoms = [...currentCustoms, formattedName];
    }

    const currentDeleted = qrSettings.deletedLocations || [];
    const updatedDeleted = currentDeleted.filter(
      (d) => d.trim().toLowerCase() !== formattedName.toLowerCase()
    );

    const nextSettings = {
      ...qrSettings,
      customLocations: updatedCustoms,
      deletedLocations: updatedDeleted,
    };

    setQrSettings(nextSettings);
    setRoomNumber(cleanNumber);

    saveMutation.mutate(nextSettings);
    toast.success(`${formattedName} QR code generated & saved permanently! 🎉`);
  };

  const handleRemoveLocation = (locToRemove: string) => {
    const norm = locToRemove.trim().toLowerCase();
    const updatedCustoms = (qrSettings.customLocations || []).filter(
      (l) => l.trim().toLowerCase() !== norm
    );
    const updatedDisabled = (qrSettings.disabledLocations || []).filter(
      (l) => l.trim().toLowerCase() !== norm
    );
    const currentDeleted = qrSettings.deletedLocations || [];
    const updatedDeleted = currentDeleted.some((d) => d.trim().toLowerCase() === norm)
      ? currentDeleted
      : [...currentDeleted, locToRemove];

    const nextSettings = {
      ...qrSettings,
      customLocations: updatedCustoms,
      disabledLocations: updatedDisabled,
      deletedLocations: updatedDeleted,
    };

    setQrSettings(nextSettings);
    saveMutation.mutate(nextSettings);
    toast.success(`Deleted QR code for "${locToRemove}"`);

    const cleanActive = (activeLocationStr || '').trim().toLowerCase();
    const cleanRemoved = locToRemove.replace(/^(Table|Room)\s+/i, '').trim().toLowerCase();
    if (cleanActive === cleanRemoved || cleanActive === norm) {
      setTableNumber('');
      setRoomNumber('');
    }
  };

  const handleRemoveCustomLocation = handleRemoveLocation;

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [operatingHours, setOperatingHours] = useState<OperatingHours>({
    monday: { open: '11:00', close: '23:00', closed: false },
    tuesday: { open: '11:00', close: '23:00', closed: false },
    wednesday: { open: '11:00', close: '23:00', closed: false },
    thursday: { open: '11:00', close: '23:00', closed: false },
    friday: { open: '11:00', close: '23:30', closed: false },
    saturday: { open: '10:00', close: '23:30', closed: false },
    sunday: { open: '10:00', close: '22:30', closed: false },
  });

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setLogoPreviewUrl(null);
      };
    }
  }, [logoFile]);

  useEffect(() => {
    if (bannerFile) {
      const url = URL.createObjectURL(bannerFile);
      setBannerPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setBannerPreviewUrl(null);
      };
    }
  }, [bannerFile]);

  useEffect(() => {
    if (paymentQrFile) {
      const url = URL.createObjectURL(paymentQrFile);
      setPaymentQrPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPaymentQrPreviewUrl(null);
      };
    }
  }, [paymentQrFile]);

  const [dynamicQrPreviewUrl, setDynamicQrPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const upiId = form.paymentUpiId?.trim();
    if (upiId && /^[\w.-]+@[\w.-]+$/.test(upiId)) {
      const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(form.merchantName || form.name || 'Restaurant')}&cu=INR`;
      QRCode.toDataURL(upiString, { width: 260, margin: 1 })
        .then((url) => setDynamicQrPreviewUrl(url))
        .catch(() => setDynamicQrPreviewUrl(null));
    } else {
      setDynamicQrPreviewUrl(null);
    }
  }, [form.paymentUpiId, form.merchantName, form.name]);

  const { data, isLoading } = useQuery({
    queryKey: ['owner-restaurant'],
    queryFn: async () => {
      const res = await api.get('/owner/restaurant');
      return res.data.data.restaurant as Restaurant;
    },
    enabled: !!user && user.role === 'RESTAURANT_OWNER',
  });

  // Permissions controlled globally or per-restaurant by Super Admin
  const isTableQrAllowed =
    data?.platformType !== 'HOTEL' &&
    data?.featureFlags?.tableQrEnabled !== false;

  const isRoomQrAllowed =
    data?.platformType !== 'RESTAURANT' &&
    data?.featureFlags?.roomQrEnabled !== false;

  // Auto-switch QR mode if one mode has been disabled by Admin or based on platformType
  useEffect(() => {
    if (data) {
      if (data.platformType === 'HOTEL') {
        setQrMode('ROOM');
      } else if (data.platformType === 'RESTAURANT') {
        setQrMode('TABLE');
      } else {
        if (!isTableQrAllowed && isRoomQrAllowed) {
          setQrMode('ROOM');
        } else if (!isRoomQrAllowed && isTableQrAllowed) {
          setQrMode('TABLE');
        }
      }
    }
  }, [data, isTableQrAllowed, isRoomQrAllowed]);

  useEffect(() => {
    // Only initialize the form ONCE from server data (on first load)
    // Subsequent refetches should NOT overwrite what the user has typed
    if (data && !formInitialized.current) {
      formInitialized.current = true;
      setForm(data);
      if (data.operatingHours) {
        setOperatingHours(data.operatingHours);
      }
      if (data.qrSettings) {
        setQrSettings({
          enabled: data.qrSettings.enabled ?? true,
          disabledLocations: Array.isArray(data.qrSettings.disabledLocations) ? data.qrSettings.disabledLocations : [],
          customLocations: Array.isArray(data.qrSettings.customLocations) ? data.qrSettings.customLocations : [],
          deletedLocations: Array.isArray(data.qrSettings.deletedLocations) ? data.qrSettings.deletedLocations : [],
        });
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (customQrSettings?: { enabled: boolean; disabledLocations: string[]; customLocations: string[]; deletedLocations?: string[] } | void) => {
      const activeQrSettings = customQrSettings || qrSettings;
      const payload: Record<string, any> = {
        name: form.name ? form.name.trim() : undefined,
        slug: form.slug ? form.slug.trim() : undefined,
        description: form.description ?? null,
        phone: form.phone ?? null,
        address: form.address ?? null,
        city: form.city ?? null,
        state: form.state ?? null,
        country: form.country ?? null,
        pincode: form.pincode ?? null,
        hasDelivery: form.hasDelivery,
        operatingHours: operatingHours,
        themeColor: form.themeColor ?? null,
        paymentEnabled: form.paymentEnabled ?? true,
        upiEnabled: form.upiEnabled ?? true,
        merchantName: form.merchantName ?? null,
        paymentQrCode: form.paymentQrCode ?? null,
        paymentUpiId: form.paymentUpiId ?? null,
        paymentPhone: form.paymentPhone ?? null,
        bankName: form.bankName ?? null,
        bankAccountNumber: form.bankAccountNumber ?? null,
        bankIfsc: form.bankIfsc ?? null,
        bankAccountHolder: form.bankAccountHolder ?? null,
        qrSettings: {
          ...activeQrSettings,
          customLocations: (activeQrSettings.customLocations || []).filter(
            (loc) => ![
              'table 1', 'table 2', 'table 3', 'table 4', 'table 5', 'table 10',
              'room 101', 'room 102', 'room 103', 'room 104', 'room 201', 'room 202'
            ].includes(loc.trim().toLowerCase())
          ),
          deletedLocations: activeQrSettings.deletedLocations || [],
        },
      };
      const res = await api.put('/owner/restaurant', payload);
      return res.data.data.restaurant;
    },
    onSuccess: (updatedRestaurant) => {
      if (updatedRestaurant) {
        setForm(updatedRestaurant);
        if (updatedRestaurant.operatingHours) {
          setOperatingHours(updatedRestaurant.operatingHours);
        }
        if (updatedRestaurant.qrSettings) {
          setQrSettings({
            enabled: updatedRestaurant.qrSettings.enabled ?? true,
            disabledLocations: Array.isArray(updatedRestaurant.qrSettings.disabledLocations) ? updatedRestaurant.qrSettings.disabledLocations : [],
            customLocations: Array.isArray(updatedRestaurant.qrSettings.customLocations) ? updatedRestaurant.qrSettings.customLocations : [],
            deletedLocations: Array.isArray(updatedRestaurant.qrSettings.deletedLocations) ? updatedRestaurant.qrSettings.deletedLocations : [],
          });
        }
        formInitialized.current = true;
      }

      if (updatedRestaurant?.slug && updatedRestaurant.slug !== data?.slug) {
        toast.success(
          `✅ URL updated! New customer link: ${window.location.origin}/r/${updatedRestaurant.slug}`,
          { duration: 8000 }
        );
      } else {
        toast.success('Settings saved!');
      }
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Failed to save settings';
      toast.error(msg);
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) return;
      const fd = new FormData();
      fd.append('logo', logoFile);
      const res = await api.post('/owner/restaurant/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data.data.logo as string;
    },
    onSuccess: (newUrl) => {
      if (newUrl) setForm(f => ({ ...f, logo: newUrl }));
      toast.success('Logo uploaded!');
      setLogoFile(null);
      setLogoPreviewUrl(null);
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
    },
    onError: () => toast.error('Failed to upload logo'),
  });

  const uploadBannerMutation = useMutation({
    mutationFn: async () => {
      if (!bannerFile) return;
      const fd = new FormData();
      fd.append('banner', bannerFile);
      const res = await api.post('/owner/restaurant/banner', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data.data.banner as string;
    },
    onSuccess: (newUrl) => {
      if (newUrl) setForm(f => ({ ...f, banner: newUrl }));
      toast.success('Banner uploaded!');
      setBannerFile(null);
      setBannerPreviewUrl(null);
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
    },
    onError: () => toast.error('Failed to upload banner'),
  });

  const uploadPaymentQrMutation = useMutation({
    mutationFn: async () => {
      if (!paymentQrFile) return;
      const fd = new FormData();
      fd.append('paymentQr', paymentQrFile);
      const res = await api.post('/owner/restaurant/payment-qr', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data.data.paymentQrCode as string;
    },
    onSuccess: (newUrl) => {
      toast.success('Payment QR uploaded!');
      setForm(f => ({ ...f, paymentQrCode: newUrl }));
      setPaymentQrFile(null);
      setPaymentQrPreviewUrl(null);
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
    },
    onError: () => toast.error('Failed to upload payment QR'),
  });

  const savePaymentDetailsMutation = useMutation({
    mutationFn: async (overrideQrCode?: string) => {
      const qrCodeToSave = overrideQrCode !== undefined ? overrideQrCode : (form.paymentQrCode ?? null);
      const res = await api.put('/owner/restaurant', {
        name: form.name ?? '',
        paymentEnabled: form.paymentEnabled ?? true,
        upiEnabled: form.upiEnabled ?? true,
        merchantName: form.merchantName ?? null,
        paymentQrCode: qrCodeToSave,
        paymentUpiId: form.paymentUpiId ?? null,
        paymentPhone: form.paymentPhone ?? null,
        bankName: form.bankName ?? null,
        bankAccountNumber: form.bankAccountNumber ?? null,
        bankIfsc: form.bankIfsc ?? null,
        bankAccountHolder: form.bankAccountHolder ?? null,
      });
      return res.data.data.restaurant;
    },
    onSuccess: (updated) => {
      toast.success('Payment details saved!');
      if (updated) setForm(updated);
      qc.invalidateQueries({ queryKey: ['owner-restaurant'] });
    },
    onError: () => toast.error('Failed to save payment details'),
  });

  const handleSavePaymentDetails = async () => {
    try {
      let qrUrl = form.paymentQrCode;
      if (paymentQrFile) {
        const uploadedUrl = await uploadPaymentQrMutation.mutateAsync();
        if (uploadedUrl) qrUrl = uploadedUrl;
      }
      await savePaymentDetailsMutation.mutateAsync(qrUrl ?? undefined);
    } catch {
      // Error handled by mutation handlers
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); router.push('/login'); }
  };

  const activeLocationStr = qrMode === 'ROOM'
    ? (roomNumber.trim() ? (roomNumber.trim().toLowerCase().startsWith('room') ? roomNumber.trim() : `Room ${roomNumber.trim()}`) : '')
    : tableNumber.trim();

  // Unique, non-predictable, restaurant-isolated, permanent table/room code
  // Dynamically compute all table and room locations including custom and active tables
  const allTableLocations = useMemo(() => {
    const defaults = data?.platformType === 'HOTEL'
      ? ['Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 201', 'Room 202']
      : data?.platformType === 'RESTAURANT'
      ? ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 10']
      : [
          'Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 10',
          'Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 201', 'Room 202'
        ];

    const customs = qrSettings.customLocations || [];
    const activeFormatted = activeLocationStr
      ? (qrMode === 'ROOM'
          ? (activeLocationStr.toLowerCase().startsWith('room') ? activeLocationStr : `Room ${activeLocationStr}`)
          : (activeLocationStr.toLowerCase().startsWith('table') ? activeLocationStr : `Table ${activeLocationStr}`))
      : '';

    const deleted = (qrSettings.deletedLocations || []).map((d) => d.trim().toLowerCase());
    const list = [...defaults, ...customs];
    if (activeFormatted && !list.some((l) => l.toLowerCase() === activeFormatted.toLowerCase())) {
      list.push(activeFormatted);
    }

    const seen = new Set<string>();
    const uniqueList: string[] = [];
    for (const item of list) {
      const lower = item.trim().toLowerCase();
      if (!deleted.includes(lower) && !seen.has(lower)) {
        seen.add(lower);
        uniqueList.push(item);
      }
    }
    return uniqueList;
  }, [data?.platformType, qrSettings.customLocations, qrSettings.deletedLocations, activeLocationStr, qrMode]);

  const uniqueTableCode = data?.slug && activeLocationStr
    ? generateUniqueTableCode(data.slug, activeLocationStr)
    : '';

  // Clean, obfuscated unique location QR code URL
  const qrUrl = data
    ? (uniqueTableCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${encodeURIComponent(uniqueTableCode)}` : `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${data.slug}`)
    : '';

  useEffect(() => {
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, {
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [qrUrl]);

  // Strip base64 data URLs to prevent 414 Request-URI Too Large error on Nginx
  const safeLogo = (logoPreviewUrl || data?.logo || '');
  const safeBanner = (bannerPreviewUrl || data?.banner || '');
  const logoParam = safeLogo.startsWith('data:') ? '' : safeLogo;
  const bannerParam = safeBanner.startsWith('data:') ? '' : safeBanner;

  const iframeUrl = data?.slug
    ? `/r/${data.slug}?preview=true` +
      `&themeColor=${encodeURIComponent(form.themeColor ?? '#E85D04')}` +
      `&name=${encodeURIComponent((form.name ?? '').slice(0, 80))}` +
      `&description=${encodeURIComponent((form.description ?? '').slice(0, 150))}` +
      (logoParam ? `&logo=${encodeURIComponent(logoParam)}` : '') +
      (bannerParam ? `&banner=${encodeURIComponent(bannerParam)}` : '')
    : '';

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Restaurant Settings</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-xs sm:text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0">
              <Save className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{saveMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
              <span className="sm:hidden">{saveMutation.isPending ? '...' : 'Save'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid lg:grid-cols-12 gap-6 max-w-7xl mx-auto items-start">
            {/* Forms Column */}
            <div className="lg:col-span-7 space-y-6 min-w-0">
              {/* Basic Info */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-4 sm:p-6 overflow-hidden">
                <h2 className="font-display font-semibold mb-5 text-base sm:text-lg">Basic Information</h2>
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Restaurant Name</label>
                      <input value={form.name ?? ''} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input value={form.phone ?? ''} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full pl-9 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Restaurant URL Code (Unique Address)</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1 flex items-center border border-border rounded-xl overflow-hidden bg-muted/30 min-w-0">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                        <span className="pl-9 pr-2 text-xs text-muted-foreground font-mono select-none border-r border-border/60 py-2.5 bg-muted/20 flex items-center whitespace-nowrap shrink-0">
                          /r/
                        </span>
                        <input
                          type="text"
                          value={form.slug ?? ''}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
                            setForm(f => ({ ...f, slug: val }));
                          }}
                          placeholder="rest-abc123"
                          className="flex-1 px-2.5 py-2.5 bg-transparent text-xs sm:text-sm font-mono focus:outline-none min-w-0"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const code = 'rest-' + Math.random().toString(36).slice(2, 8);
                            setForm(f => ({ ...f, slug: code }));
                            toast.success(`New unique code generated: ${code}`);
                          }}
                          className="flex-1 sm:flex-none px-3 py-2.5 bg-primary/10 hover:bg-primary/20 rounded-xl text-xs font-semibold text-primary transition-all border border-primary/20 whitespace-nowrap"
                          title="Generate a new unique random code"
                        >
                          Generate Code
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (form.slug) {
                              const fullUrl = `${window.location.origin}/r/${form.slug}`;
                              navigator.clipboard.writeText(fullUrl);
                              toast.success('Restaurant URL copied! 📋');
                            }
                          }}
                          className="flex-1 sm:flex-none px-3 py-2.5 bg-muted hover:bg-muted/80 rounded-xl text-xs font-medium text-foreground transition-all border border-border whitespace-nowrap"
                          title="Copy Restaurant URL"
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                      Customer menu link: <strong className="text-foreground font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}/r/{form.slug || 'rest-abc123'}</strong>
                      <span className="ml-2 text-orange-500 font-medium">↑ Click &quot;Generate Code&quot; to get a unique URL that replaces readable names</span>
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Description</label>
                    <textarea value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={3} className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <textarea value={form.address ?? ''} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                        rows={2} className="w-full pl-9 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">City</label>
                      <input value={form.city ?? ''} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">State</label>
                      <input value={form.state ?? ''} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Pincode</label>
                      <input value={form.pincode ?? ''} onChange={(e) => setForm(f => ({ ...f, pincode: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      Operating Hours (Weekly Schedule)
                    </label>
                    <div className="space-y-2.5 bg-muted/10 border border-border rounded-2xl p-3 sm:p-4 min-w-0 max-w-full overflow-x-hidden">
                      {DAYS_OF_WEEK.map((day) => {
                        const dayHours = operatingHours[day as keyof OperatingHours];
                        const isOpen = !dayHours?.closed;
                        return (
                          <div
                            key={day}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-card/60 border border-border/50 hover:bg-card/90 transition-all min-w-0"
                          >
                            <div className="flex items-center justify-between sm:justify-start gap-3 sm:w-36 shrink-0">
                              <span className="capitalize font-semibold text-xs text-foreground">{day}</span>
                              
                              {/* Toggle switch for Open/Closed */}
                              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isOpen}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setOperatingHours(prev => ({
                                      ...prev,
                                      [day]: { ...prev[day as keyof OperatingHours], closed: !checked }
                                    }));
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-8 h-4.5 bg-muted rounded-full peer peer-focus:ring-2 peer-focus:ring-primary/20 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-primary"></div>
                                <span className={`ml-2 text-xs font-semibold select-none min-w-[42px] ${isOpen ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {isOpen ? 'Open' : 'Closed'}
                                </span>
                              </label>
                            </div>

                            {/* Open and Close Time Pickers */}
                            {isOpen ? (
                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start sm:justify-end shrink-0">
                                <span className="text-[11px] text-muted-foreground sm:hidden font-medium">Hours:</span>
                                <input
                                  type="time"
                                  value={dayHours?.open ?? '11:00'}
                                  onChange={(e) => {
                                    setOperatingHours(prev => ({
                                      ...prev,
                                      [day]: { ...prev[day as keyof OperatingHours], open: e.target.value }
                                    }));
                                  }}
                                  className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                                />
                                <span className="text-xs text-muted-foreground font-medium">to</span>
                                <input
                                  type="time"
                                  value={dayHours?.close ?? '23:00'}
                                  onChange={(e) => {
                                    setOperatingHours(prev => ({
                                      ...prev,
                                      [day]: { ...prev[day as keyof OperatingHours], close: e.target.value }
                                    }));
                                  }}
                                  className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                                />
                              </div>
                            ) : (
                              <span className="text-xs italic text-muted-foreground hidden sm:inline-block">Closed all day</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />Theme Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.themeColor ?? '#E85D04'} onChange={(e) => setForm(f => ({ ...f, themeColor: e.target.value }))}
                        className="w-10 h-10 rounded-xl border border-border cursor-pointer bg-transparent" />
                      <input value={form.themeColor ?? '#E85D04'} onChange={(e) => setForm(f => ({ ...f, themeColor: e.target.value }))}
                        className="flex-1 px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Images */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-6">
                <h2 className="font-display font-semibold mb-5">Images</h2>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Logo</p>
                    {(logoPreviewUrl || form.logo || data?.logo) && <img src={logoPreviewUrl || getImageUrl(form.logo || data?.logo || '')} alt="Logo" className="w-20 h-20 rounded-xl object-cover border border-border mb-2 bg-white" />}
                    <div className="flex gap-3 items-center">
                      <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                        className="flex-1 px-3 py-2 text-sm text-muted-foreground border border-dashed border-border rounded-xl" />
                      {logoFile && (
                        <button onClick={() => uploadLogoMutation.mutate()} disabled={uploadLogoMutation.isPending}
                          className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-60">
                          {uploadLogoMutation.isPending ? 'Uploading...' : 'Upload'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Banner</p>
                    {(bannerPreviewUrl || form.banner || data?.banner) && <img src={bannerPreviewUrl || getImageUrl(form.banner || data?.banner || '')} alt="Banner" className="w-full h-28 rounded-xl object-cover border border-border mb-2 bg-white" />}
                    <div className="flex gap-3 items-center">
                      <input type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
                        className="flex-1 px-3 py-2 text-sm text-muted-foreground border border-dashed border-border rounded-xl" />
                      {bannerFile && (
                        <button onClick={() => uploadBannerMutation.mutate()} disabled={uploadBannerMutation.isPending}
                          className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-60">
                          {uploadBannerMutation.isPending ? 'Uploading...' : 'Upload'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Direct & UPI Payment Setup */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display font-semibold flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    Restaurant Payment & UPI Settings
                  </h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">Configured per Restaurant</span>
                </div>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
                  Configure your restaurant's <strong>UPI Intent Payment Settings</strong>. Ensure a valid Merchant UPI ID is configured so customers can launch UPI apps (Google Pay, PhonePe, Paytm) directly during checkout.
                </p>

                <div className="space-y-5">
                  {/* Status Toggles */}
                  <div className="grid sm:grid-cols-2 gap-4 p-4 bg-muted/20 border border-border/80 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Accept Online Payments</p>
                        <p className="text-[11px] text-muted-foreground">Allow online payments at checkout</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, paymentEnabled: !(f.paymentEnabled ?? true) }))}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                          (form.paymentEnabled ?? true) ? 'bg-green-500 justify-end' : 'bg-muted-foreground/30 justify-start'
                        }`}
                      >
                        <motion.div layout className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Enable UPI Intent Flow</p>
                        <p className="text-[11px] text-muted-foreground">Server-verified UPI deep links</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, upiEnabled: !(f.upiEnabled ?? true) }))}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                          (form.upiEnabled ?? true) ? 'bg-primary justify-end' : 'bg-muted-foreground/30 justify-start'
                        }`}
                      >
                        <motion.div layout className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  </div>

                  {/* UPI ID & Merchant Info */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-primary" /> UPI ID (Merchant VPA) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="yourname@upi"
                        value={form.paymentUpiId ?? ''}
                        onChange={(e) => setForm(f => ({ ...f, paymentUpiId: e.target.value || null }))}
                        className={`w-full px-3 py-2.5 bg-muted/30 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 ${
                          form.paymentUpiId && !/^[\w.-]+@[\w.-]+$/.test(form.paymentUpiId.trim())
                            ? 'border-red-500 focus:ring-red-500/30'
                            : 'border-border focus:ring-primary/30'
                        }`}
                      />
                      {form.paymentUpiId && !/^[\w.-]+@[\w.-]+$/.test(form.paymentUpiId.trim()) ? (
                        <p className="text-[10px] text-red-500 mt-1">Format must be username@upi (e.g., restaurant@okaxis, 9876543210@paytm)</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-1">Primary UPI ID for generating customer payment links & QR codes.</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" /> Merchant / Display Name for UPI
                      </label>
                      <input
                        type="text"
                        placeholder={form.name || 'e.g. My Fine Restaurant'}
                        value={form.merchantName ?? ''}
                        onChange={(e) => setForm(f => ({ ...f, merchantName: e.target.value || null }))}
                        className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Name shown inside customer's UPI app (PhonePe/Google Pay/Paytm).</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Payment Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={form.paymentPhone ?? ''}
                      onChange={(e) => setForm(f => ({ ...f, paymentPhone: e.target.value || null }))}
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* Auto-Generated Dynamic QR Code */}
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-primary" /> Live Payment QR Code Preview
                    </p>

                    <div className="p-5 bg-muted/20 border border-border rounded-2xl flex flex-col items-center text-center relative overflow-hidden max-w-md mx-auto">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          System Auto-Generated Dynamic QR
                        </span>
                      </div>

                      {dynamicQrPreviewUrl ? (
                        <div className="bg-white p-3 rounded-xl border border-border/80 shadow-sm mb-2">
                          <img src={dynamicQrPreviewUrl} alt="Live Dynamic UPI QR" className="w-36 h-36 object-contain" />
                        </div>
                      ) : (
                        <div className="w-36 h-36 rounded-xl border border-dashed border-border flex flex-col items-center justify-center p-3 bg-muted/40 mb-2">
                          <QrCode className="w-10 h-10 text-muted-foreground/50 mb-1" />
                          <p className="text-xs text-muted-foreground text-center">Enter valid UPI ID above to generate dynamic QR code</p>
                        </div>
                      )}

                      <p className="text-sm font-semibold text-foreground mt-1 font-mono">
                        {form.paymentUpiId || 'No UPI ID Configured'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Calculates exact order total dynamically for customer payments via PhonePe, Google Pay, and Paytm.
                      </p>
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Bank Account Details (Optional)</p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Account Holder Name</label>
                        <input
                          type="text"
                          placeholder="Full name on account"
                          value={form.bankAccountHolder ?? ''}
                          onChange={(e) => setForm(f => ({ ...f, bankAccountHolder: e.target.value || null }))}
                          className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Bank Name</label>
                        <input
                          type="text"
                          placeholder="e.g. State Bank of India"
                          value={form.bankName ?? ''}
                          onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value || null }))}
                          className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Account Number</label>
                        <input
                          type="text"
                          placeholder="Account number"
                          value={form.bankAccountNumber ?? ''}
                          onChange={(e) => setForm(f => ({ ...f, bankAccountNumber: e.target.value || null }))}
                          className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">IFSC Code</label>
                        <input
                          type="text"
                          placeholder="e.g. SBIN0001234"
                          value={form.bankIfsc ?? ''}
                          onChange={(e) => setForm(f => ({ ...f, bankIfsc: e.target.value || null }))}
                          className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSavePaymentDetails}
                    disabled={savePaymentDetailsMutation.isPending || uploadPaymentQrMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-bold disabled:opacity-60 hover:opacity-90 transition-opacity shadow-md shadow-orange-500/20"
                  >
                    <Save className="w-4 h-4" />
                    {savePaymentDetailsMutation.isPending || uploadPaymentQrMutation.isPending ? 'Saving...' : 'Save Payment Details'}
                  </button>
                </div>
              </motion.div>

              {/* QR Code Builder & Room Service Generator */}
              {data && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-card border border-border rounded-2xl p-6 space-y-6"
                >
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <h2 className="font-display font-semibold flex items-center gap-2 text-lg">
                        <QrCode className="w-5 h-5 text-primary" />
                        {data.platformType === 'HOTEL'
                          ? 'QR Code Generator (Hotel Rooms)'
                          : data.platformType === 'RESTAURANT'
                          ? 'QR Code Generator (Dine-In Tables)'
                          : 'QR Code Generator (Tables & Hotel Rooms)'}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.platformType === 'HOTEL'
                          ? 'Generate location-specific QR codes for Hotel Room Service.'
                          : data.platformType === 'RESTAURANT'
                          ? 'Generate location-specific QR codes for Dine-In Tables.'
                          : 'Generate location-specific QR codes for Dine-In Tables or Hotel Room Service.'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      Live Generator
                    </span>
                  </div>

                  {/* Mode Switcher: ONLY show if platformType is DUAL */}
                  {data.platformType === 'DUAL' && (
                    <div className="space-y-2">
                      <div className="flex bg-muted/40 p-1 rounded-xl border border-border max-w-lg">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isTableQrAllowed) {
                              toast.error('Dine-In Table QR option has been disabled by Admin.');
                              return;
                            }
                            setQrMode('TABLE');
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                            !isTableQrAllowed
                              ? 'opacity-40 cursor-not-allowed bg-muted/20 text-muted-foreground'
                              : qrMode === 'TABLE'
                              ? 'bg-primary text-white shadow-sm cursor-pointer'
                              : 'text-muted-foreground hover:text-foreground cursor-pointer'
                          }`}
                          title={!isTableQrAllowed ? 'Dine-In Table QR is disabled by Admin' : 'Switch to Dine-In Table QR'}
                        >
                          {!isTableQrAllowed ? (
                            <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>Dine-In Table QR</span>
                          {!isTableQrAllowed && (
                            <span className="text-[9px] bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0">
                              Disabled
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isRoomQrAllowed) {
                              toast.error('Hotel Room QR option has been disabled by Admin.');
                              return;
                            }
                            setQrMode('ROOM');
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                            !isRoomQrAllowed
                              ? 'opacity-40 cursor-not-allowed bg-muted/20 text-muted-foreground'
                              : qrMode === 'ROOM'
                              ? 'bg-primary text-white shadow-sm cursor-pointer'
                              : 'text-muted-foreground hover:text-foreground cursor-pointer'
                          }`}
                          title={!isRoomQrAllowed ? 'Hotel Room QR is disabled by Admin' : 'Switch to Hotel Room QR'}
                        >
                          {!isRoomQrAllowed ? (
                            <Lock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <Bed className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>Hotel Room QR</span>
                          {!isRoomQrAllowed && (
                            <span className="text-[9px] bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0">
                              Disabled
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Both Disabled Alert */}
                      {!isTableQrAllowed && !isRoomQrAllowed && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-medium flex items-center gap-2 max-w-lg">
                          <Lock className="w-4 h-4 shrink-0" />
                          <div>
                            <strong className="font-bold">All QR Modes Disabled by Admin:</strong> Both Dine-In Table and Hotel Room QR generation have been locked by system administration.
                          </div>
                        </div>
                      )}

                      {/* Single Mode Disabled Alert */}
                      {((qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)) && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2 max-w-lg">
                          <Lock className="w-4 h-4 shrink-0" />
                          <div>
                            <strong className="font-bold">Notice:</strong> {qrMode === 'ROOM' ? 'Hotel Room QR' : 'Dine-In Table QR'} is disabled by administration. Placards and customer orders for this mode cannot be processed.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Single platform disabled alerts (only when admin locks it) */}
                  {data.platformType === 'HOTEL' && !isRoomQrAllowed && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2 max-w-lg">
                      <Lock className="w-4 h-4 shrink-0" />
                      <div>
                        <strong className="font-bold">Notice:</strong> Hotel Room QR is disabled by administration. Placards and customer orders cannot be processed.
                      </div>
                    </div>
                  )}
                  {data.platformType === 'RESTAURANT' && !isTableQrAllowed && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2 max-w-lg">
                      <Lock className="w-4 h-4 shrink-0" />
                      <div>
                        <strong className="font-bold">Notice:</strong> Dine-In Table QR is disabled by administration. Placards and customer orders cannot be processed.
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-5 gap-6 items-start">
                    {/* Customizer Panel */}
                    <div className="md:col-span-3 space-y-4">
                      {qrMode === 'TABLE' ? (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-muted-foreground block">
                                Table Number (Optional)
                              </label>
                              {tableNumber && (
                                <button
                                  type="button"
                                  onClick={() => setTableNumber('')}
                                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                  <X className="w-3 h-3" /> Clear (General Menu)
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="e.g. 5, 12, A4 (leave empty for general menu)"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleGenerateAndSaveTable();
                                  }
                                }}
                                className="flex-1 px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground font-medium"
                              />
                              <button
                                type="button"
                                onClick={handleGenerateAndSaveTable}
                                disabled={!tableNumber.trim()}
                                className="px-4 py-2.5 bg-primary text-white hover:bg-primary/95 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" /> Generate &amp; Save QR
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Enter a table number and click <strong className="text-foreground">Generate &amp; Save QR</strong> so it is permanently saved in your QR list even when the input is cleared.
                            </p>
                          </div>

                          {/* Quick Table Presets */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground block">
                              Quick Table Presets
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setTableNumber('')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                  tableNumber === ''
                                    ? 'bg-primary border-primary text-white shadow-sm'
                                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                }`}
                              >
                                General Menu
                              </button>
                              {['1', '2', '3', '4', '5', '10'].map((num) => (
                                <button
                                  key={num}
                                  onClick={() => setTableNumber(num)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    tableNumber === num
                                      ? 'bg-primary border-primary text-white shadow-sm'
                                      : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                  }`}
                                >
                                  Table {num}
                                </button>
                              ))}
                              {allTableLocations
                                .filter((loc) => !loc.toLowerCase().startsWith('room') && !loc.toLowerCase().includes('suite') && !['table 1', 'table 2', 'table 3', 'table 4', 'table 5', 'table 10'].includes(loc.toLowerCase()))
                                .map((loc) => (
                                  <button
                                    key={loc}
                                    onClick={() => setTableNumber(loc)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                      tableNumber === loc
                                        ? 'bg-primary border-primary text-white shadow-sm'
                                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                    }`}
                                  >
                                    {loc}
                                  </button>
                                ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-muted-foreground block flex items-center gap-1.5">
                                <Bed className="w-3.5 h-3.5 text-primary" /> Hotel Room Number / Suite
                              </label>
                              {roomNumber && (
                                <button
                                  type="button"
                                  onClick={() => setRoomNumber('')}
                                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                  <X className="w-3 h-3" /> Clear (General Menu)
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="e.g. 101, 102, 201, Executive Suite A"
                                value={roomNumber}
                                onChange={(e) => setRoomNumber(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleGenerateAndSaveRoom();
                                  }
                                }}
                                className="flex-1 px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground font-medium"
                              />
                              <button
                                type="button"
                                onClick={handleGenerateAndSaveRoom}
                                disabled={!roomNumber.trim()}
                                className="px-4 py-2.5 bg-primary text-white hover:bg-primary/95 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" /> Generate &amp; Save QR
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Enter a room number and click <strong className="text-foreground">Generate &amp; Save QR</strong> to permanently store it in your QR list.
                            </p>
                          </div>

                          {/* Quick Room Presets */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground block">
                              Quick Hotel Room Presets
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {['101', '102', '103', '104', '201', '202', '301'].map((rm) => (
                                <button
                                  key={rm}
                                  onClick={() => setRoomNumber(rm)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    roomNumber === rm || roomNumber === `Room ${rm}`
                                      ? 'bg-primary border-primary text-white shadow-sm'
                                      : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                  }`}
                                >
                                  Room {rm}
                                </button>
                              ))}
                              {(qrSettings.customLocations || [])
                                .filter((loc) => loc.toLowerCase().startsWith('room') || loc.toLowerCase().includes('suite') || loc.toLowerCase().includes('bed'))
                                .map((loc) => (
                                  <button
                                    key={loc}
                                    onClick={() => setRoomNumber(loc)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                      roomNumber === loc
                                        ? 'bg-primary border-primary text-white shadow-sm'
                                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                    }`}
                                  >
                                    {loc}
                                  </button>
                                ))}
                            </div>
                          </div>
                        </>
                      )}


                      {/* QR Target Link */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground block">
                          Target QR Link URL
                        </label>
                        <p className="text-[11px] font-mono bg-muted/50 border border-border/80 rounded-xl px-3 py-2.5 break-all text-foreground select-all">
                          {qrUrl}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-3 pt-2">
                        <Link
                          href={uniqueTableCode ? `/t/${encodeURIComponent(uniqueTableCode)}` : (data?.slug ? `/r/${data.slug}` : '#')}
                          target="_blank"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted/70 rounded-xl text-sm font-semibold transition-colors text-foreground"
                        >
                          <Globe className="w-4 h-4" /> Preview Menu Link
                        </Link>

                        {qrCodeDataUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if ((qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)) {
                                  toast.error(`${qrMode === 'ROOM' ? 'Hotel Room QR' : 'Dine-In Table QR'} is disabled by Admin.`);
                                  return;
                                }
                                downloadPlacardImage({
                                  restaurantName: data.name,
                                  tableNumber: activeLocationStr,
                                  qrCodeDataUrl,
                                  themeColor: form.themeColor || '#E85D04',
                                  locationType: qrMode,
                                });
                                toast.success(`${qrMode === 'ROOM' ? 'Room' : 'Table'} QR Placard downloaded successfully!`);
                              }}
                              disabled={(qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)}
                              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-colors ${
                                (qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)
                                  ? 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                                  : 'bg-primary text-white hover:bg-primary/95 cursor-pointer'
                              }`}
                            >
                              <Download className="w-4 h-4" /> Download Placard (PNG)
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if ((qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)) {
                                  toast.error(`${qrMode === 'ROOM' ? 'Hotel Room QR' : 'Dine-In Table QR'} is disabled by Admin.`);
                                  return;
                                }
                                printPlacard({
                                  restaurantName: data.name,
                                  tableNumber: activeLocationStr,
                                  qrCodeDataUrl,
                                  themeColor: form.themeColor || '#E85D04',
                                  locationType: qrMode,
                                });
                              }}
                              disabled={(qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)}
                              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                                (qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)
                                  ? 'bg-muted border-border text-muted-foreground opacity-50 cursor-not-allowed'
                                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border cursor-pointer'
                              }`}
                            >
                              <Printer className="w-4 h-4" /> Print Placard
                            </button>

                            <a
                              href={(qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed) ? undefined : qrCodeDataUrl}
                              onClick={(e) => {
                                if ((qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)) {
                                  e.preventDefault();
                                  toast.error(`${qrMode === 'ROOM' ? 'Hotel Room QR' : 'Dine-In Table QR'} is disabled by Admin.`);
                                }
                              }}
                              download={`${data.slug}${activeLocationStr ? `-${activeLocationStr.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : ''}-qr.png`}
                              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs rounded-xl font-medium transition-colors ${
                                (qrMode === 'TABLE' && !isTableQrAllowed) || (qrMode === 'ROOM' && !isRoomQrAllowed)
                                  ? 'text-muted-foreground opacity-40 cursor-not-allowed'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer'
                              }`}
                            >
                              <Download className="w-3.5 h-3.5" /> QR Code Image Only
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Placard Preview Panel */}
                    <div className="md:col-span-2 flex flex-col items-center justify-center">
                      <div className="flex flex-col items-center p-5 bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-[240px] shadow-2xl text-center text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 via-transparent to-transparent pointer-events-none" />
                        
                        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 mb-1">
                          Welcome To
                        </span>
                        <h4 className="text-sm font-extrabold text-orange-500 truncate max-w-[200px] mb-2 uppercase">
                          {data.name}
                        </h4>

                        <div className="bg-orange-500/20 text-orange-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-md mb-3 border border-orange-500/30 tracking-wide">
                          {qrMode === 'ROOM' ? 'SCAN THIS QR FOR ROOM SERVICE' : 'SCAN THIS QR TO ORDER FOOD'}
                        </div>

                        <div className="bg-white p-3 rounded-xl shadow-inner mb-4 flex items-center justify-center">
                          {qrCodeDataUrl ? (
                            <img
                              src={qrCodeDataUrl}
                              alt="Restaurant QR Code"
                              className="w-36 h-36"
                            />
                          ) : (
                            <div className="w-36 h-36 flex items-center justify-center bg-zinc-100 text-zinc-400 text-xs">
                              Generating...
                            </div>
                          )}
                        </div>

                        <span className="text-xs font-bold bg-orange-500 text-white px-4 py-1.5 rounded-full shadow-md truncate max-w-[210px]">
                          {formatLocationBadgeText(activeLocationStr, qrMode)}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-3 text-center">
                        Printable {qrMode === 'ROOM' ? 'Hotel Room' : 'Table'} placard mockup
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* All Generated Table QR Codes & Placards Gallery */}
              {data && (
                <TableQrGallery
                  locations={allTableLocations}
                  restaurantName={data.name}
                  restaurantSlug={data.slug}
                  themeColor={form.themeColor || '#E85D04'}
                  activeLocation={activeLocationStr}
                  disabledLocations={qrSettings.disabledLocations || []}
                  isTableQrAllowed={isTableQrAllowed}
                  isRoomQrAllowed={isRoomQrAllowed}
                  onSelectLocation={(loc) => {
                    if (loc === 'General Menu') {
                      setTableNumber('');
                      setRoomNumber('');
                    } else {
                      const clean = loc.replace(/^(Table|Room)\s+/i, '');
                      if (loc.toLowerCase().startsWith('room')) {
                        setQrMode('ROOM');
                        setRoomNumber(clean);
                      } else {
                        setQrMode('TABLE');
                        setTableNumber(clean);
                      }
                    }
                    window.scrollTo({ top: 400, behavior: 'smooth' });
                  }}
                  onRemoveLocation={handleRemoveLocation}
                  onToggleStatus={(loc) => {
                    const isRoomLoc = loc.toLowerCase().includes('room') || loc.toLowerCase().includes('suite');
                    const isAdminLocked = isRoomLoc ? !isRoomQrAllowed : !isTableQrAllowed;
                    if (isAdminLocked) {
                      toast.error(`${isRoomLoc ? 'Hotel Room' : 'Dine-In Table'} QR is locked/disabled by Admin.`);
                      return;
                    }
                    setQrSettings((s) => {
                      const currentDisabled = s.disabledLocations || [];
                      const exists = currentDisabled.some(
                        (d) => d.trim().toLowerCase() === loc.trim().toLowerCase()
                      );
                      return {
                        ...s,
                        disabledLocations: exists
                          ? currentDisabled.filter((d) => d.trim().toLowerCase() !== loc.trim().toLowerCase())
                          : [...currentDisabled, loc],
                      };
                    });
                  }}
                />
              )}

              {/* QR Code Disable & Enable Management */}
              {data && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-card border border-border rounded-2xl p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <h2 className="font-display font-semibold flex items-center gap-2 text-lg">
                        <Power className="w-5 h-5 text-primary" />
                        QR Ordering & Location Status Manager
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Enable or disable QR ordering globally, or toggle active/disabled status for specific tables and hotel rooms.
                      </p>
                    </div>

                    {/* Global QR Switch */}
                    <button
                      type="button"
                      onClick={() => setQrSettings(s => ({ ...s, enabled: !s.enabled }))}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs border transition-all ${
                        qrSettings.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      Global QR System: {qrSettings.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  {/* Individual Table / Room Status Toggles */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      Toggle Active / Disabled Locations (Click any {data.platformType === 'HOTEL' ? 'room' : data.platformType === 'RESTAURANT' ? 'table' : 'table or room'} to change status)
                    </label>

                    <div className="flex flex-wrap gap-2.5">
                      {Array.from(
                        new Set([
                          ...allTableLocations,
                          ...(qrSettings.disabledLocations || []),
                        ])
                      ).map((loc) => {
                        const isRoomLoc = data.platformType === 'HOTEL' ? true : data.platformType === 'RESTAURANT' ? false : (loc.toLowerCase().includes('room') || loc.toLowerCase().includes('suite'));
                        const isAdminLocked = isRoomLoc ? !isRoomQrAllowed : !isTableQrAllowed;
                        const isDisabled = isAdminLocked || (qrSettings.disabledLocations || []).some(
                          (d) => d.trim().toLowerCase() === loc.trim().toLowerCase()
                        );
                        const isCustom = (qrSettings.customLocations || []).some(
                          (c) => c.trim().toLowerCase() === loc.trim().toLowerCase()
                        );
                        return (
                          <div
                            key={loc}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              isAdminLocked
                                ? 'bg-red-500/15 border-red-500/30 text-red-500 opacity-75'
                                : isDisabled
                                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isAdminLocked) {
                                  toast.error(`${isRoomLoc ? 'Hotel Room' : 'Dine-In Table'} QR is locked/disabled by Admin.`);
                                  return;
                                }
                                setQrSettings((s) => {
                                  const currentDisabled = s.disabledLocations || [];
                                  const exists = currentDisabled.some(
                                    (d) => d.trim().toLowerCase() === loc.trim().toLowerCase()
                                  );
                                  return {
                                    ...s,
                                    disabledLocations: exists
                                      ? currentDisabled.filter((d) => d.trim().toLowerCase() !== loc.trim().toLowerCase())
                                      : [...currentDisabled, loc],
                                  };
                                });
                              }}
                              className={`flex items-center gap-1.5 transition-opacity ${isAdminLocked ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
                            >
                              {isAdminLocked ? (
                                <Lock className="w-3.5 h-3.5 text-red-500" />
                              ) : isDisabled ? (
                                <Ban className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>{loc}</span>
                              <span className="text-[10px] opacity-75 uppercase">
                                ({isAdminLocked ? 'Locked by Admin' : isDisabled ? 'Disabled' : 'Active'})
                              </span>
                            </button>

                            {loc !== 'General Menu' && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLocation(loc)}
                                className="ml-1 p-0.5 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                                title={`Delete ${loc}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Custom Location Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCustomLocation();
                    }}
                    className="pt-2 flex items-center gap-3 max-w-md"
                  >
                    <input
                      type="text"
                      placeholder={
                        data?.platformType === 'HOTEL'
                          ? 'Add custom room (e.g. Room 305, Suite 4)'
                          : data?.platformType === 'RESTAURANT'
                          ? 'Add custom table location (e.g. Table 8, Rooftop 2)'
                          : 'Add custom location (e.g. Room 305, Table 8, Pool Bar)'
                      }
                      value={newCustomLocation}
                      onChange={(e) => setNewCustomLocation(e.target.value)}
                      className="flex-1 px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomLocation}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white hover:bg-primary/95 rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Location
                    </button>
                  </form>


                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-md hover:bg-primary/95 disabled:opacity-60 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {saveMutation.isPending ? 'Saving Settings...' : 'Save QR & Location Settings'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Mobile Mockup Preview Column */}
            <div className="lg:col-span-5 hidden lg:block sticky top-6 self-start">
              <div className="border border-border bg-card rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    Live Mobile Menu Preview
                  </h3>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">
                    Real-time Preview
                  </span>
                </div>
                
                <div className="relative mx-auto w-[335px] sm:w-[365px] h-[650px] max-w-full rounded-[2.8rem] border-[8px] border-zinc-950 bg-zinc-950 shadow-2xl overflow-hidden ring-1 ring-white/10">
                  {/* Speaker Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-32 bg-zinc-950 rounded-b-2xl z-45 flex items-center justify-center">
                    <div className="w-10 h-1 bg-zinc-800 rounded-full" />
                  </div>
                  
                  {/* Dynamic Iframe */}
                  {data?.slug && (
                    <iframe
                      src={iframeUrl}
                      className="w-full h-full border-0 select-none bg-background"
                      title="Menu Preview"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
