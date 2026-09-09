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
  freshness_score: number;
  freshness_risk?: 'Low' | 'Medium' | 'High';
  status: string;
  last_updated?: string;
}
