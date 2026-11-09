import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isVerified: boolean;
  loyaltyPoints: number;
  walletBalance: number;
  platformType?: string;
  maxLogins?: number;
  restaurantId?: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  loginRestaurantSlug: string | null;

  setUser: (user: User, accessToken: string, loginRestaurantSlug?: string | null) => void;
  setAccessToken: (token: string | null) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
  setBootstrapping: (loading: boolean) => void;
}

// In-memory token storage so axios request interceptor can read token synchronously without React hooks
let inMemoryAccessToken: string | null = null;

export const getInMemoryAccessToken = (): string | null => inMemoryAccessToken;

export const setInMemoryAccessToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isBootstrapping: true,
  loginRestaurantSlug: null,

  setUser: (user, accessToken, loginRestaurantSlug = null) => {
    setInMemoryAccessToken(accessToken);
    set({
      user,
      accessToken,
      isAuthenticated: true,
      isBootstrapping: false,
      loginRestaurantSlug,
    });
  },

  setAccessToken: (accessToken) => {
    setInMemoryAccessToken(accessToken);
    set({
      accessToken,
      isAuthenticated: !!accessToken,
      isBootstrapping: false,
    });
  },

  updateUser: (updates) => {
    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, ...updates } });
    }
  },

  logout: () => {
    setInMemoryAccessToken(null);
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isBootstrapping: false,
      loginRestaurantSlug: null,
    });
  },

  setBootstrapping: (isBootstrapping) => set({ isBootstrapping }),
}));
