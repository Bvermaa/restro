// ============================================================
// Shared TypeScript Types for QR Restaurant SaaS Platform
// ============================================================

// ---------- Enums ----------

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  RESTAURANT_OWNER = 'RESTAURANT_OWNER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  BAKING = 'BAKING',
  READY = 'READY',
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  RAZORPAY = 'RAZORPAY',
  COD = 'COD',
  WALLET = 'WALLET',
  PAY_TO_WAITER = 'PAY_TO_WAITER',
  UPI_INTENT = 'UPI_INTENT',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum CouponType {
  FLAT = 'FLAT',
  PERCENT = 'PERCENT',
}

export enum ChatRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export enum LoyaltyTransactionType {
  EARNED = 'EARNED',
  REDEEMED = 'REDEEMED',
}

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum ItemBadge {
  POPULAR = 'POPULAR',
  TRENDING = 'TRENDING',
  BEST_SELLER = 'BEST_SELLER',
  NEW = 'NEW',
}

// ---------- User Types ----------

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isVerified: boolean;
  loyaltyPoints: number;
  walletBalance: number;
  googleId: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

// ---------- Restaurant Types ----------

export interface OperatingHours {
  monday: { open: string; close: string; closed: boolean };
  tuesday: { open: string; close: string; closed: boolean };
  wednesday: { open: string; close: string; closed: boolean };
  thursday: { open: string; close: string; closed: boolean };
  friday: { open: string; close: string; closed: boolean };
  saturday: { open: string; close: string; closed: boolean };
  sunday: { open: string; close: string; closed: boolean };
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cuisineType: string | null;
  logo: string | null;
  banner: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  operatingHours: OperatingHours | null;
  deliveryRadius: number | null;
  minOrderValue: number;
  isOpen: boolean;
  isApproved: boolean;
  isSuspended: boolean;
  themeColor: string | null;
  commissionRate: number;
  ownerId: string;
  createdAt: string;
}

// ---------- Menu Types ----------

export interface MenuCategory {
  id: string;
  name: string;
  restaurantId: string;
  sortOrder: number;
  createdAt: string;
}

export interface ItemVariant {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
}

export interface ItemAddOn {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  restaurantId: string;
  isVeg: boolean;
  isVegan: boolean;
  isAvailable: boolean;
  badges: ItemBadge[];
  variants: ItemVariant[];
  addOns: ItemAddOn[];
  createdAt: string;
}

export interface MenuWithCategories {
  restaurant: Restaurant;
  categories: Array<MenuCategory & { items: MenuItem[] }>;
}

// ---------- Cart Types ----------

export interface CartAddOn {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string;
  menuItemId: string;
  menuItem: MenuItem;
  variantId: string | null;
  variant: ItemVariant | null;
  quantity: number;
  addOns: CartAddOn[];
}

export interface CartSummary {
  items: CartItem[];
  subtotal: number;
  gstAmount: number;
  deliveryFee: number;
  packagingFee: number;
  discount: number;
  total: number;
  appliedCoupon: Coupon | null;
}

// ---------- Order Types ----------

export interface Address {
  id: string;
  userId: string;
  label: string;
  flat: string;
  street: string;
  area: string;
  city: string;
  pincode: string;
  isDefault: boolean;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItem: MenuItem;
  variantId: string | null;
  variant: ItemVariant | null;
  quantity: number;
  unitPrice: number;
  addOns: CartAddOn[];
  subtotal: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  restaurant: Restaurant;
  userId: string | null;
  user: User | null;
  guestName: string | null;
  guestPhone: string | null;
  addressId: string | null;
  address: Address | null;
  tableNumber: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  gstAmount: number;
  deliveryFee: number;
  packagingFee: number;
  discount: number;
  total: number;
  couponId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Coupon Types ----------

export interface Coupon {
  id: string;
  restaurantId: string | null;
  code: string;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// ---------- AI Types ----------

export interface AiRecommendation {
  menuItemId: string;
  menuItem: MenuItem;
  reason: string;
}

export interface AiForecast {
  demandNextWeek: Array<{ date: string; predictedOrders: number }>;
  peakHours: Array<{ hour: number; avgOrders: number }>;
  topProfitableItems: Array<{ itemId: string; name: string; revenue: number }>;
  monthlyForecast: number;
  alerts: string[];
}

// ---------- Notification Types ----------

export interface Notification {
  id: string;
  userId: string | null;
  restaurantId: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ---------- Analytics Types ----------

export interface DashboardStats {
  todayRevenue: number;
  todayOrders: number;
  pendingOrders: number;
  avgOrderValue: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderStatusBreakdown {
  status: OrderStatus;
  count: number;
}

// ---------- API Response Types ----------

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------- Socket Event Types ----------

export interface OrderStatusUpdateEvent {
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
  estimatedTime?: number;
}

export interface NewOrderEvent {
  order: Order;
}

// ---------- Subscription Types ----------

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  features: Record<string, unknown>;
  createdAt: string;
}

export interface RestaurantSubscription {
  id: string;
  restaurantId: string;
  planId: string;
  plan: SubscriptionPlan;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
}

// ---------- Loyalty & Wallet Types ----------

export interface LoyaltyTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  points: number;
  type: LoyaltyTransactionType;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  amount: number;
  type: WalletTransactionType;
  reference: string | null;
  createdAt: string;
}

// ---------- Review Types ----------

export interface Review {
  id: string;
  orderId: string;
  userId: string;
  user: User;
  restaurantId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}
