import BookingBatch from '../../models/BookingBatch.js';
import BookingHall from '../../models/BookingHall.js';

// Halls (Setup → Halls). Batches and bookings store the hall's short code (H1); the display
// names live here, so renaming a hall changes it everywhere and old bookings stay right.

/**
 * Adds a row for every hall code a batch uses that isn't in the list yet (halls set up before
 * the list existed, or added by a seed) — with no name, so it shows as its code until named.
 */
export async function syncHalls() {
  const [used, known] = await Promise.all([BookingBatch.distinct('hall'), BookingHall.distinct('code')]);
  const have = new Set(known);
  const missing = [...new Set(used.map((c) => String(c || '').trim()).filter(Boolean))].filter((c) => !have.has(c)).sort();
  if (!missing.length) return 0;
  const start = await BookingHall.countDocuments();
  const res = await BookingHall.bulkWrite(missing.map((code, i) => ({
    updateOne: { filter: { code }, update: { $setOnInsert: { code, sortOrder: start + i } }, upsert: true },
  })), { ordered: false });
  return res.upsertedCount;
}

let synced = null;   // once per process for readers; Setup syncs on every load
const ensureSynced = () => (synced ||= syncHalls().catch((err) => { synced = null; throw err; }));

/** Every hall, in Setup order. */
export async function listHalls({ sync = false } = {}) {
  await (sync ? syncHalls() : ensureSynced());
  return BookingHall.find().sort({ sortOrder: 1, code: 1 }).lean();
}

/** { H1: { name, nameMr }, … } for screens and slips; a hall with no name shows as its code. */
export async function hallNames() {
  const halls = await listHalls();
  return Object.fromEntries(halls.map((h) => [h.code, { name: h.name || '', nameMr: h.nameMr || '' }]));
}

/** Hall codes in Setup order (codes not in the list go last, alphabetically). */
export function sortHallCodes(codes, names) {
  const order = Object.keys(names || {});
  const rank = (c) => { const i = order.indexOf(c); return i < 0 ? order.length : i; };
  return [...new Set(codes.filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** "Shri Mangal Sabhagruh (H1)" — or just "H1" when the hall has no name. */
export function hallTitle(code, names) {
  if (!code) return '';
  const name = names?.[code]?.name;
  return name ? `${name} (${code})` : code;
}
