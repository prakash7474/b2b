import { api } from './api';
import { InventoryItem } from '../types/batch';

export const inventoryService = {
  async getInventory(vendorId?: string): Promise<InventoryItem[]> {
    const params = vendorId ? { vendorId } : {};
    const res = await api.get<InventoryItem[]>('/api/inventory', { params });
    return res.data;
  },

  async mutateInventory(payload: {
    vendor_id: string;
    action?: 'add_batch' | 'remove_batch' | 'edit';
    quantity?: number;
    quantity_delta?: number;
  }): Promise<any> {
    const res = await api.patch('/api/inventory', payload);
    return res.data;
  },

  async getDashboard(): Promise<any> {
    const res = await api.get('/api/dashboard');
    return res.data;
  },

  async getDashboardSummary(): Promise<any> {
    const res = await api.get('/api/dashboard/summary');
    return res.data;
  },
};

