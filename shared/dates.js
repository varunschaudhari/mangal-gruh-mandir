// YYYY-MM-DD of the local (India) calendar day — what <input type="date"> and the API's date
// params use. Never use toISOString().split('T')[0] for this: that is the UTC day, so
// 00:00–05:30 IST lands on the previous date, and a local midnight (e.g. the 1st of the
// month) always comes out as the day before.
export const localDateStr = (d = new Date()) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
