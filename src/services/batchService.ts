// ════════════════════════════════════════════════════════════════════════════
// 📌 BATCH MANAGEMENT SERVICE (src/services/batchService.ts)
// WHAT THIS DOES:
//   Handles the complete batch lifecycle:
//   1. Manufacture batch in Central Kitchen (`createBatch`) -> Status: "created"
//   2. Admin assigns batch to a vendor (`assignBatch`)     -> Status: "assigned"
//   3. Vendor confirms physical receipt (`receiveBatch`)   -> Status: "received"
//   4. Batch finishes or expires (`stockoutBatch`/archive) -> Status: "stockout"/"archived"
// ════════════════════════════════════════════════════════════════════════════

import { api } from './api';
import { Batch, CreateBatchInput } from '../types/batch';

export const batchService = {
  // ── 1. List Batches (Filtered by vendor or status) ──────────────────────
  async getBatches(params?: { vendor_id?: string; status?: string }): Promise<Batch[]> {
    const res = await api.get<Batch[]>('/api/batches', { params });
    return res.data;
  },

  // ── 2. Central Kitchen: Create Fresh Batch ──────────────────────────────
  async createBatch(data: CreateBatchInput): Promise<{ ok: boolean; batch_id: string }> {
    const res = await api.post<{ ok: boolean; batch_id: string }>('/api/batches', data);
    return res.data;
  },

  // ── 3. Admin: Assign Batch to Vendor ────────────────────────────────────
  async assignBatch(batchId: string, vendorId: string, restockRequestId?: string): Promise<{ ok: boolean }> {
    const res = await api.put<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/assign`, {
      vendor_id: vendorId,
      restock_request_id: restockRequestId,
    });
    return res.data;
  },

  // ── 4. Get Central Kitchen Unassigned Batches ───────────────────────────
  async getAvailableBatches(): Promise<Batch[]> {
    const res = await api.get<Batch[]>('/api/batches/available');
    return res.data;
  },

  // ── 5. Vendor: Confirm Physical Delivery & Receipt ──────────────────────
  // When vendor confirms, status moves from "assigned" -> "received"
  async receiveBatch(batchId: string, notes?: string): Promise<{ ok: boolean }> {
    const res = await api.put<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/receive`, {
      notes: notes || '',
    });
    return res.data;
  },

  // ── 6. Mark Batch Stocked Out ───────────────────────────────────────────
  async stockoutBatch(batchId: string): Promise<{ ok: boolean; message?: string }> {
    const res = await api.put<{ ok: boolean; message?: string }>(
      `/api/batches/${encodeURIComponent(batchId)}/stockout`
    );
    return res.data;
  },

  // ── 7. Delete Batch ─────────────────────────────────────────────────────
  async deleteBatch(batchId: string): Promise<{ ok: boolean }> {
    const res = await api.delete<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}`);
    return res.data;
  },

  // ── 8. Product Catalog ──────────────────────────────────────────────────
  async getProducts(): Promise<any[]> {
    const res = await api.get<any[]>('/api/products');
    return res.data;
  },

  // ── 9. Get Single Batch Details ─────────────────────────────────────────
  async getBatch(batchId: string): Promise<Batch> {
    const res = await api.get<Batch>(`/api/batches/${encodeURIComponent(batchId)}`);
    return res.data;
  },

  // ── 10. Vendor: Report Quality / Spoilage Incident ──────────────────────
  async reportIssue(batchId: string, issueType: string, description: string): Promise<{ ok: boolean; message?: string }> {
    const res = await api.post<{ ok: boolean; message?: string }>(
      `/api/batches/${encodeURIComponent(batchId)}/report-issue`,
      { issue_type: issueType, description }
    );
    return res.data;
  },

  // ── 11. Vendor Historical Batches (Archived & Stockout) ─────────────────
  async getVendorBatchHistory(vendorId: string): Promise<Batch[]> {
    const res = await api.get<Batch[]>(`/api/vendors/${encodeURIComponent(vendorId)}/batch-history`);
    return res.data;
  },
};
