// ZKTeco / eSSL "ADMS" push protocol: the machine, set to our server as its cloud server,
// sends each punch over plain HTTP. Lines in an ATTLOG upload look like
//   <PIN>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t<workcode>\t…
// The time is the machine's own clock (set to IST).
import Punch from '../../models/Punch.js';
import Staff from '../../models/Staff.js';

const VERIFY = { 0: 'password', 1: 'finger', 2: 'card', 4: 'card', 15: 'face', 25: 'palm' };
const LINE = /^\s*(\S+)\t(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\t(\d+))?(?:\t(\d+))?/;

export function parseAttlog(body) {
  const out = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = line.match(LINE);
    if (!m) continue;
    const [, pin, y, mo, d, h, mi, s, , verify] = m;
    out.push({
      pin,
      time: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
      verify: VERIFY[Number(verify)] ?? (verify || ''),
    });
  }
  return out;
}

/** Saves machine punches (duplicates ignored — machines resend after reconnecting). */
export async function ingestPunches(serial, records) {
  if (!records.length) return 0;
  const staff = await Staff.find({ machineId: { $in: [...new Set(records.map((r) => r.pin))] } }).select('_id machineId').lean();
  const byPin = new Map(staff.map((s) => [s.machineId, s._id]));
  const docs = records.map((r) => ({
    machineId: r.pin, staff: byPin.get(r.pin), time: r.time, source: 'machine', device: serial, verify: r.verify,
  }));
  try {
    const res = await Punch.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    // Duplicate key errors only mean we already had those punches.
    if (err.code === 11000 || err.writeErrors?.every((e) => e.code === 11000)) {
      return err.insertedDocs?.length ?? err.result?.insertedCount ?? 0;
    }
    throw err;
  }
}

/** Reply to the machine's first request: what to send us and how often. */
export const handshake = (serial) => [
  `GET OPTION FROM: ${serial}`,
  'ATTLOGStamp=None',
  'OPERLOGStamp=9999',   // we don't need the machine's operation log
  'ATTPHOTOStamp=None',
  'ErrorDelay=30',
  'Delay=10',
  'TransTimes=00:00;14:05',
  'TransInterval=1',
  'TransFlag=TransData AttLog',
  'Realtime=1',
  'Encrypt=None',
].join('\n');

// ── Which network addresses a machine may send from ─────────────────────────────

/** "::ffff:49.36.12.7" → "49.36.12.7" */
export const cleanIp = (ip) => String(ip || '').replace(/^::ffff:/, '');

const IP_ENTRY = /^(\d{1,3}(\.\d{1,3}){3}|(\d{1,3}\.){1,3}\*|[0-9a-f]*:[0-9a-f:]*)$/i;   // IPv4, IPv4 range with *, IPv6

/** The entries of an allowed-address list, or throws on a bad one. */
export function parseAllowedIps(text) {
  const entries = String(text || '').split(/[\s,]+/).filter(Boolean);
  const bad = entries.find((e) => !IP_ENTRY.test(e));
  if (bad) throw new Error(`"${bad}" is not an address — use e.g. 49.36.12.7 or 49.36.12.*`);
  return entries;
}

/** Is `ip` in the list ("49.36.12.7", or "49.36.12.*" for the whole range)? An empty list allows any. */
export function ipAllowed(ip, list) {
  const entries = String(list || '').split(/[\s,]+/).filter(Boolean);
  if (!entries.length) return true;
  const addr = cleanIp(ip);
  return entries.some((e) => (e.endsWith('*') ? addr.startsWith(e.slice(0, -1)) : addr === e));
}
