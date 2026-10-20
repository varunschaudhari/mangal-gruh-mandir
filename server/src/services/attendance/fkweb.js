// "FkWeb" push protocol — Team Office (Z900…), Realand, EBKN and other machines whose
// Communication menu shows "Server-Client Mode: FkWeb" and a "Web Server URL".
//
// The machine POSTs to the URL; what it is doing is in headers, not the path:
//   request_code  realtime_glog (a punch) · receive_cmd (polls every few seconds for a command)
//                 · send_cmd_result · realtime_enroll_data (someone enrolled on the machine)
//   dev_id        the machine's serial number · trans_id  echoed back in the reply
//   blk_no        only on large uploads sent in parts: 1…N, then 0 for the last part
// The body is a 4-byte length, a JSON object, then binary data (fingerprint templates, photos)
// that the JSON points to as "BIN_1", "BIN_2"… A punch looks like
//   {"user_id":"00000012","io_time":"20261020081503","verify_mode":"FACE","io_mode":1,…}
// The reply is an empty body with `response_code: OK` (or ERROR) as a header. Any text in the
// body makes the machine send the same punch again and again.

const VERIFY = { FP: 'finger', FINGER: 'finger', FACE: 'face', CARD: 'card', IDCARD: 'card', PASSWORD: 'password', PWD: 'password', PALM: 'palm' };
const VERIFY_CODE = { 1: 'finger', 4: 'face', 6: 'password', 15: 'card' };

/**
 * The JSON object at the start of a body. Found by matching braces (outside strings) rather than
 * the last "}", because the binary data after it can contain any byte. null when there is none.
 */
export function readFkJson(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf || '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0; let inString = false; let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        // latin1 kept the bytes as they were; names typed on the machine may be UTF-8
        return JSON.parse(Buffer.from(text.slice(start, i + 1), 'latin1').toString('utf8'));
      } catch { return null; }
    }
  }
  return null;
}

/** "00000012" → "12" (the machine pads numbers with zeros; the app stores them as typed). */
export const fkPin = (id) => {
  const s = String(id ?? '').trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s;
};

/** "20261020081503" or "2026-10-20 08:15:03" (the machine's own clock, India time) → Date */
export function fkTime(value) {
  const m = String(value ?? '').trim().match(/^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const time = new Date(y, mo - 1, d, h, mi, s);
  // Reject impossible dates (month 13, 31 Feb…) instead of letting Date roll them over
  return time.getMonth() === mo - 1 && time.getDate() === d && time.getHours() === h ? time : null;
}

/** finger / face / card / password from verify_mode ("FP", ["FACE","CARD"]) or a numeric code. */
export function fkVerify(json) {
  let mode = json.verify_mode;
  if (Array.isArray(mode)) [mode] = mode;
  if (typeof mode === 'string' && mode.trim()) {
    const key = mode.trim().toUpperCase().split(/[^A-Z]/)[0];
    return VERIFY[key] || mode.trim().toLowerCase().slice(0, 20);
  }
  const code = json.verify_type ?? json.verifyType ?? mode;
  return VERIFY_CODE[Number(code)] || '';
}

/** A realtime_glog body → { pin, time, verify }, or null when it isn't a readable punch. */
export function parseGlog(json) {
  if (!json || typeof json !== 'object') return null;
  const pin = fkPin(json.user_id);
  const time = fkTime(json.io_time);
  if (!pin || pin.length > 32 || !time) return null;
  return { pin, time, verify: fkVerify(json) };
}
