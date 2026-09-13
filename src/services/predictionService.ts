// ════════════════════════════════════════════════════════════════════════════
// 📌 ML PREDICTION SERVICE (src/services/predictionService.ts)
// WHAT THIS DOES:
//   Connects the frontend UI to the backend AI/ML endpoints:
//   1. XGBoost Demand Forecasting (predicts kg demand per slot/day)
//   2. Random Forest Spoilage Risk (predicts Low/Medium/High risk for batches)
//   3. Weather & Festival context queries
// ════════════════════════════════════════════════════════════════════════════

import { api } from './api';
import {
  DemandPredictionInput,
  DemandPredictionResult,
  SpoilagePredictionInput,
  SpoilagePredictionResult,
  VendorForecastResult,
  BatchSpoilageResult,
  VendorSpoilageResult,
  PredictionHistoryItem,
  PredictionStats,
} from '../types/prediction';

export const predictionService = {
  // ── 1. Predict Demand for Custom Inputs (XGBoost) ───────────────────────
  // Sends features (hour, day, weather, festival) and returns predicted units/kg
  async predictDemand(data: DemandPredictionInput): Promise<DemandPredictionResult> {
    const res = await api.post<DemandPredictionResult>('/api/predict-demand', data);
    return res.data;
  },

  // ── 2. Predict Spoilage Risk for Custom Inputs (Random Forest) ──────────
  // Sends features (pH, temp, humidity, shelf hours) and returns risk score & level
  async predictSpoilage(data: SpoilagePredictionInput): Promise<SpoilagePredictionResult> {
    const res = await api.post<SpoilagePredictionResult>('/api/predict-spoilage', data);
    return res.data;
  },

  // ── 3. Live Demand Forecast for a Specific Vendor ───────────────────────
  // Computes features from real vendor order history, today's weather & calendar
  async getVendorDemandForecast(vendorId: string): Promise<VendorForecastResult> {
    const res = await api.get<VendorForecastResult>(
      `/api/vendors/${encodeURIComponent(vendorId)}/demand-forecast`
    );
    return res.data;
  },

  // ── 4. Spoilage Risk for a Specific Batch ────────────────────────────────
  // Evaluates risk for a given batch based on age, sensor readings, and storage
  async getBatchSpoilageRisk(batchId: string): Promise<BatchSpoilageResult> {
    const res = await api.get<BatchSpoilageResult>(
      `/api/batches/${encodeURIComponent(batchId)}/predict-spoilage`
    );
    return res.data;
  },

  // ── 5. Spoilage Risk for a Vendor's Active Stock ─────────────────────────
  async getVendorSpoilageRisk(vendorId: string): Promise<VendorSpoilageResult> {
    const res = await api.get<VendorSpoilageResult>(
      `/api/vendors/${encodeURIComponent(vendorId)}/predict-spoilage`
    );
    return res.data;
  },

  // ── 6. Prediction History & Audit Log ────────────────────────────────────
  async getHistory(params?: { type?: string; limit?: number }): Promise<PredictionHistoryItem[]> {
    const res = await api.get<PredictionHistoryItem[]>('/api/history', { params });
    return res.data;
  },

  // ── 7. Prediction Model Summary Stats ────────────────────────────────────
  async getStats(): Promise<PredictionStats> {
    const res = await api.get<PredictionStats>('/api/stats');
    return res.data;
  },

  // ── 8. External Context: Festival Calendar ──────────────────────────────
  async getFestivalCalendar(region?: string): Promise<any[]> {
    const params = region ? { region } : {};
    const res = await api.get<any[]>('/api/festival-calendar', { params });
    return res.data;
  },

  // ── 9. External Context: Weather Forecast ────────────────────────────────
  async getWeatherForecast(date?: string): Promise<any> {
    const params = date ? { date } : {};
    const res = await api.get<any>('/api/weather-forecast', { params });
    return res.data;
  },
};
