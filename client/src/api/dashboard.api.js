import api from './axios.js';

export const getDashboardStats = () => api.get('/dashboard');
