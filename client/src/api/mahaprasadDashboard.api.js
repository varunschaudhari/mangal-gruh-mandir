import axios from 'axios';
import api from './axios.js';
import { serverUrl } from '../utils/platform.js';

// Mahaprasad dashboard and TV screen (server: controllers/mahaprasadDashboard.controller.js)
export const getMahaprasadDashboard = (date) => api.get('/mahaprasad/dashboard', { params: date ? { date } : {} });
// { date?, target } — a day's total (target null = back to the usual), or without a date the usual daily total
export const setMahaprasadTarget = (body) => api.put('/mahaprasad/dashboard/target', body);
// The TV screen, no sign-in: today's figures only
export const getMahaprasadScreen = () => axios.get(serverUrl('/api/public/mahaprasad-screen'));
