import { api } from './api';
import { InventoryItem, InventorySummary, RestockOrder, RestockRequest } from '../types/batch';

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
  }): Promise<{ ok: boolean; order_id: string; request_id?: string; order?: RestockOrder; request?: RestockRequest }> {
    try {
      const res = await api.post<{ ok: boolean; request_id: string; order_id: string; request?: RestockRequest; order?: RestockOrder }>(
        '/api/restock-requests',
        payload
      );
      return res.data;
    } catch {
      const res = await api.post<{ ok: boolean; order_id: string; order?: RestockOrder }>(
        '/api/orders',
        payload
      );
      return res.data;
    }
  },

  async mutateInventory(payload: {
    vendor_id: string;
    action?: 'add_batch' | 'remove_batch' | 'remove_batches' | 'edit';
    quantity?: number;
    quantity_delta?: number;
    batch_id?: string;
    batch_ids?: string[];
    product_name?: string;
    notes?: string;
  }): Promise<any> {
    try {
      const res = await api.post('/api/inventory', payload);
      return res.data;
    } catch {
      const res = await api.patch('/api/inventory', payload);
      return res.data;
    }
  },

  async removeBatches(vendor_id: string, batch_ids: string[]): Promise<any> {
    try {
      const res = await api.post('/api/inventory/remove-batches', { vendor_id, batch_ids });
      return res.data;
    } catch {
      const res = await api.patch('/api/inventory', {
        vendor_id,
        action: 'remove_batches',
        batch_ids,
      });
      return res.data;
    }
  },

  async getDashboard(): Promise<any> {
    const res = await api.get('/api/dashboard');
    return res.data;
  },

  async getDashboardSummary(): Promise<any> {
    const res = await api.get('/api/dashboard/summary');
    return res.data;
  },

  // ── Vendor Self-Service Stock Update ─────────────────────────────
  async vendorUpdateStock(vendorId: string, remainingQuantityKg: number): Promise<{
    ok: boolean;
    vendor_id: string;
    previous_quantity_kg: number;
    remaining_quantity_kg: number;
    below_minimum: boolean;
    is_stockout: boolean;
    minimum_stock_kg: number;
    message: string;
  }> {
    const res = await api.put('/api/vendor/inventory/update', {
      vendor_id: vendorId,
      remaining_quantity_kg: remainingQuantityKg,
    });
    return res.data;
  },

  // ── Restock Requests (Vendor → Admin Approval) ───────────────────
  async createRestockRequest(payload: {
    vendor_id: string;
    product_name?: string;
    requested_quantity_kg: number;
    notes?: string;
  }): Promise<{ ok: boolean; request_id: string; order_id: string; request?: RestockRequest }> {
    const res = await api.post('/api/restock-requests', payload);
    return res.data;
  },

  async getRestockRequests(params?: {
    status?: string;
    vendor_id?: string;
  }): Promise<RestockRequest[]> {
    const res = await api.get<RestockRequest[]>('/api/restock-requests', { params });
    return res.data;
  },

  async approveRestockRequest(requestId: string, adminNotes?: string): Promise<{ ok: boolean; request?: RestockRequest }> {
    try {
      const res = await api.patch(`/api/restock-requests/${encodeURIComponent(requestId)}/approve`, {
        admin_notes: adminNotes || '',
      });
      return res.data;
    } catch {
      const res = await api.post(`/api/orders/${encodeURIComponent(requestId)}/approve`, {
        admin_notes: adminNotes || '',
      });
      return res.data;
    }
  },

  async rejectRestockRequest(requestId: string, reason?: string): Promise<{ ok: boolean; request?: RestockRequest }> {
    try {
      const res = await api.patch(`/api/restock-requests/${encodeURIComponent(requestId)}/reject`, {
        admin_notes: reason || '',
      });
      return res.data;
    } catch {
      const res = await api.post(`/api/orders/${encodeURIComponent(requestId)}/reject`, {
        admin_notes: reason || '',
      });
      return res.data;
    }
  },
};
