import axios from 'axios';
import api from './axios.js';
import { serverUrl } from '../utils/platform.js';

export const issueCoupons    = (data)    => api.post('/mahaprasad/issue', data);
export const getDailySummary = (date)    => api.get('/mahaprasad/summary', { params: date ? { date } : {} });
export const getCoupons      = (params)  => api.get('/mahaprasad/coupons', { params });
export const lookupCoupon    = (number)  => api.get(`/mahaprasad/lookup/${encodeURIComponent(number)}`);
export const redeemCoupon    = (number)  => api.patch(`/mahaprasad/redeem/${encodeURIComponent(number)}`);
export const printCoupons    = (numbers) => api.get('/mahaprasad/print', { params: { numbers: numbers.join(',') }, responseType: 'blob' });
export const getReport       = (params)  => api.get('/mahaprasad/report', { params });
export const getBatches       = (date)    => api.get('/mahaprasad/batches', { params: date ? { date } : {} });
export const getMonthlyReport = (params)  => api.get('/mahaprasad/report/monthly', { params });
export const getStaffReport   = (params)  => api.get('/mahaprasad/report/staff',   { params });
export const getWastageReport      = (params)  => api.get('/mahaprasad/report/wastage',   { params });
export const getMahaprasadWhatsApp = (date)    => api.get('/mahaprasad/report/whatsapp', { params: date ? { date } : {} });

export const reserveOffline     = (data) => api.post('/mahaprasad/offline/reserve', data);
export const getTodayForOffline = ()     => api.get('/mahaprasad/offline/today');
export const getRedeemCopy      = ()     => api.get('/mahaprasad/offline/redeem-copy');
export const syncOfflineCoupons = (data) => api.post('/mahaprasad/offline/sync',    data);
// No sign-in: the devotee's coupon QR page (/m/:token)
export const getPublicCoupons   = (token) => axios.get(serverUrl(`/api/public/mahaprasad/${token}`));
// 200 when the server and its database are up, 503 when the database is down
export const checkServer        = ()     => api.get('/health', { timeout: 5000 });

export const getCashDrawer   = (date)  => api.get('/mahaprasad/cash-drawer', { params: date ? { date } : {} });
export const setOpeningFloat = (data)  => api.put('/mahaprasad/cash-drawer/float', data);
export const adjustDrawer    = (data)  => api.patch('/mahaprasad/cash-drawer/adjust', data);
export const voidBatch       = (batchId, reason) => api.patch(`/mahaprasad/batches/${encodeURIComponent(batchId)}/void`, { reason });
// Send a sale's coupons to the devotee's WhatsApp again (didn't arrive, or was deleted)
export const resendBatch     = (batchId) => api.post(`/mahaprasad/batches/${encodeURIComponent(batchId)}/send`);
