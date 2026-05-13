import api from './axios.js';

export const login = (data) => api.post('/auth/login', data);
export const refreshToken = (data) => api.post('/auth/refresh', data);
export const logout = () => api.post('/auth/logout');
export const getMe = () => api.get('/auth/me');
export const updateProfile = (data) => api.put('/auth/profile', data);
export const changePassword = (data) => api.put('/auth/change-password', data);
