/**
 * API Client — Central typed fetch wrapper for all backend calls.
 *
 * Usage:
 *   import api from '../api/client';
 *   const data = await api.get<Vendor[]>('/api/vendors');
 *   const res  = await api.post<DemandForecast>('/api/predict-demand', body);
 *
 * All methods return parsed JSON. Errors are thrown as { message, status }.
 */

import { API_BASE_URL } from '../config';

const BASE_URL = API_BASE_URL;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  return data as T;
}

const api = {
  get:    <T>(path: string)         => request<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string)         => request<T>('DELETE', path),
};

export default api;
