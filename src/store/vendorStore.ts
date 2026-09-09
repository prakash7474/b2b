import { create } from 'zustand';
import { Vendor, CreateVendorInput } from '../types/vendor';
import { vendorService } from '../services/vendorService';

interface VendorState {
  vendors: Vendor[];
  currentVendor: Vendor | null;
  isLoading: boolean;
  error: string | null;

  fetchVendors: () => Promise<void>;
  fetchVendor: (id: string) => Promise<Vendor | null>;
  addVendor: (data: CreateVendorInput) => Promise<boolean>;
  removeVendor: (id: string) => Promise<boolean>;
}

export const useVendorStore = create<VendorState>((set, get) => ({
  vendors: [],
  currentVendor: null,
  isLoading: false,
  error: null,

  fetchVendors: async () => {
    try {
      set({ isLoading: true, error: null });
      const vendors = await vendorService.getVendors();
      set({ vendors, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load vendors', isLoading: false });
    }
  },

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

  addVendor: async (data: CreateVendorInput) => {
    try {
      set({ isLoading: true, error: null });
      await vendorService.createVendor(data);
      await get().fetchVendors();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create vendor';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

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
