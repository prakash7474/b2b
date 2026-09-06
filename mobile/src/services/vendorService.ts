import api from '../api/client';
import type { Vendor, DemandForecast } from '../types';

const vendorService = {
  list() {
    return api.get<Vendor[]>('/api/vendors');
  },

  get(vendorId: string) {
    return api.get<Vendor>(`/api/vendors/${vendorId}`);
  },

  create(data: Partial<Vendor>) {
    return api.post<{ ok: boolean; vendor_id: string }>('/api/vendors', data);
  },

  remove(vendorId: string) {
    return api.delete<{ ok: boolean }>(`/api/vendors/${vendorId}`);
  },

  verify(vendorId: string, status = 'verified') {
    return api.put<{ ok: boolean; status: string }>(`/api/vendors/${vendorId}/verify`, { status });
  },

  getInventory(vendorId: string) {
    return api.get(`/api/vendors/${vendorId}/inventory`);
  },

  getOrders(vendorId: string) {
    return api.get(`/api/vendors/${vendorId}/orders`);
  },

  demandForecast(vendorId: string) {
    return api.get<DemandForecast>(`/api/vendors/${vendorId}/demand-forecast`);
  },
};

export default vendorService;
