import api from './axios.js';

export const getUtilizationReport = ()       => api.get('/asset-reports/utilization');
export const getFineReport         = (params) => api.get('/asset-reports/fines', { params });
export const exportAssetExcel      = (params) => api.get('/asset-reports/export/excel', { params, responseType: 'blob' });
export const exportAssetPDF        = (params) => api.get('/asset-reports/export/pdf',   { params, responseType: 'blob' });
