import axios from 'axios';
import api from './axios.js';
import { serverUrl } from '../utils/platform.js';

// Mahaprasad coupons bought online (server: services/mahaprasadOnline.service.js).
// No sign-in: the devotee's page (/prasad)
export const getOnlineInfo   = ()      => axios.get(serverUrl('/api/public/mahaprasad-online'));
export const createOnlineOrder = (data) => axios.post(serverUrl('/api/public/mahaprasad-online/orders'), data);
export const getOnlineOrder  = (token, check = false) =>
  axios.get(serverUrl(`/api/public/mahaprasad-online/orders/${encodeURIComponent(token)}`), { params: check ? { check: 1 } : {} });
export const verifyOnlineOrder = (token, answer) =>
  axios.post(serverUrl(`/api/public/mahaprasad-online/orders/${encodeURIComponent(token)}/verify`), answer);
// The payment receipt of a coupon bought online (from the coupon page /m/:token)
export const onlineReceiptUrl = (shareToken) => serverUrl(`/api/public/mahaprasad/${shareToken}/receipt.pdf`);

// Staff: every online order, to match with Razorpay
export const getOnlineOrders = (params) => api.get('/mahaprasad/online-orders', { params });
