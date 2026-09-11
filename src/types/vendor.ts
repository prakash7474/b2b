export interface Vendor {
  _id?: string;
  vendor_id: string;
  shop_name: string;
  owner_name: string;
  phone?: string;
  address?: string;
  localityTier?: string;
  hotspotDensityScore?: number;
  hasRefrigerator?: boolean;
  storageType?: string;
  fridgeTemperatureC?: number;
  rating?: number;
  batch_count?: number;
  received_count?: number;
  status?: string;
  verificationStatus?: 'active' | 'pending' | 'rejected' | 'terminated' | string;
  predicted_demand_kg?: number;
  created_at?: string;
}

export interface CreateVendorInput {
  vendor_id: string;
  shop_name: string;
  owner_name: string;
  phone?: string;
  address?: string;
  localityTier: string;
  hotspotDensityScore: number;
  hasRefrigerator: boolean;
  storageType: string;
  fridgeTemperatureC?: number;
  rating: number;
}
