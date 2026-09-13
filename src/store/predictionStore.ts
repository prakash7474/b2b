// ════════════════════════════════════════════════════════════════════════════
// 📌 AI PREDICTION STATE STORE (src/store/predictionStore.ts)
// ════════════════════════════════════════════════════════════════════════════
// 💡 WHAT THIS FILE DOES (EXPLAIN THIS TO THE INSTRUCTOR):
//    This Zustand store manages the machine-learning AI inference state for the app.
//    Connects the React Native UI to the backend's two trained ML models:
//
//    1. DEMAND FORECAST MODEL (XGBoost Regressor):
//       - Predicts: How many kilograms of batter a shop will need today.
//       - Inputs: Day of week, temperature, festival indicator, past 7-day average.
//       - Output: `predicted_demand_kg` (e.g. 45.2 kg).
//
//    2. SPOILAGE RISK MODEL (Random Forest Classifier):
//       - Predicts: Probability of batter going sour/spoiled before consumption.
//       - Inputs: Storage temperature, ambient humidity, acidity pH, batch transit time.
//       - Output: `spoilage_risk_percent` (e.g. 18.5%) and `risk_level` ('LOW', 'MEDIUM', 'HIGH').
//
//    Stored Variables:
//    - `lastDemandResult` & `lastSpoilageResult`: Last on-demand prediction outputs.
//    - `vendorForecast`: Live forecast tailored to the currently viewed vendor.
//    - `batchSpoilage`: Spoilage risk calculated for a specific batch.
// ════════════════════════════════════════════════════════════════════════════

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

// ── TypeScript Definition for Prediction Store State ────────────────────────
interface PredictionState {
  lastDemandResult: DemandPredictionResult | null;
  lastSpoilageResult: SpoilagePredictionResult | null;
  vendorForecast: VendorForecastResult | null;
  batchSpoilage: BatchSpoilageResult | null;
  history: PredictionHistoryItem[];
  stats: PredictionStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions for running AI inference
  runDemandPrediction: (data: DemandPredictionInput) => Promise<DemandPredictionResult | null>;
  runSpoilagePrediction: (data: SpoilagePredictionInput) => Promise<SpoilagePredictionResult | null>;
  fetchVendorForecast: (vendorId: string) => Promise<VendorForecastResult | null>;
  fetchBatchSpoilage: (batchId: string) => Promise<BatchSpoilageResult | null>;
  fetchHistory: (type?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  clearResults: () => void;
}

// ── Create the Zustand Store: usePredictionStore ────────────────────────────
export const usePredictionStore = create<PredictionState>((set) => ({
  lastDemandResult: null,
  lastSpoilageResult: null,
  vendorForecast: null,
  batchSpoilage: null,
  history: [],
  stats: null,
  isLoading: false,
  error: null,

  // Reset all active predictions (clears results from UI cards)
  clearResults: () =>
    set({
      lastDemandResult: null,
      lastSpoilageResult: null,
      vendorForecast: null,
      batchSpoilage: null,
      error: null,
    }),

  // ── 1. RUN DEMAND PREDICTION (XGBoost) ────────────────────────────────────
  // Sends custom environmental & historical variables to `/api/predict/demand`
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

  // ── 2. RUN SPOILAGE PREDICTION (Random Forest) ────────────────────────────
  // Sends temperature, humidity, pH, and transit time to `/api/predict/spoilage`
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

  // ── 3. FETCH AUTOMATIC VENDOR FORECAST ────────────────────────────────────
  // Gets today's automated demand prediction for a specific vendor outlet
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

  // ── 4. CHECK SPECIFIC BATCH SPOILAGE RISK ─────────────────────────────────
  // Evaluates risk for a manufactured batch using its age, transit & sensors
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

  // ── 5. FETCH PREDICTION LOGS / HISTORY ────────────────────────────────────
  // Fetches audit log of past AI predictions made by the system
  fetchHistory: async (type?: string) => {
    try {
      set({ isLoading: true, error: null });
      const history = await predictionService.getHistory(type ? { type } : undefined);
      set({ history, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch history', isLoading: false });
    }
  },

  // ── 6. FETCH ML MODEL PERFORMANCE METRICS ─────────────────────────────────
  // Fetches model accuracy, R2 score, AUC, and total prediction count
  fetchStats: async () => {
    try {
      const stats = await predictionService.getStats();
      set({ stats });
    } catch {}
  },
}));

