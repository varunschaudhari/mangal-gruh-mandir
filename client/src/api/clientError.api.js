import api from './axios.js';

export const getClientErrors    = ()   => api.get('/client-errors');
export const resolveClientError = (id) => api.delete(`/client-errors/${id}`);
