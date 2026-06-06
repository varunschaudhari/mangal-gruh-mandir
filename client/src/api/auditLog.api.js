import api from './axios';

export const getAuditLogs = (params) => api.get('/audit-logs', { params });
export const getEntityHistory = (entityRef) => api.get(`/audit-logs/entity/${entityRef}`);
export const exportAuditLogsExcel = (params) =>
  api.get('/audit-logs/export', { params, responseType: 'blob' });
