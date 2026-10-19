import api from './axios.js';

export const getUsers     = (params) => api.get('/users', { params });
export const getApprovers = ()       => api.get('/users/approvers');
export const getUser = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const resetUserPassword = (id, data) => api.put(`/users/${id}/reset-password`, data);
// Super admins only: whether a login can be deleted (it has done nothing in the app), then delete it
export const getUserDeleteCheck = (id) => api.get(`/users/${id}/delete-check`);
export const deleteUser = (id) => api.delete(`/users/${id}`);
