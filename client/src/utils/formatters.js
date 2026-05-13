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
