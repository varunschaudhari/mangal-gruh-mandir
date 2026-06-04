import api from './axios.js';

export const getBorrowGroups  = (params) => api.get('/borrow-groups', { params });
export const getBorrowGroup   = (id)     => api.get(`/borrow-groups/${id}`);
export const createBorrowGroup = (data)  => api.post('/borrow-groups', data);
export const checkoutGroup    = (id, data) => api.patch(`/borrow-groups/${id}/checkout`, data);
export const extendGroup      = (id, data) => api.patch(`/borrow-groups/${id}/extend`, data);
export const cancelGroup      = (id, data) => api.patch(`/borrow-groups/${id}/cancel`, data);
