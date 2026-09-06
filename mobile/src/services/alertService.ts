import api from '../api/client';
import type { Alert } from '../types';

const alertService = {
  list(params: { alert_type?: string; alert_status?: string } = {}) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<Alert[]>(`/api/alerts${qs ? '?' + qs : ''}`);
  },

  listByType(alertType: string) {
    return api.get<Alert[]>(`/api/alerts?alert_type=${alertType}`);
  },

  listByStatus(alertStatus: string) {
    return api.get<Alert[]>(`/api/alerts?alert_status=${alertStatus}`);
  },
};

export default alertService;
