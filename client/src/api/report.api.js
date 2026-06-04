import api from './axios.js';

export const getDailyReport    = (params) => api.get('/reports/daily', { params });
export const getDailyWhatsApp  = (params) => api.get('/reports/daily/whatsapp', { params });
export const getLowStockWhatsApp  = (params) => api.get('/reports/low-stock/whatsapp', { params });
export const getExpiringWhatsApp  = (params) => api.get('/reports/expiring/whatsapp', { params });
export const getValuationReport   = (params) => api.get('/reports/valuation', { params });
export const getSupplierReport    = (params) => api.get('/reports/suppliers', { params });

async function downloadReport(path, params, filename) {
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

const d = () => new Date().toISOString().split('T')[0];

export const downloadDailyPDF        = (params, date)   => downloadReport('/reports/daily/pdf',          params, `daily-report-${date}.pdf`);
export const downloadDailyExcel      = (params, date)   => downloadReport('/reports/daily/excel',        params, `daily-report-${date}.xlsx`);
export const downloadLowStockPDF     = (params)         => downloadReport('/reports/low-stock/pdf',      params, `low-stock-${d()}.pdf`);
export const downloadExpiringPDF     = (params)         => downloadReport('/reports/expiring/pdf',       params, `expiring-stock-${d()}.pdf`);
export const downloadValuationPDF    = (params)         => downloadReport('/reports/valuation/pdf',      params, `stock-valuation-${d()}.pdf`);
export const downloadValuationExcel  = (params)         => downloadReport('/reports/valuation/excel',    params, `stock-valuation-${d()}.xlsx`);
export const downloadSupplierPDF     = (params)         => downloadReport('/reports/suppliers/pdf',      params, `supplier-report-${d()}.pdf`);
export const downloadSupplierExcel   = (params)         => downloadReport('/reports/suppliers/excel',    params, `supplier-report-${d()}.xlsx`);
