/**
 * TypeScript types for all B2P API entities.
 */

// ── Auth ─────────────────────────────────────────────────────────
export interface User {
  loggedIn: boolean;
  role?: 'admin' | 'vendor';
  username?: string;
  vendor_id?: string;
  shop_name?: string;
}

// ── Vendor ───────────────────────────────────────────────────────
export interface Vendor {
  vendor_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  address: string;
  localityTier: string;
  hotspotDensityScore: number;
  hasRefrigerator: boolean;
  storageType: string;
  fridgeTemperatureC: number;
  rating: number;
  createdAt: string;
  batch_count?: number;
  received_count?: number;
  batches?: Batch[];
}

// ── Batch ────────────────────────────────────────────────────────
export interface Batch {
  batch_id: string;
  product_name: string;
  manufacturer: string;
  batch_number: string;
  mfg_timestamp: string;
  volume_kg: number;
  initialPH: number;
  temperatureC: number;
  humidityPct: number;
  fermentationHours: number;
  notes: string;
  vendor_id: string;
  status: 'created' | 'assigned' | 'received';
  assigned_at: string | null;
  received_at: string | null;
  received_notes: string;
  created_at: string;
  vendor_name?: string;
}

// ── Inventory ────────────────────────────────────────────────────
export interface InventoryItem {
  inventory_id: string;
  vendor_id: string;
  product_name: string;
  batch_number: string;
  quantity: number;
  minimum_stock: number;
  price: number;
  manufacture_date: string;
  expiry_date: string;
  received_at: string;
  freshness_score: number;
  vendor_name?: string;
}

// ── Order ────────────────────────────────────────────────────────
export interface Order {
  order_id: string;
  vendor_id: string;
  order_date: string;
  order_status: string;
  payment_status: string;
  total_amount: number;
  delivery_address: string;
  items?: OrderItem[];
}

export interface OrderItem {
  order_id: string;
  inventory_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// ── Product ──────────────────────────────────────────────────────
export interface Product {
  product_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  shelf_life_hours: number;
}

// ── Dashboard ────────────────────────────────────────────────────
export interface DashboardStats {
  totalVendors: number;
  totalBatches: number;
  assignedBatches: number;
  receivedBatches: number;
  totalInventoryItems: number;
  totalStockQuantity: number;
  lowStockItems: number;
  highFreshnessRisk: number;
  totalOrders: number;
  pendingOrders: number;
  totalPredictions: number;
}

// ── Alert ────────────────────────────────────────────────────────
export interface Alert {
  alert_id: string;
  inventory_id: string;
  vendor_id: string;
  product_name: string;
  alert_type: 'low_stock' | 'spoilage_risk' | 'expiry_warning';
  message: string;
  alert_status: 'active' | 'acknowledged' | 'resolved';
  generated_time: string;
}

// ── Recommendation ───────────────────────────────────────────────
export interface Recommendation {
  recommendation_rank: number;
  vendor_id: string;
  shop_name: string;
  score: number;
  total_stock: number;
  avg_freshness: number;
  rating: number;
  hotspot_density: number;
}

// ── ML Predictions ───────────────────────────────────────────────
export interface DemandForecast {
  vendorId: string;
  shopName: string;
  predictedDemand: number;
  recommendedDispatch: number;
  currentStock: number;
  minimumStock: number;
  lag1: number;
  lag7: number;
  rolling7DayMean: number;
  sameSlot4WeekMean: number;
  recentTrend: number;
  historicalSales: number;
  recentOrders: number;
  dataSource: string;
}

export interface SpoilageRisk {
  batchId: string;
  productId: string;
  vendorId: string;
  vendorName: string;
  mlRiskLabel: string;
  mlConfidence: number;
  mlProbabilities: Record<string, number>;
  freshnessScore: number;
  freshnessRisk: string;
  hoursSinceManufacture: number;
  hoursToExpiry: number;
  sellThroughRate: number;
  dataSource: string;
}

export interface PredictionHistory {
  _id: string;
  predictionType: 'DEMAND' | 'SPOILAGE_RISK';
  vendorId: string;
  batchId?: string;
  productId?: string;
  predictedValue: number | string;
  confidence?: number;
  modelVersion: string;
  generatedAt: string;
}

export interface PredictionStats {
  totalPredictions: number;
  demandPredictions: number;
  spoilagePredictions: number;
}
