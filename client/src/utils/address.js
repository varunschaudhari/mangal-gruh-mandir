// Address kept in parts (house/street, area, city, district, state, PIN) → one line.
// Same rules as server/src/utils/address.js: repeated parts (city = district) are written once.
export const ADDRESS_PARTS = ['pincode', 'area', 'city', 'district', 'state'];

export const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || ''));

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
