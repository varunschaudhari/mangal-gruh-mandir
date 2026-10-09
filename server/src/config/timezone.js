// The temple works on India time. Pin the process to it so "today", day ranges
// (setHours(0…) / setHours(23…)) and the daily schedulers follow the IST calendar
// instead of the container's UTC clock — otherwise 00:00–05:30 IST counts as yesterday.
// Imported first in index.js, before anything creates a Date.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
