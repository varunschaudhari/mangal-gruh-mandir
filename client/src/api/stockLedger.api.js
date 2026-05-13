import api from './axios.js';

export const getLedger = (params) => api.get('/ledger', { params });
