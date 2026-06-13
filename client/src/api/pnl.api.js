import api from './axios.js';

export const getPnL       = (params) => api.get('/pnl', { params });
export const getPnLTrend  = (params) => api.get('/pnl/trend', { params });
export const exportPnLPdf = (params) => api.get('/pnl/export/pdf', { params, responseType: 'blob' });
