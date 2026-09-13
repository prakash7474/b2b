// ════════════════════════════════════════════════════════════════════════════
// 📌 INVENTORY & RESTOCK SERVICE (src/services/inventoryService.ts)
// WHAT THIS DOES:
//   Provides all API calls for:
//   1. Reading vendor stock & batch summaries
//   2. Admin adding batches or removing selected batches
//   3. Vendor self-service stock updates (remaining kg)
//   4. Restock request creation and Admin approval/rejection workflows
// ════════════════════════════════════════════════════════════════════════════

import { api } from './api';
import { InventoryItem, InventorySummary, RestockOrder, RestockRequest } from '../types/batch';

export const inventoryService = {
  // ── 1. Fetch Inventory Records ──────────────────────────────────────────
  // Calls GET /api/inventory?vendorId=...
  async getInventory(vendorId?: string): Promise<InventoryItem[]> {
    const params = vendorId ? { vendorId } : {};
    const res = await api.get<InventoryItem[]>('/api/inventory', { params });
    return res.data;
  },

  // ── 2. Fetch Live Stock Summary for a Vendor ────────────────────────────
  // Calls GET /api/inventory/summary?vendor_id=...
  // Returns total kg, isStockOut, active batches, and belowMinimum status
  async getInventorySummary(vendorId: string): Promise<InventorySummary> {
    const res = await api.get<InventorySummary>('/api/inventory/summary', {
      params: { vendor_id: vendorId },
    });
    return res.data;
  },

  // ── 3. Fetch Restock Orders ─────────────────────────────────────────────
  async getOrders(vendorId?: string): Promise<RestockOrder[]> {
    const params = vendorId ? { vendor_id: vendorId } : {};
    const res = await api.get<RestockOrder[]>('/api/orders', { params });
    return res.data;
  },

  // ── 4. Vendor Submits a Restock Request ──────────────────────────────────
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

  // ── 5. Admin Stock Mutation (Add Batches) ──────────────────────────────
  // Used by Admin Stock page to add fresh batches or assign central batches
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

  // ── 6. Admin Batch Removal (Checklist Selection) ────────────────────────
  // Archives selected batches for a vendor and syncs inventory accurately
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

  // ── 7. Admin Dashboard Analytics & Overview ─────────────────────────────
  async getDashboard(): Promise<any> {
    const res = await api.get('/api/dashboard');
    return res.data;
  },

  async getDashboardSummary(): Promise<any> {
    const res = await api.get('/api/dashboard/summary');
    return res.data;
  },

  // ── 8. Vendor Self-Service Stock Update (Midday / End of Day) ───────────
  // Vendor enters remaining batter kg; returns below_minimum and is_stockout flags
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

  // ── 9. Restock Requests Workflow (Vendor ➔ Admin Approval) ─────────────
  // Vendor creates restock request:
  async createRestockRequest(payload: {
    vendor_id: string;
    product_name?: string;
    requested_quantity_kg: number;
    notes?: string;
  }): Promise<{ ok: boolean; request_id: string; order_id: string; request?: RestockRequest }> {
    const res = await api.post('/api/restock-requests', payload);
    return res.data;
  },

  // Admin views pending restock requests:
  async getRestockRequests(params?: {
    status?: string;
    vendor_id?: string;
  }): Promise<RestockRequest[]> {
    const res = await api.get<RestockRequest[]>('/api/restock-requests', { params });
    return res.data;
  },

  // Admin approves restock request:
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

  // Admin rejects restock request with reason:
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
