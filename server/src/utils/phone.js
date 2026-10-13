// Indian mobile numbers, as devotees give them at the counters.

/** "+91 98811 80662" / "09881180662" / "9881180662" → "9881180662"; '' when it isn't a mobile number. */
export const normaliseMobile = (s) => {
  const digits = String(s ?? '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
      : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
};

/** "9881180662" → "XXXXXX0662" for places others can see. */
export const maskMobile = (m) => (m ? `XXXXXX${String(m).slice(-4)}` : '');
