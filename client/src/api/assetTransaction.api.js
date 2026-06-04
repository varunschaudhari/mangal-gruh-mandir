import api from './axios.js';

export const getAssetTransactions  = (params)    => api.get('/asset-transactions', { params });
export const getAssetTransaction   = (id)         => api.get(`/asset-transactions/${id}`);
export const createBorrowRequest   = (data)       => api.post('/asset-transactions', data);
export const checkoutAsset         = (id, data)   => api.patch(`/asset-transactions/${id}/checkout`, data);
export const returnAsset           = (id, data)   => api.patch(`/asset-transactions/${id}/return`, data);
export const extendBorrow          = (id, data)   => api.patch(`/asset-transactions/${id}/extend`, data);
export const cancelBorrow          = (id, data)   => api.patch(`/asset-transactions/${id}/cancel`, data);
export const sendManualReminder    = (id)         => api.post(`/asset-transactions/${id}/send-reminder`);
export const bulkSendReminders     = ()           => api.post('/asset-transactions/bulk-remind');
export const getAvailability       = (params)     => api.get('/asset-transactions/availability', { params });
export const getAssetCounts        = ()           => api.get('/asset-transactions/counts');
