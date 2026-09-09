import { api } from './api';
import { InventoryItem, InventorySummary, RestockOrder } from '../types/batch';

export const inventoryService = {
  async getInventory(vendorId?: string): Promise<InventoryItem[]> {
    const params = vendorId ? { vendorId } : {};
    const res = await api.get<InventoryItem[]>('/api/inventory', { params });
    return res.data;
  },

  async getInventorySummary(vendorId: string): Promise<InventorySummary> {
    const res = await api.get<InventorySummary>('/api/inventory/summary', {
      params: { vendor_id: vendorId },
    });
    return res.data;
  },

  async getOrders(vendorId?: string): Promise<RestockOrder[]> {
    const params = vendorId ? { vendor_id: vendorId } : {};
    const res = await api.get<RestockOrder[]>('/api/orders', { params });
    return res.data;
  },

  async requestRestock(payload: {
    vendor_id: string;
    product_name?: string;
    requested_quantity_kg: number;
    notes?: string;
  }): Promise<{ ok: boolean; order_id: string; order?: RestockOrder }> {
    const res = await api.post<{ ok: boolean; order_id: string; order?: RestockOrder }>(
      '/api/orders',
      payload
    );
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

