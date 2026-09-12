export type BatchStatus = 'created' | 'assigned' | 'received' | 'stockout' | 'archived';

export interface Batch {
  _id?: string;
  batch_id: string;
  batch_number: string;
  product_name: string;
  product_id?: string;
  manufacturer: string;
  volume_kg: number;
  quantity_kg?: number;
  remaining_volume_kg?: number;
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
  stocked_out_at?: string;
  archived_at?: string;
  archived_reason?: string;
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

export interface RestockRequest {
  _id?: string;
  request_id: string;
  vendor_id: string;
  vendor_name?: string;
  product_name: string;
  requested_quantity_kg: number;
  requested_batch_id?: string;
  current_stock_kg: number;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  admin_notes?: string;
  approved_at?: string;
  rejected_at?: string;
  created_at?: string;
  linked_order_id?: string;
  linked_batch_id?: string;
}
