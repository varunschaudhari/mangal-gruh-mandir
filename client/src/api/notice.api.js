import axios from 'axios';
import api from './axios.js';
import { serverUrl } from '../utils/platform.js';

// Notice board (server: controllers/notice.controller.js)
export const getStaffNotices = () => api.get('/notices');          // showing for staff — anyone signed in
export const getAllNotices   = () => api.get('/notices/all');      // every notice, hidden too (notices:manage)
export const createNotice    = (body) => api.post('/notices', body);
export const updateNotice    = (id, body) => api.put(`/notices/${id}`, body);
export const deleteNotice    = (id) => api.delete(`/notices/${id}`);
// No sign-in: the devotees' notice page and the TV screens
export const getPublicNotices = () => axios.get(serverUrl('/api/public/notices'));
