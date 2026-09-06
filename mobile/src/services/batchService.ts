import api from '../api/client';
import type { Batch, SpoilageRisk } from '../types';

interface BatchListParams {
  vendor_id?: string;
  status?: string;
}

const batchService = {
  list(params: BatchListParams = {}) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<Batch[]>(`/api/batches${qs ? '?' + qs : ''}`);
  },

  create(data: Partial<Batch>) {
    return api.post<{ ok: boolean; batch_id: string }>('/api/batches', data);
  },

  update(batchId: string, data: Partial<Batch>) {
    return api.put<{ ok: boolean }>(`/api/batches/${batchId}`, data);
  },

  assign(batchId: string, vendorId: string) {
    return api.put<{ ok: boolean; vendor_id: string; vendor_name: string }>(
      `/api/batches/${batchId}/assign`,
      { vendor_id: vendorId },
    );
  },

  receive(batchId: string, notes = '') {
    return api.put<{ ok: boolean }>(`/api/batches/${batchId}/receive`, { notes });
  },

  remove(batchId: string) {
    return api.delete<{ ok: boolean }>(`/api/batches/${batchId}`);
  },

  spoilageRisk(batchId: string) {
    return api.get<SpoilageRisk>(`/api/batches/${batchId}/predict-spoilage`);
  },
};

export default batchService;
