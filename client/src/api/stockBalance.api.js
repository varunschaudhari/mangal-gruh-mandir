import api from './axios.js';

export const getBalances = (params) => api.get('/balances', { params });
export const getProductBalance = (productId, departmentId) =>
  api.get(`/balances/${productId}/${departmentId}`);
