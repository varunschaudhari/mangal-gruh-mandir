import api from './axios.js';

export const getUsers = () => api.get('/users');
export const getUser = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const resetUserPassword = (id, data) => api.put(`/users/${id}/reset-password`, data);
