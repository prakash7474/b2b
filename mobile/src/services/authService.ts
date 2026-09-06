import api from '../api/client';
import type { User } from '../types';

interface LoginResponse {
  ok: boolean;
  role: string;
  shop_name?: string;
}

const authService = {
  loginAdmin(username: string, password: string) {
    return api.post<LoginResponse>('/api/login', { role: 'admin', username, password });
  },

  loginVendor(vendorId: string) {
    return api.post<LoginResponse>('/api/login', { role: 'vendor', vendor_id: vendorId });
  },

  logout() {
    return api.post<{ ok: boolean }>('/api/logout');
  },

  me() {
    return api.get<User>('/api/me');
  },
};

export default authService;
