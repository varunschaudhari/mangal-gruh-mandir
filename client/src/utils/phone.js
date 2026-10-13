// Indian mobile numbers, as devotees give them at the counters (booking, Mahaprasad).

/** What was typed or pasted → up to 10 digits: "+91 98811 80662" → "9881180662". */
export function cleanPhoneInput(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);       // pasted "+91 98xxx xxxxx"
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);   // "098xxxxxxxx"
  return d.slice(0, 10);                                           // an 11th typed digit is ignored
}

/** A 10-digit Indian mobile number (6–9 first). */
export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(String(p || ''));
