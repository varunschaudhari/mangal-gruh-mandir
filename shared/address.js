// Addresses kept in parts: house/street, area (village / locality), city (taluka), district,
// state and PIN. Used by the server (Excel/PDF exports) and the app (receipts, detail screens).

export const ADDRESS_PARTS = ['pincode', 'area', 'city', 'district', 'state'];

/** Indian PIN code: 6 digits, not starting with 0. */
export const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || ''));

/** One line, repeated parts (city = district) written once, PIN at the end. */
export function formatAddress(a = {}) {
  const parts = [];
  const seen = new Set();
  const add = (v, prefix = '') => {
    const s = String(v || '').trim();
    if (!s || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    parts.push(prefix + s);
  };
  add(a.address);
  add(a.area);
  add(a.city);
  add(a.district, 'Dist. ');
  add(a.state);
  const line = parts.join(', ');
  const pin = String(a.pincode || '').trim();
  return pin ? `${line}${line ? ' – ' : ''}${pin}` : line;
}
