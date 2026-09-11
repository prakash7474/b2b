import { create } from 'zustand';
import { Batch, BatchStatus, CreateBatchInput, InventoryItem } from '../types/batch';
import { batchService } from '../services/batchService';
import { inventoryService } from '../services/inventoryService';

interface BatchState {
  batches: Batch[];
  inventory: InventoryItem[];
  filterVendorId: string | null;
  filterStatus: BatchStatus | 'all';
  isLoading: boolean;
  error: string | null;

  setFilterVendorId: (id: string | null) => void;
  setFilterStatus: (status: BatchStatus | 'all') => void;
  fetchBatches: (vendorId?: string, status?: string) => Promise<void>;
  fetchInventory: () => Promise<void>;
  addBatch: (data: CreateBatchInput) => Promise<boolean>;
  assignBatch: (batchId: string, vendorId: string) => Promise<boolean>;
  receiveBatch: (batchId: string, notes?: string) => Promise<boolean>;
  removeBatch: (batchId: string) => Promise<boolean>;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  batches: [],
  inventory: [],
  filterVendorId: null,
  filterStatus: 'all',
  isLoading: false,
  error: null,

  setFilterVendorId: (id) => set({ filterVendorId: id }),
  setFilterStatus: (status) => set({ filterStatus: status }),

  fetchBatches: async (vendorId, status) => {
    try {
      set({ isLoading: true, error: null });
      const params: any = {};
      const targetVendor = vendorId !== undefined ? vendorId : get().filterVendorId;
      const targetStatus = status !== undefined ? status : get().filterStatus;

      if (targetVendor) params.vendor_id = targetVendor;
      if (targetStatus && targetStatus !== 'all') params.status = targetStatus;

      const batches = await batchService.getBatches(params);
      set({ batches, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch batches', isLoading: false });
    }
  },

  fetchInventory: async () => {
    try {
      set({ isLoading: true, error: null });
      const inventory = await inventoryService.getInventory();
      set({ inventory, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch inventory', isLoading: false });
    }
  },

  addBatch: async (data: CreateBatchInput) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.createBatch(data);
      await get().fetchBatches();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create batch';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  assignBatch: async (batchId: string, vendorId: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.assignBatch(batchId, vendorId);
      await get().fetchBatches();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to assign batch';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  receiveBatch: async (batchId: string, notes?: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.receiveBatch(batchId, notes);
      await get().fetchBatches();
      await get().fetchInventory();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to confirm receipt';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  removeBatch: async (batchId: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.deleteBatch(batchId);
      set((state) => ({
        batches: state.batches.filter((b) => b.batch_id !== batchId),
        isLoading: false,
      }));
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to delete batch';
      set({ error: msg, isLoading: false });
      return false;
    }
  },
}));
