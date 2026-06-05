import api from './axios.js';

export const getSettings    = ()       => api.get('/settings');
export const updateSettings = (data)   => api.put('/settings', data);
export const testWhatsApp   = (phone)  => api.post('/settings/test-whatsapp', { phone });
