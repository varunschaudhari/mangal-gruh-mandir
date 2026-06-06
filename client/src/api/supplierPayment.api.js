import api from './axios.js';

export const getPayments            = (params)      => api.get('/supplier-payments', { params });
export const getPayment             = (id)           => api.get(`/supplier-payments/${id}`);
export const getPaymentCounts       = ()             => api.get('/supplier-payments/counts');
export const createPayment          = (data)         => api.post('/supplier-payments', data);
export const approvePayment         = (id, data)     => api.patch(`/supplier-payments/${id}/approve`, data || {});
export const rejectPayment          = (id, data)     => api.patch(`/supplier-payments/${id}/reject`, data);
export const bulkApprovePayments    = (data)         => api.post('/supplier-payments/bulk-approve', data);
export const voidPayment            = (id, data)     => api.patch(`/supplier-payments/${id}/void`, data);
export const exportPayments         = (params)       => api.get('/supplier-payments/export', { params, responseType: 'blob' });
export const getSupplierAging           = ()         => api.get('/supplier-payments/aging');
export const getPaymentDashboardSummary = ()         => api.get('/supplier-payments/dashboard-summary');
export const downloadVoucher        = (id)           => api.get(`/supplier-payments/${id}/voucher`, { responseType: 'blob' });
export const getSupplierInvoices    = (supplierId)   => api.get(`/supplier-payments/invoices/${supplierId}`);
export const getSupplierLedger      = (supplierId)   => api.get(`/supplier-payments/ledger/${supplierId}`);
export const getSupplierOutstanding = (supplierId)   => api.get(`/supplier-payments/outstanding/${supplierId}`);
export const getInvoiceRegister     = (params)       => api.get('/supplier-payments/invoice-register', { params });
