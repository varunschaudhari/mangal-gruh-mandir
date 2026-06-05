import api from './axios.js';

export const getOccasions    = (params) => api.get('/donation-occasions', { params });
export const createOccasion  = (data)   => api.post('/donation-occasions', data);
export const updateOccasion  = (id, data) => api.put(`/donation-occasions/${id}`, data);
export const deleteOccasion  = (id)     => api.delete(`/donation-occasions/${id}`);
