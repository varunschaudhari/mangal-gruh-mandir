import api from './axios.js';

/** PIN code → { state, district, city (taluka), areas[] } from India Post (cached on the server). */
export const getPincode = (pin) => api.get(`/pincode/${pin}`);
