import { api } from './api';
import { Vendor, CreateVendorInput } from '../types/vendor';

export const vendorService = {
  async getVendors(): Promise<Vendor[]> {
    const res = await api.get<Vendor[]>('/api/vendors');
    return res.data;
  },

  async getVendor(id: string): Promise<Vendor> {
    const res = await api.get<Vendor>(`/api/vendors/${encodeURIComponent(id)}`);
    return res.data;
  },

  async createVendor(data: CreateVendorInput): Promise<{ ok: boolean; vendor_id: string }> {
    const res = await api.post<{ ok: boolean; vendor_id: string }>('/api/vendors', data);
    return res.data;
  },

  async updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor> {
    const res = await api.patch<Vendor>(`/api/vendors/${encodeURIComponent(id)}`, data);
    return res.data;
  },

  async deleteVendor(id: string): Promise<{ ok: boolean }> {
    const res = await api.delete<{ ok: boolean }>(`/api/vendors/${encodeURIComponent(id)}`);
    return res.data;
  },
};

