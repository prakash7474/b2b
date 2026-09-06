import api from '../api/client';
import type { Product } from '../types';

const productService = {
  list() {
    return api.get<Product[]>('/api/products');
  },

  create(data: Partial<Product>) {
    return api.post<{ ok: boolean; product_id: string }>('/api/products', data);
  },

  remove(productId: string) {
    return api.delete<{ ok: boolean }>(`/api/products/${productId}`);
  },
};

export default productService;
