export interface DemandPredictionInput {
  vendor_id: string;
  product_name: string;
  date?: string;
  window?: 'morning' | 'evening';
  temperatureC: number;
  rainProbability: number;
  localityTier: string;
  festivalType?: string;
  festival?: string;
  hotspotDensityScore: number;
  available_stock: number;
  safety_stock: number;
  lag1?: number;
  lag7?: number;
  lag_1_demand?: number;
  lag_7_demand?: number;
  rolling_7d_mean?: number;
  rolling_7d_std?: number;
  same_slot_4wk?: number;
  same_slot_last_4wk_avg?: number;
}

export interface DemandPredictionResult {
  predictedDemand: number;
  predicted_demand_kg?: number;
  predictedValue?: number;
  recommendedDispatch: number;
  recommended_dispatch_kg?: number;
  vendorId?: string;
  productId?: string;
  confidence?: number;
  generatedAt?: string;
  featuresUsed?: Record<string, any>;
  isMockFallback?: boolean;
}

export interface SpoilagePredictionInput {
  vendor_id: string;
  batch_id?: string;
  product_name: string;
  initialPH: number;
  hoursSinceManufacture: number;
  hasRefrigerator: boolean;
  storageType: string;
  ambientTemperatureC: number;
  humidityPct: number;
  fridgeTemperatureC?: number;
  hoursOnShelf?: number;
  sellThroughRate?: number;
  hoursToExpiry?: number;
  volumeKg?: number;
  vendorRating?: number;
}

export interface SpoilagePredictionResult {
  riskLabel: 'Low' | 'Medium' | 'High';
  riskScore?: number;
  confidence: number;
  probabilities?: Record<string, number>;
  freshnessScore?: number;
  freshnessRisk?: string;
  hoursSinceManufacture?: number;
  hoursToExpiry?: number;
  sellThroughRate?: number;
  generatedAt?: string;
}

export interface VendorForecastResult {
  vendor: {
    vendor_id: string;
    shop_name: string;
    localityTier?: string;
    hotspotDensityScore?: number;
  };
  product: string;
  predictedDemand: number;
  recommendedDispatch: number;
  netDispatchNeeded?: number;
  surplusStock?: number;
  status?: string;
  availableStock: number;
  currentStock?: number;
  minimumStock: number;
  safetyStock?: number;
  lag1?: number;
  lag7?: number;
  rolling7DayMean?: number;
  sameSlot4WeekMean?: number;
  recentTrend?: number;
  featuresUsed: {
    lag1: number;
    lag7: number;
    rolling_7d_mean: number;
    rolling_7d_std: number;
    same_slot_4wk: number;
    window: string;
    dayOfWeek: number;
  };
  orderHistoryCount: number;
}

export interface VendorSpoilageResult {
  vendorId: string;
  shopName: string;
  batchId?: string;
  hasRefrigerator: boolean;
  storageType: string;
  fridgeTemperatureC?: number;
  riskLabel: 'Low' | 'Medium' | 'High' | 'None';
  isStockOut?: boolean;
  confidence: number;
  riskScore: number;
  freshnessScore?: number;
  hoursSinceManufacture: number;
  hoursToExpiry: number;
  probabilities?: Record<string, number>;
  dataSource?: string;
  statusMessage?: string;
}

export interface BatchSpoilageResult {
  batch_id: string;
  product_name: string;
  vendor_id?: string;
  vendor_name?: string;
  freshnessScore?: number;
  freshnessRisk?: string;
  riskScore?: number;
  hoursSinceManufacture: number;
  hoursToExpiry: number;
  sellThroughRate: number;
  riskLabel?: string;
  confidence?: number;
  mlRiskLabel?: 'Low' | 'Medium' | 'High' | 'None';
  mlConfidence?: number;
  mlProbabilities?: Record<string, number>;
  isStockOut?: boolean;
  statusMessage?: string;
}

export interface PredictionHistoryItem {
  _id?: string;
  predictionType: 'demand' | 'spoilage';
  vendorId?: string;
  batchId?: string;
  predictedValue?: number;
  recommendedDispatch?: number;
  riskLabel?: string;
  confidence?: number;
  generatedAt: string;
  isMockFallback?: boolean;
}

export interface PredictionStats {
  total: number;
  demand: number;
  spoilage: number;
  lowRisk?: number;
  mediumRisk?: number;
  highRisk?: number;
}
