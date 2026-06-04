import api from './axios.js';

export const getUsers     = (params) => api.get('/users', { params });
export const getApprovers = ()       => api.get('/users/approvers');
export const getUser = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const resetUserPassword = (id, data) => api.put(`/users/${id}/reset-password`, data);
