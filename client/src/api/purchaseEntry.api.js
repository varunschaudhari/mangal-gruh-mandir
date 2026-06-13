import api from './axios.js';

export const getPurchaseEntries  = (params)       => api.get('/purchase-entries', { params });
export const getPurchaseEntry    = (id)            => api.get(`/purchase-entries/${id}`);
export const createPurchaseEntry = (data)          => api.post('/purchase-entries', data);
export const voidPurchaseEntry   = (id, data)      => api.patch(`/purchase-entries/${id}/void`, data);
export const updatePurchaseEntry = (id, data)      => api.patch(`/purchase-entries/${id}`, data);
export const getPendingEntries   = (supplierId)    => api.get(`/purchase-entries/pending/${supplierId}`);
