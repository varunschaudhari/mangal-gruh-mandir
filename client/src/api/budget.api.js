import api from './axios.js';

export const getBudgets        = (params) => api.get('/budgets', { params });
export const upsertBudgets     = (data)   => api.put('/budgets', data);
export const copyPrevBudgets   = (params) => api.get('/budgets/copy-prev', { params });
