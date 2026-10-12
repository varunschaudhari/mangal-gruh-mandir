// Hall check-in: what each scan result means on screen. Pure — tested in checkInUtils.test.js.

/**
 * Server result (POST /bookings/check-in) → panel tone, heading and feedback sound.
 *   green  let in      amber  look again (already used, wrong hall, batch over)      red  don't let in
 */
const VERDICTS = {
  ok:           { tone: 'green', title: 'Checked in',                         sound: 'success' },
  overridden:   { tone: 'green', title: 'Checked in',                         sound: 'success' },
  already:      { tone: 'amber', title: 'Already checked in',                 sound: 'warning' },
  'other-hall': { tone: 'amber', title: 'This slip is for another hall',      sound: 'warning' },
  'batch-over': { tone: 'amber', title: 'This batch is over',                 sound: 'warning' },
  early:        { tone: 'red',   title: 'Booked for another day',             sound: 'error' },
  past:         { tone: 'red',   title: 'This booking was for an earlier day', sound: 'error' },
  voided:       { tone: 'red',   title: 'This booking was cancelled',         sound: 'error' },
  'no-visit':   { tone: 'gray',  title: 'Nothing to check in',                sound: 'error' },
};

export const verdictOf = (result) => VERDICTS[result] || { tone: 'red', title: 'Not a valid slip', sound: 'error' };

/** Did this scan let the devotee in? */
export const isLetIn = (result) => result === 'ok' || result === 'overridden';

/** What a handheld scanner or the keyboard typed, tidied (scanners add Enter / Tab, people add spaces). */
export const cleanCode = (raw) => String(raw ?? '').replace(/[\r\n\t]/g, '').trim();

/** Why staff let someone in anyway (booking.checkInOverride) — English key for t(). */
export const overrideText = (reason) => ({
  'batch-over': 'Let in anyway: batch was over',
  'other-hall': 'Let in anyway: came to another hall',
}[reason] || '');

const minutesOf = (h, m, ampm) => ((Number(h) % 12) + (/pm/i.test(ampm) ? 12 : 0)) * 60 + Number(m);

/**
 * Where a batch stands right now, from its label ("7:00 AM – 8:15 AM"): 'now', 'over', 'later',
 * or '' when the label has no times (slot / arrangement sevas).
 */
export function batchState(label, now = new Date()) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return '';
  const start = minutesOf(m[1], m[2], m[3]);
  const end = minutesOf(m[4], m[5], m[6]);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur >= end) return 'over';
  return cur >= start ? 'now' : 'later';
}

/** Share of a batch that has arrived, 0–100. */
export const arrivedPercent = (arrived, total) => (total > 0 ? Math.min(100, Math.round((arrived / total) * 100)) : 0);

// The hall this scanner stands at, remembered on the device ('' = all halls).
const HALL_KEY = 'mgm-checkin-hall';
export const savedHall = () => { try { return localStorage.getItem(HALL_KEY) || ''; } catch { return ''; } };
export const saveHall = (hall) => { try { localStorage.setItem(HALL_KEY, hall || ''); } catch { /* private window */ } };

// Start of a "7:00 AM – 8:15 AM" label; null for labels without a start time ("Early morning – 7:00 AM").
const startMinutes = (label) => {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i.exec(label || '');
  return m ? minutesOf(m[1], m[2], m[3]) : null;
};

/**
 * What the hall screen shows at `now`: the batches running now; the next ones to start (all
 * halls starting at the same time); and those without fixed times. Groups come from /hall-board.
 */
export function pickBoard(groups = [], now = new Date()) {
  const withState = groups.map((g) => ({ ...g, state: batchState(g.label, now) }));
  const later = withState.filter((g) => g.state === 'later')
    .sort((a, b) => startMinutes(a.label) - startMinutes(b.label));
  const firstStart = later.length ? startMinutes(later[0].label) : null;
  return {
    current: withState.filter((g) => g.state === 'now'),
    next: later.filter((g) => startMinutes(g.label) === firstStart),
    untimed: withState.filter((g) => g.state === ''),
    over: withState.filter((g) => g.state === 'over'),
  };
}

/** Whole minutes until a batch starts (0 once it has). */
export const minutesUntil = (label, now = new Date()) => {
  const start = startMinutes(label);
  return start == null ? null : Math.max(0, start - (now.getHours() * 60 + now.getMinutes()));
};

/** Tile size for the serial grid: fewer bookings, bigger tiles (read from across the hall). */
export const tileSize = (n) => (n <= 24 ? 'lg' : n <= 60 ? 'md' : 'sm');
