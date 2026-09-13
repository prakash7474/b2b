// ════════════════════════════════════════════════════════════════════════════
// 📌 BATCH & INVENTORY STATE STORE (src/store/batchStore.ts)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This Zustand store manages the lifecycle of batter batches and outlet inventory.
//    It acts as the frontend cache/source-of-truth for:
//
//    - `batches`: The complete list of manufactured batter batches.
//    - `inventory`: Outlet stock balances.
//    - `filterVendorId` & `filterStatus`: Current active filters on batch lists.
//
//    Batch Lifecycle Transitions Handled Here:
//    1. `addBatch()`: Admin creates a new batch ('created' status).
//    2. `assignBatch()`: Admin assigns batch to a vendor ('assigned' status).
//    3. `receiveBatch()`: Vendor acknowledges delivery ('received' status, adds kg to stock).
//    4. `stockoutBatch()`: Vendor finishes using the batch ('archived' / 'stockout').
//    5. `removeBatch()`: Central kitchen deletes a created/erroneous batch.
// ════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { Batch, BatchStatus, CreateBatchInput, InventoryItem } from '../types/batch';
import { batchService } from '../services/batchService';
import { inventoryService } from '../services/inventoryService';

// ── TypeScript Definition for Batch Store State ─────────────────────────────
interface BatchState {
  batches: Batch[];                     // Array of batches loaded from backend
  inventory: InventoryItem[];           // Current stock levels per outlet
  filterVendorId: string | null;        // Filter by specific vendor (or null for all)
  filterStatus: BatchStatus | 'all';    // Filter by status: 'created', 'assigned', 'received', 'archived', or 'all'
  isLoading: boolean;                   // Loading spinner state
  error: string | null;                 // Error message if an API call fails

  // Filter setters
  setFilterVendorId: (id: string | null) => void;
  setFilterStatus: (status: BatchStatus | 'all') => void;

  // Asynchronous API actions
  fetchBatches: (vendorId?: string, status?: string) => Promise<void>;
  fetchInventory: () => Promise<void>;
  addBatch: (data: CreateBatchInput) => Promise<boolean>;
  assignBatch: (batchId: string, vendorId: string, restockRequestId?: string) => Promise<boolean>;
  receiveBatch: (batchId: string, notes?: string) => Promise<boolean>;
  stockoutBatch: (batchId: string) => Promise<boolean>;
  removeBatch: (batchId: string) => Promise<boolean>;
}

// ── Create the Zustand Store: useBatchStore ─────────────────────────────────
export const useBatchStore = create<BatchState>((set, get) => ({
  batches: [],
  inventory: [],
  filterVendorId: null,
  filterStatus: 'all',
  isLoading: false,
  error: null,

  // Set filter for outlet/vendor
  setFilterVendorId: (id) => set({ filterVendorId: id }),

  // Set filter for batch status ('all', 'created', 'assigned', 'received', 'archived')
  setFilterStatus: (status) => set({ filterStatus: status }),

  // ── 1. FETCH BATCHES FROM BACKEND ─────────────────────────────────────────
  // Queries `GET /api/batches` with optional vendorId and status filters
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

  // ── 2. FETCH INVENTORY SUMMARY ────────────────────────────────────────────
  // Queries `GET /api/inventory` to get current stock levels
  fetchInventory: async () => {
    try {
      set({ isLoading: true, error: null });
      const inventory = await inventoryService.getInventory();
      set({ inventory, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch inventory', isLoading: false });
    }
  },

  // ── 3. CREATE A NEW BATTER BATCH ──────────────────────────────────────────
  // Calls `POST /api/batches` with recipe, quantity_kg, acidity_ph, etc.
  addBatch: async (data: CreateBatchInput) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.createBatch(data);
      await get().fetchBatches(); // Refresh batch list automatically
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create batch';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  // ── 4. ASSIGN BATCH TO A VENDOR ───────────────────────────────────────────
  // Moves status from 'created' ➔ 'assigned' and links to a vendor outlet
  assignBatch: async (batchId: string, vendorId: string, restockRequestId?: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.assignBatch(batchId, vendorId, restockRequestId);
      await get().fetchBatches(); // Refresh batch list
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to assign batch';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  // ── 5. CONFIRM BATCH RECEIPT (BY VENDOR) ──────────────────────────────────
  // Moves status from 'assigned' ➔ 'received', records delivery timestamp,
  // and immediately adds batch quantity to the vendor's active stock ledger.
  receiveBatch: async (batchId: string, notes?: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.receiveBatch(batchId, notes);
      await get().fetchBatches();   // Refresh batch status
      await get().fetchInventory(); // Refresh store stock
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to confirm receipt';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  // ── 6. MARK BATCH AS EXHAUSTED / STOCKED OUT ──────────────────────────────
  // Moves status from 'received' ➔ 'archived' when 100% of batter is used
  stockoutBatch: async (batchId: string) => {
    try {
      set({ isLoading: true, error: null });
      await batchService.stockoutBatch(batchId);
      await get().fetchBatches();
      await get().fetchInventory();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to mark batch as stock out';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  // ── 7. DELETE / REMOVE BATCH (ADMIN ONLY) ─────────────────────────────────
  // Permanently removes a created batch before it leaves the central kitchen
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

