import api from './axios.js';

export const getAssets        = (params)     => api.get('/assets', { params });
export const getAsset         = (id)          => api.get(`/assets/${id}`);
export const createAsset      = (data)        => api.post('/assets', data);
export const updateAsset      = (id, data)    => api.put(`/assets/${id}`, data);
export const deleteAsset      = (id)          => api.delete(`/assets/${id}`);
export const getAvailability  = (params)      => api.get('/asset-transactions/availability', { params });
