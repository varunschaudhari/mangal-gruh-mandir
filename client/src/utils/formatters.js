import { format, parseISO, isValid } from 'date-fns';

export const fDate = (date, fmt = 'dd MMM yyyy') => {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, fmt) : '—';
};

export const fDateTime = (date) => fDate(date, 'dd MMM yyyy, hh:mm a');

export const fNumber = (num, decimals = 2) =>
  num != null ? Number(num).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';

export const fCurrency = (num) =>
  num != null ? `₹${fNumber(num)}` : '—';

export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ') : '';

// YYYY-MM-DD of the device's local (India) calendar day — what <input type="date">
// and the API's date params expect. Never use toISOString().split('T')[0] for this:
// that is the UTC day, so 00:00–05:30 IST lands on the previous date, and a local
// midnight (e.g. the 1st of the month) always comes out as the day before.
export const localDateStr = (d = new Date()) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
