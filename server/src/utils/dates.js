// Calendar helpers for the app's time zone (IST — see config/timezone.js).

export const APP_TIMEZONE = process.env.TZ || 'Asia/Kolkata';

const pad = (n) => String(n).padStart(2, '0');

// YYYY-MM-DD of the local (IST) day. Use this instead of toISOString().split('T')[0],
// which gives the UTC day and puts 00:00–05:30 IST on the previous date.
export const localDateStr = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
