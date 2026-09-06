import api from '../api/client';
import type { Recommendation } from '../types';

const recommendationService = {
  list() {
    return api.get<Recommendation[]>('/api/recommendations');
  },
};

export default recommendationService;
