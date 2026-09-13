// ════════════════════════════════════════════════════════════════════════════
// 📌 VENDOR REGISTRY STATE STORE (src/store/vendorStore.ts)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This Zustand store manages the directory of partner restaurant vendors.
//    (e.g., A2B Adyar, Saravana Bhavan, Murugan Idli Shop, Hotel Sangeetha).
//
//    What it stores:
//    - `vendors`: Array of all registered vendors (names, contact, address, daily quota).
//    - `currentVendor`: The single vendor currently selected or being viewed.
//
//    Key Methods:
//    1. `fetchVendors()`: Loads all registered partner outlets from backend `GET /api/vendors`.
//    2. `fetchVendor(id)`: Loads a single vendor's full details by vendor_id.
//    3. `addVendor(data)`: Registers a new shop with name, address, contact, and daily capacity.
//    4. `removeVendor(id)`: De-registers an inactive or closed shop.
// ════════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { Vendor, CreateVendorInput } from '../types/vendor';
import { vendorService } from '../services/vendorService';

// ── TypeScript Definition for Vendor Store State ────────────────────────────
interface VendorState {
  vendors: Vendor[];                     // List of all vendors
  currentVendor: Vendor | null;          // Currently selected vendor
  isLoading: boolean;                    // Loading spinner flag
  error: string | null;                  // Error message on API failure

  // Action methods
  fetchVendors: () => Promise<void>;
  fetchVendor: (id: string) => Promise<Vendor | null>;
  addVendor: (data: CreateVendorInput) => Promise<boolean>;
  removeVendor: (id: string) => Promise<boolean>;
}

// ── Create the Zustand Store: useVendorStore ────────────────────────────────
export const useVendorStore = create<VendorState>((set, get) => ({
  vendors: [],
  currentVendor: null,
  isLoading: false,
  error: null,

  // ── 1. LOAD ALL VENDORS ───────────────────────────────────────────────────
  // Queries `GET /api/vendors` and stores them in state
  fetchVendors: async () => {
    try {
      set({ isLoading: true, error: null });
      const vendors = await vendorService.getVendors();
      set({ vendors, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load vendors', isLoading: false });
    }
  },

  // ── 2. LOAD A SINGLE VENDOR DETAILS ───────────────────────────────────────
  // Queries `GET /api/vendors/:id`
  fetchVendor: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const vendor = await vendorService.getVendor(id);
      set({ currentVendor: vendor, isLoading: false });
      return vendor;
    } catch (err: any) {
      set({ error: err.message || 'Failed to load vendor', isLoading: false });
      return null;
    }
  },

  // ── 3. REGISTER A NEW PARTNER VENDOR ──────────────────────────────────────
  // Sends `POST /api/vendors` with shop name, contact, address, daily need
  addVendor: async (data: CreateVendorInput) => {
    try {
      set({ isLoading: true, error: null });
      await vendorService.createVendor(data);
      await get().fetchVendors(); // Refresh vendor list immediately
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create vendor';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  // ── 4. DELETE / DE-REGISTER A VENDOR ──────────────────────────────────────
  // Sends `DELETE /api/vendors/:id` and updates local state array
  removeVendor: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      await vendorService.deleteVendor(id);
      set((state) => ({
        vendors: state.vendors.filter((v) => v.vendor_id !== id),
        isLoading: false,
      }));
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to delete vendor';
      set({ error: msg, isLoading: false });
      return false;
    }
  },
}));

