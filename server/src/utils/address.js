// One line for an address kept in parts: house/street, area (village / locality), city (taluka),
// district, state and PIN. Repeated parts (city = district) are written once.
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
