import { api } from './api';
import { Batch, CreateBatchInput } from '../types/batch';

export const batchService = {
  async getBatches(params?: { vendor_id?: string; status?: string }): Promise<Batch[]> {
    const res = await api.get<Batch[]>('/api/batches', { params });
    return res.data;
  },

  async createBatch(data: CreateBatchInput): Promise<{ ok: boolean; batch_id: string }> {
    const res = await api.post<{ ok: boolean; batch_id: string }>('/api/batches', data);
    return res.data;
  },

  async assignBatch(batchId: string, vendorId: string): Promise<{ ok: boolean }> {
    const res = await api.put<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/assign`, {
      vendor_id: vendorId,
    });
    return res.data;
  },

  async receiveBatch(batchId: string, notes?: string): Promise<{ ok: boolean }> {
    const res = await api.put<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/receive`, {
      notes: notes || '',
    });
    return res.data;
  },

  async deleteBatch(batchId: string): Promise<{ ok: boolean }> {
    const res = await api.delete<{ ok: boolean }>(`/api/batches/${encodeURIComponent(batchId)}`);
    return res.data;
  },

  async getProducts(): Promise<any[]> {
    const res = await api.get<any[]>('/api/products');
    return res.data;
  },
};
