import api from './axios.js';

export const getDailyReport = (params) => api.get('/reports/daily', { params });
export const getDailyWhatsApp = (params) => api.get('/reports/daily/whatsapp', { params });

/**
 * Triggers a file download by creating a temporary anchor with the
 * Authorization header embedded via a one-time blob URL.
 * Used for PDF and Excel exports that stream directly from the server.
 */
export async function downloadReport(path, params, filename) {
  const response = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const downloadDailyPDF = (params, date) =>
  downloadReport('/reports/daily/pdf', params, `daily-report-${date}.pdf`);

export const downloadDailyExcel = (params, date) =>
  downloadReport('/reports/daily/excel', params, `daily-report-${date}.xlsx`);
