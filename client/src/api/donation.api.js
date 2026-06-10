import api from './axios.js';

export const getDonations          = (params)     => api.get('/donations', { params });
export const getDonation           = (id)          => api.get(`/donations/${id}`);
export const getDonationStats      = (params)      => api.get('/donations/stats', { params });
export const createDonation        = (data)        => api.post('/donations', data);
export const voidDonation          = (id, data)    => api.patch(`/donations/${id}/void`, data);
export const exportDonationsExcel  = (params)      => api.get('/donations/export/excel', { params, responseType: 'blob' });
export const exportDonationsPDF    = (params)      => api.get('/donations/export/pdf',   { params, responseType: 'blob' });
export const download80GReceipt        = (id) => api.get(`/donations/${id}/80g-receipt`, { responseType: 'blob' });
export const downloadDonationReceipt   = (id) => api.get(`/donations/${id}/receipt`,     { responseType: 'blob' });
export const downloadDonorStatement    = (id) => api.get(`/donations/donor-statement/${id}`, { responseType: 'blob' });
export const lookupDonor               = (phone) => api.get('/donations/lookup-donor', { params: { phone } });
