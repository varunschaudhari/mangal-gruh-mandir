import api from './axios.js';

export const getExpenses          = (params)   => api.get('/expenses', { params });
export const getExpense           = (id)        => api.get(`/expenses/${id}`);
export const createExpense        = (data)      => api.post('/expenses', data);
export const getExpenseSummary    = (params)    => api.get('/expenses/summary', { params });
export const approveExpense       = (id)        => api.patch(`/expenses/${id}/approve`);
export const rejectExpense        = (id, data)  => api.patch(`/expenses/${id}/reject`, data);
export const voidExpense          = (id, data)  => api.patch(`/expenses/${id}/void`, data);
export const uploadExpenseReceipt = (id, file)  => {
  const form = new FormData();
  form.append('receipt', file);
  return api.post(`/expenses/${id}/receipt`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const removeExpenseReceipt = (id)        => api.delete(`/expenses/${id}/receipt`);
