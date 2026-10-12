import api from './axios.js';

export const getPayrollSettings    = ()               => api.get('/salary/settings');
export const updatePayrollSettings = (data)           => api.put('/salary/settings', data);

export const getSalaryRuns     = ()                   => api.get('/salary/runs');
export const getSalaryRun      = (month)              => api.get(`/salary/runs/${month}`);
export const prepareSalary     = (month)              => api.post(`/salary/runs/${month}/prepare`);
export const editSalaryLine    = (month, staffId, data) => api.patch(`/salary/runs/${month}/lines/${staffId}`, data);
export const finalizeSalary    = (month, body = {})   => api.post(`/salary/runs/${month}/finalize`, body);
export const reopenSalary      = (month)              => api.post(`/salary/runs/${month}/reopen`);
export const markSalaryPaid    = (month, data)        => api.post(`/salary/runs/${month}/paid`, data);
export const deleteSalaryDraft = (month)              => api.delete(`/salary/runs/${month}`);
export const downloadSalaryFile = (month, kind)       => api.get(`/salary/runs/${month}/files/${kind}`, { responseType: 'blob' });

export const getAdvances   = (params) => api.get('/salary/advances', { params });
export const addAdvance    = (data)   => api.post('/salary/advances', data);
export const deleteAdvance = (id)     => api.delete(`/salary/advances/${id}`);
