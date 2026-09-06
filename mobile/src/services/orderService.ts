import api from '../api/client';
import type { Order } from '../types';

const orderService = {
  list() {
    return api.get<Order[]>('/api/orders');
  },

  get(orderId: string) {
    return api.get<Order>(`/api/orders/${orderId}`);
  },
};

export default orderService;
