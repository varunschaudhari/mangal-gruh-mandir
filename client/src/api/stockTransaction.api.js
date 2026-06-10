import api from './axios.js';

export const getTransactions = (params) => api.get('/transactions', { params });
export const getTransaction = (id) => api.get(`/transactions/${id}`);
export const createTransaction = (data) => api.post('/transactions', data);
export const createBatchTransactions = (data) => api.post('/transactions/batch', data);
export const voidTransaction = (id, voidReason) => api.patch(`/transactions/${id}/void`, { voidReason });
export const checkInvoiceDuplicate = (supplier, invoiceNumber) => api.get('/transactions/check-invoice', { params: { supplier, invoiceNumber } });
