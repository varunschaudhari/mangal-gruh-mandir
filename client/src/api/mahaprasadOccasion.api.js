import api from './axios.js';

export const getOccasions    = (params) => api.get('/mahaprasad-occasions', { params });
export const createOccasion  = (data)   => api.post('/mahaprasad-occasions', data);
export const updateOccasion  = (id, data) => api.put(`/mahaprasad-occasions/${id}`, data);
export const deleteOccasion  = (id)     => api.delete(`/mahaprasad-occasions/${id}`);
