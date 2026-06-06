import api from './axios.js';

export const getTemplates      = (params) => api.get('/payment-templates', { params });
export const createTemplate    = (data)   => api.post('/payment-templates', data);
export const deleteTemplate    = (id)     => api.delete(`/payment-templates/${id}`);
export const markTemplateUsed  = (id)     => api.patch(`/payment-templates/${id}/use`);
