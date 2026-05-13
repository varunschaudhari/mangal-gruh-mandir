import api from './axios.js';

export const getExpiringBatches = (params) => api.get('/batches/expiring', { params });
export const getBatchesForProduct = (params) => api.get('/batches', { params });
