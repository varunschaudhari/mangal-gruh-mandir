import api from './axios.js';

export const getAttendanceSettings    = ()             => api.get('/attendance/settings');
export const updateAttendanceSettings = (data)         => api.put('/attendance/settings', data);

export const getStaffList     = (params)     => api.get('/attendance/staff', { params });
export const getStaff         = (id)         => api.get(`/attendance/staff/${id}`);
export const createStaff      = (data)       => api.post('/attendance/staff', data);
export const updateStaff      = (id, data)   => api.put(`/attendance/staff/${id}`, data);
export const getUnmappedIds   = ()           => api.get('/attendance/staff/unmapped');

export const getRoster        = (params)     => api.get('/attendance/roster', { params });
export const saveRoster       = (entries)    => api.put('/attendance/roster', { entries });
export const copyRosterWeek   = (data)       => api.post('/attendance/roster/copy-week', data);

export const getAttendanceDays = (params)    => api.get('/attendance/days', { params });
export const getStaffDay      = (staffId, date) => api.get(`/attendance/days/${staffId}/${date}`);
export const downloadRegisterExcel = (params) => api.get('/attendance/register/excel', { params, responseType: 'blob' });

export const addManualPunch   = (data)       => api.post('/attendance/punches', data);
export const ignorePunch      = (id, data)   => api.patch(`/attendance/punches/${id}/ignore`, data);
export const setOverride      = (data)       => api.put('/attendance/overrides', data);
export const removeOverride   = (staffId, date) => api.delete(`/attendance/overrides/${staffId}/${date}`);

export const getMonth             = (params) => api.get('/attendance/month', { params });
export const markLeave            = (data)   => api.post('/attendance/leave', data);
export const setDoubleDecision    = (data)   => api.put('/attendance/doubles', data);
export const clearDoubleDecision  = (staffId, date) => api.delete(`/attendance/doubles/${staffId}/${date}`);
export const setMonthAdjustment   = (data)   => api.put('/attendance/month-adjustments', data);
