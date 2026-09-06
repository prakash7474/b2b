import api from '../api/client';
import type { InventoryItem, SpoilageRisk } from '../types';

const inventoryService = {
  list() {
    return api.get<InventoryItem[]>('/api/inventory');
  },

  get(inventoryId: string) {
    return api.get<InventoryItem>(`/api/inventory/${inventoryId}`);
  },

  create(data: Partial<InventoryItem>) {
    return api.post<{ ok: boolean; inventory_id: string }>('/api/inventory', data);
  },

  remove(inventoryId: string) {
    return api.delete<{ ok: boolean }>(`/api/inventory/${inventoryId}`);
  },

  spoilageRisk(inventoryId: string) {
    return api.get<SpoilageRisk>(`/api/inventory/${inventoryId}/spoilage-risk`);
  },
};

export default inventoryService;
