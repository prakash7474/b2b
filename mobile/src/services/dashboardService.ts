import api from '../api/client';
import type { DashboardStats } from '../types';

const dashboardService = {
  get() {
    return api.get<DashboardStats>('/api/dashboard');
  },
};

export default dashboardService;
