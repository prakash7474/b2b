import { api, setAuthTokenInMemory, AUTH_TOKEN_KEY, AUTH_USER_KEY } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LoginResponse {
  ok: boolean;
  role: 'admin' | 'vendor';
  token: string;
  username?: string;
  vendor_id?: string;
  shop_name?: string;
  error?: string;
}

export interface MeResponse {
  loggedIn: boolean;
  role?: 'admin' | 'vendor';
  username?: string;
  vendor_id?: string;
  shop_name?: string;
}

export const authService = {
  async loginAdmin(username: string, password: string): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>('/api/login', {
      role: 'admin',
      username,
      password,
    });
    if (res.data.token) {
      setAuthTokenInMemory(res.data.token);
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, res.data.token);
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.data));
    }
    return res.data;
  },

  async loginVendor(vendorId: string): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>('/api/login', {
      role: 'vendor',
      vendor_id: vendorId,
    });
    if (res.data.token) {
      setAuthTokenInMemory(res.data.token);
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, res.data.token);
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.data));
    }
    return res.data;
  },

  async getMe(): Promise<MeResponse> {
    const res = await api.get<MeResponse>('/api/me');
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/api/logout');
    } catch {
      // Best effort on backend logout
    } finally {
      setAuthTokenInMemory(null);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    }
  },
};
