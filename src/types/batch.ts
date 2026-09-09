export type BatchStatus = 'created' | 'assigned' | 'received';

export interface Batch {
  _id?: string;
  batch_id: string;
  batch_number: string;
  product_name: string;
  product_id?: string;
  manufacturer: string;
  volume_kg: number;
  quantity_kg?: number;
  initialPH: number;
  temperatureC: number;
  humidityPct: number;
  fermentationHours: number;
  notes?: string;
  status: BatchStatus;
  vendor_id?: string | null;
  vendor_name?: string | null;
  created_at?: string;
  assigned_at?: string;
  received_at?: string;
  mfg_timestamp?: string;
  mfgTimestamp?: string;
}

export interface CreateBatchInput {
  batch_id: string;
  product_name: string;
  manufacturer: string;
  batch_number?: string;
  volume_kg: number;
  initialPH: number;
  temperatureC: number;
  humidityPct: number;
  fermentationHours: number;
  notes?: string;
  mfgTimestamp?: string;
}

export interface InventoryItem {
  _id?: string;
  inventory_id: string;
  batch_number: string;
  product_name: string;
  vendor_id: string;
  vendor_name?: string;
  quantity: number;
  minimum_stock: number;
  minimumStock?: number;
  freshness_score: number;
  freshnessScore?: number;
  freshness_risk?: 'Low' | 'Medium' | 'High';
  receivedAt?: string;
  expiryAt?: string;
  status: string;
  last_updated?: string;
}

export interface InventorySummary {
  vendorId: string;
  totalQuantityKg: number;
  minimumStockKg: number;
  belowMinimum: boolean;
  batchCount: number;
  receivedBatchCount: number;
  oldestBatchAgeHrs: number;
  freshnessScore: number;
  products: string[];
}

export interface RestockOrder {
  _id?: string;
  order_id: string;
  vendor_id: string;
  user_id?: string;
  product_name: string;
  quantity_kg: number;
  total_amount?: number;
  payment_method?: string;
  payment_status?: string;
  order_status: string;
  notes?: string;
  order_date?: string;
  created_at?: string;
}
