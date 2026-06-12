import api from './axios.js';

export const getAssetUnits  = (assetId)       => api.get('/asset-units', { params: { asset: assetId } });
export const updateAssetUnit = (id, data)      => api.patch(`/asset-units/${id}`, data);
export const generateUnits  = (data)           => api.post('/asset-units/generate', data);
