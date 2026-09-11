import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, setAuthTokenInMemory } from '../services/api';

interface AuthState {
  token: string | null;
  role: 'admin' | 'vendor' | null;
  username?: string;
  vendor_id?: string;
  shop_name?: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  loginAdmin: (user: string, pass: string) => Promise<boolean>;
  loginVendor: (vendorId: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const savedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      const savedUserStr = await AsyncStorage.getItem(AUTH_USER_KEY);

      if (savedToken) {
        setAuthTokenInMemory(savedToken);
        let parsedUser: any = {};
        if (savedUserStr) {
          try {
            parsedUser = JSON.parse(savedUserStr);
          } catch {}
        }

        // Probe backend
        try {
          const me = await authService.getMe();
          if (me.loggedIn && me.role) {
            set({
              token: savedToken,
              role: me.role,
              username: me.username,
              vendor_id: me.vendor_id,
              shop_name: me.shop_name,
              isAuthenticated: true,
              isLoading: false,
            });
            return;
          }
        } catch {
          // If offline or network error, accept cached user if present
          if (parsedUser && parsedUser.role) {
            set({
              token: savedToken,
              role: parsedUser.role,
              username: parsedUser.username,
              vendor_id: parsedUser.vendor_id,
              shop_name: parsedUser.shop_name,
              isAuthenticated: true,
              isLoading: false,
            });
            return;
          }
        }
      }

      set({
        token: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch {
      set({
        token: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  loginAdmin: async (username: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const res = await authService.loginAdmin(username, password);
      if (res.ok && res.token) {
        set({
          token: res.token,
          role: 'admin',
          username,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      }
      set({ error: res.error || 'Login failed', isLoading: false });
      return false;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Invalid credentials or server error';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  loginVendor: async (vendorId: string) => {
    try {
      set({ isLoading: true, error: null });
      const res = await authService.loginVendor(vendorId);
      if (res.ok && res.token) {
        set({
          token: res.token,
          role: 'vendor',
          vendor_id: res.vendor_id || vendorId,
          shop_name: res.shop_name,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      }
      set({ error: res.error || 'Vendor not found', isLoading: false });
      return false;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Vendor not found';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    await authService.logout();
    set({
      token: null,
      role: null,
      username: undefined,
      vendor_id: undefined,
      shop_name: undefined,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
}));
