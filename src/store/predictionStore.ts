import { create } from 'zustand';
import {
  DemandPredictionInput,
  DemandPredictionResult,
  SpoilagePredictionInput,
  SpoilagePredictionResult,
  VendorForecastResult,
  BatchSpoilageResult,
  PredictionHistoryItem,
  PredictionStats,
} from '../types/prediction';
import { predictionService } from '../services/predictionService';

interface PredictionState {
  lastDemandResult: DemandPredictionResult | null;
  lastSpoilageResult: SpoilagePredictionResult | null;
  vendorForecast: VendorForecastResult | null;
  batchSpoilage: BatchSpoilageResult | null;
  history: PredictionHistoryItem[];
  stats: PredictionStats | null;
  isLoading: boolean;
  error: string | null;

  runDemandPrediction: (data: DemandPredictionInput) => Promise<DemandPredictionResult | null>;
  runSpoilagePrediction: (data: SpoilagePredictionInput) => Promise<SpoilagePredictionResult | null>;
  fetchVendorForecast: (vendorId: string) => Promise<VendorForecastResult | null>;
  fetchBatchSpoilage: (batchId: string) => Promise<BatchSpoilageResult | null>;
  fetchHistory: (type?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  clearResults: () => void;
}

export const usePredictionStore = create<PredictionState>((set) => ({
  lastDemandResult: null,
  lastSpoilageResult: null,
  vendorForecast: null,
  batchSpoilage: null,
  history: [],
  stats: null,
  isLoading: false,
  error: null,

  clearResults: () =>
    set({
      lastDemandResult: null,
      lastSpoilageResult: null,
      vendorForecast: null,
      batchSpoilage: null,
      error: null,
    }),

  runDemandPrediction: async (data: DemandPredictionInput) => {
    try {
      set({ isLoading: true, error: null });
      const result = await predictionService.predictDemand(data);
      set({ lastDemandResult: result, isLoading: false });
      return result;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to predict demand';
      set({ error: msg, isLoading: false });
      return null;
    }
  },

  runSpoilagePrediction: async (data: SpoilagePredictionInput) => {
    try {
      set({ isLoading: true, error: null });
      const result = await predictionService.predictSpoilage(data);
      set({ lastSpoilageResult: result, isLoading: false });
      return result;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to predict spoilage risk';
      set({ error: msg, isLoading: false });
      return null;
    }
  },

  fetchVendorForecast: async (vendorId: string) => {
    try {
      set({ isLoading: true, error: null });
      const forecast = await predictionService.getVendorDemandForecast(vendorId);
      set({ vendorForecast: forecast, isLoading: false });
      return forecast;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to fetch vendor forecast';
      set({ error: msg, isLoading: false });
      return null;
    }
  },

  fetchBatchSpoilage: async (batchId: string) => {
    try {
      set({ batchSpoilage: null, isLoading: true, error: null });
      const spoilage = await predictionService.getBatchSpoilageRisk(batchId);
      set({ batchSpoilage: spoilage, isLoading: false });
      return spoilage;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to check batch spoilage';
      set({ error: msg, isLoading: false });
      return null;
    }
  },

  fetchHistory: async (type?: string) => {
    try {
      set({ isLoading: true, error: null });
      const history = await predictionService.getHistory(type ? { type } : undefined);
      set({ history, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch history', isLoading: false });
    }
  },

  fetchStats: async () => {
    try {
      const stats = await predictionService.getStats();
      set({ stats });
    } catch {}
  },
}));
