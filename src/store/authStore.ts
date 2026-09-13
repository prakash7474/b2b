// ════════════════════════════════════════════════════════════════════════════
// 📌 AUTHENTICATION STATE STORE (src/store/authStore.ts)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This is the central state management store for User Authentication.
//    It is built using "Zustand" (a fast, lightweight React state manager).
//
//    What it stores:
//    - `token`: The secret JWT bearer token returned by Flask backend.
//    - `role`: Whether the logged-in user is 'admin' or 'vendor'.
//    - `vendor_id` & `shop_name`: If vendor is logged in, tracks which shop they own.
//    - `isAuthenticated`: Boolean flag telling RoleRouter whether to show login or app.
//    - `isLoading`: Shows loading spinner while checking saved credentials.
//
//    Key Methods:
//    1. `checkAuth()`: Checks phone storage (AsyncStorage) on app startup so users
//                     stay logged in even after closing the app.
//    2. `loginAdmin(user, pass)`: Authenticates Central Kitchen Admin with backend.
//    3. `loginVendor(vendorId)`: Logs in a vendor by their ID (e.g. "V001").
//    4. `logout()`: Clears tokens from memory & storage, returns user to RoleSelect.
// ════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, setAuthTokenInMemory } from '../services/api';

// ── TypeScript Definition for Auth State & Actions ──────────────────────────
interface AuthState {
  // Current session data
  token: string | null;
  role: 'admin' | 'vendor' | null;
  username?: string;
  vendor_id?: string;
  shop_name?: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Action functions
  loginAdmin: (user: string, pass: string) => Promise<boolean>;
  loginVendor: (vendorId: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

// ── Create the Zustand Store Hook: useAuthStore ─────────────────────────────
export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state when the app launches
  token: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  // Reset any error messages displayed to the user
  clearError: () => set({ error: null }),

  // ── 1. CHECK AUTHENTICATION ON APP STARTUP ────────────────────────────────
  // Reads saved token from device storage (AsyncStorage)
  // Verifies with backend `/api/auth/me` to ensure token hasn't expired.
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

        // Verify session live with the backend
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

      // No saved token found - user is not authenticated
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

  // ── 2. LOGIN ADMIN (CENTRAL KITCHEN) ──────────────────────────────────────
  // Sends username & password to backend `/api/auth/login-admin`
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

  // ── 3. LOGIN VENDOR (PARTNER OUTLET) ──────────────────────────────────────
  // Sends vendor ID (e.g. 'V001') to backend `/api/auth/login-vendor`
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

  // ── 4. LOGOUT ─────────────────────────────────────────────────────────────
  // Clears storage, invalidates session, resets all state variables
  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
    } catch {
      // Best effort — clear local state even if backend call fails
    }
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

