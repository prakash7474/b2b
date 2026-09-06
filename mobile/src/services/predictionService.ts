import api from '../api/client';
import type { PredictionHistory, PredictionStats } from '../types';

interface ManualDemandRequest {
  vendor_id: string;
  product_id: string;
  date: string;
  window: string;
  temperature: number;
  rainProbability: number;
  localityTier: string;
  festivalType: string;
  hotspotDensityScore: number;
  availableStock: number;
  safetyStock: number;
  lag1: number;
  lag7: number;
  rolling7DayMean: number;
  rolling7DayStd: number;
  rolling28DayMean: number;
  sameSlot4WeekMean: number;
}

interface ManualSpoilageRequest {
  vendor_id: string;
  batch_id: string;
  product_id: string;
  initialPH: number;
  hoursSinceManufacture: number;
  hasRefrigerator: number;
  storageType: string;
  ambientTemperatureC: number;
  humidityPct: number;
  fridgeTemperatureC: number;
  hoursOnShelf: number;
  sellThroughRate: number;
  hoursToExpiry: number;
  volumeKg: number;
  vendorRating: number;
}

interface SpoilageResult {
  riskLabel: string;
  confidence: number;
  probabilities: Record<string, number>;
  vendorId: string;
  batchId: string;
  productId: string;
}

const predictionService = {
  predictDemand(data: ManualDemandRequest) {
    return api.post<{ predictedDemand: number; recommendedDispatch: number; vendorId: string; productId: string }>(
      '/api/predict-demand',
      data,
    );
  },

  predictSpoilage(data: ManualSpoilageRequest) {
    return api.post<SpoilageResult>('/api/predict-spoilage', data);
  },

  history(limit = 50) {
    return api.get<PredictionHistory[]>(`/api/history?limit=${limit}`);
  },

  stats() {
    return api.get<PredictionStats>('/api/stats');
  },
};

export default predictionService;
