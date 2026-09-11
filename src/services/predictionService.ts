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
  async predictDemand(data: DemandPredictionInput): Promise<DemandPredictionResult> {
    const res = await api.post<DemandPredictionResult>('/api/predict-demand', data);
    return res.data;
  },

  async predictSpoilage(data: SpoilagePredictionInput): Promise<SpoilagePredictionResult> {
    const res = await api.post<SpoilagePredictionResult>('/api/predict-spoilage', data);
    return res.data;
  },

  async getVendorDemandForecast(vendorId: string): Promise<VendorForecastResult> {
    const res = await api.get<VendorForecastResult>(
      `/api/vendors/${encodeURIComponent(vendorId)}/demand-forecast`
    );
    return res.data;
  },

  async getBatchSpoilageRisk(batchId: string): Promise<BatchSpoilageResult> {
    const res = await api.get<BatchSpoilageResult>(
      `/api/batches/${encodeURIComponent(batchId)}/predict-spoilage`
    );
    return res.data;
  },

  async getVendorSpoilageRisk(vendorId: string): Promise<VendorSpoilageResult> {
    const res = await api.get<VendorSpoilageResult>(
      `/api/vendors/${encodeURIComponent(vendorId)}/predict-spoilage`
    );
    return res.data;
  },

  async getHistory(params?: { type?: string; limit?: number }): Promise<PredictionHistoryItem[]> {
    const res = await api.get<PredictionHistoryItem[]>('/api/history', { params });
    return res.data;
  },

  async getStats(): Promise<PredictionStats> {
    const res = await api.get<PredictionStats>('/api/stats');
    return res.data;
  },

  async getFestivalCalendar(region?: string): Promise<any[]> {
    const params = region ? { region } : {};
    const res = await api.get<any[]>('/api/festival-calendar', { params });
    return res.data;
  },

  async getWeatherForecast(date?: string): Promise<any> {
    const params = date ? { date } : {};
    const res = await api.get<any>('/api/weather-forecast', { params });
    return res.data;
  },
};
