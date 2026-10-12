import Pincode from '../models/Pincode.js';
import ApiError from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isPincode } from '../../../shared/address.js';

// PIN code → state, district, city (taluka) and the villages / localities it covers, from India
// Post's public directory (api.postalpincode.in), cached in the database.
//
// One PIN covers many post offices — 32 for Amalner's 425401 — and they can belong to more than
// one taluka or even district, so the most common values are taken and the areas are offered as
// a list to choose from.

const API = 'https://api.postalpincode.in/pincode/';
const KEEP_DAYS = 180;          // refresh a found PIN after this
const KEEP_MISSING_DAYS = 7;    // retry an unknown PIN after this
const TIMEOUT_MS = 6000;

export { isPincode };

const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values) if (v && v !== 'NA') counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

// "Amalner (Jalgaon)" → "Amalner", "Shivaji Nagar S.O" → "Shivaji Nagar"
const cleanArea = (name) => String(name || '')
  .replace(/\s*\([^)]*\)\s*$/, '')
  .replace(/\s+(S\.?O|B\.?O|H\.?O|PO|P\.O)\.?$/i, '')
  .trim();

/** India Post's post-office list → { state, district, city, areas }. */
export function summarisePostOffices(offices = []) {
  const state = mostCommon(offices.map((o) => o.State));
  const district = mostCommon(offices.filter((o) => o.State === state).map((o) => o.District));
  const inDistrict = offices.filter((o) => o.District === district);
  // The taluka of most of its post offices; big cities have none ("NA") — use the district
  const city = mostCommon(inDistrict.map((o) => o.Block)) || district;
  const areas = [...new Set(offices.map((o) => cleanArea(o.Name)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { state, district, city, areas };
}

const view = (doc) => ({ pin: doc.pin, found: doc.found, state: doc.state, district: doc.district, city: doc.city, areas: doc.areas });

export async function lookupPincode(pin) {
  if (!isPincode(pin)) throw new ApiError(400, 'A PIN code has 6 digits and does not start with 0');
  const cached = await Pincode.findOne({ pin }).lean();
  const ageDays = cached ? (Date.now() - new Date(cached.fetchedAt)) / 864e5 : Infinity;
  if (cached && ageDays < (cached.found ? KEEP_DAYS : KEEP_MISSING_DAYS)) return view(cached);

  let data;
  try {
    const res = await fetch(API + pin, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`India Post replied ${res.status}`);
    [data] = await res.json();
  } catch (err) {
    logger.warn('PIN code look-up failed', { pin, error: err.message });
    if (cached) return view(cached); // an old answer beats none
    throw new ApiError(503, 'Could not look up the PIN code right now — fill in the city and state by hand');
  }

  const offices = data?.Status === 'Success' && Array.isArray(data.PostOffice) ? data.PostOffice : [];
  const summary = offices.length ? { found: true, ...summarisePostOffices(offices) } : { found: false, state: '', district: '', city: '', areas: [] };
  const doc = await Pincode.findOneAndUpdate({ pin }, { $set: { ...summary, fetchedAt: new Date() } }, { upsert: true, returnDocument: 'after' }).lean();
  return view(doc);
}
