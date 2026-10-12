import { useQueryClient } from '@tanstack/react-query';
import Badge from '../../ui/Badge.jsx';
import { useT } from '../../../i18n/index.jsx';

// Shared bits for Bookings → Setup (seva types, halls, batches, closed dates, settings).

export const SETUP_KEY = ['booking-setup'];

/** After a change: refresh the setup screen and anything else booking-related (counter options, availability). */
export const useRefreshBookings = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => /^booking/.test(String(q.queryKey[0])) });
};

/** Server message (translated when the dictionary has it) or a generic failure. */
export const errText = (t, err) => t(err?.response?.data?.message || err?.message || 'Failed');

export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// ── Weekdays (0 = Sunday, as the server stores them) ──────────────────────────
export const WEEKDAYS = [/*t*/ 'Sun', /*t*/ 'Mon', /*t*/ 'Tue', /*t*/ 'Wed', /*t*/ 'Thu', /*t*/ 'Fri', /*t*/ 'Sat'];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const isEveryDay = (days) => !days?.length || ALL_DAYS.every((d) => days.includes(d));
export const weekdaysText = (t, days) => (isEveryDay(days)
  ? t('Every day')
  : [...days].sort((a, b) => a - b).map((d) => t(WEEKDAYS[d])).join(', '));

// ── Times ("07:00" → "7:00 AM") ───────────────────────────────────────────────
export const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
export const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const batchTime = (b) => `${to12h(b.start)} – ${to12h(b.end)}`;
export const lengthText = (t, start, end) => {
  const mins = toMinutes(end) - toMinutes(start);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60); const m = mins % 60;
  if (!h) return t('{m} min', { m });
  return m ? t('{h} h {m} min', { h, m }) : t('{h} h', { h });
};

// Indian financial year (April–March), as on the receipt numbers: "2026-27".
export const financialYear = (d = new Date()) => {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

// ── Schedules ─────────────────────────────────────────────────────────────────
export const SCHEDULES = {
  batch: {
    label: /*t*/ 'In batches', variant: 'blue',
    hint: /*t*/ 'The devotee picks a date and a batch (a time and a hall). Each batch has a limited number of seats — set the times and seats in the Batches tab.',
  },
  slot: {
    label: /*t*/ 'Fixed time', variant: 'purple',
    hint: /*t*/ 'Done at one fixed time on chosen days of the week, e.g. Tuesdays 5–7 AM. You can limit how many are booked for a day.',
  },
  arrangement: {
    label: /*t*/ 'By arrangement', variant: 'orange',
    hint: /*t*/ 'The office agrees a date with the devotee. There is no seat limit.',
  },
  none: {
    label: /*t*/ 'No date', variant: 'gray',
    hint: /*t*/ 'Done on the devotee\'s behalf when they cannot come. No date is chosen; prasad is sent to their postal address.',
  },
};

export function ScheduleBadge({ schedule }) {
  const t = useT();
  const s = SCHEDULES[schedule] || SCHEDULES.batch;
  return <Badge variant={s.variant} className="whitespace-nowrap">{t(s.label)}</Badge>;
}

// Halls get a steady colour so the same hall is easy to spot down the list.
const HALL_COLOURS = ['bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'];
/** Hall codes in Setup order (Setup → Halls), then any code a batch still uses that isn't in the list. */
export const hallList = (batches, halls = []) => {
  const listed = halls.map((h) => h.code);
  const extra = [...new Set(batches.map((b) => b.hall).filter((c) => c && !listed.includes(c)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...listed, ...extra];
};
/** { H1: { name, nameMr } } from the Setup halls list — the shape hallTitle() takes. */
export const hallNamesOf = (halls = []) => Object.fromEntries(halls.map((h) => [h.code, { name: h.name || '', nameMr: h.nameMr || '' }]));
export function HallChip({ hall, halls, title, className = '' }) {
  const i = Math.max(0, halls.indexOf(hall));
  return (
    <span title={title || undefined} className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-0.5 text-sm font-bold ${HALL_COLOURS[i % HALL_COLOURS.length]} ${className}`}>
      {hall}
    </span>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────

/** On/off switch with a 44px touch area on phones. */
export function Switch({ checked, onChange, disabled, label, busy }) {
  return (
    <button
      type="button" role="switch" aria-checked={Boolean(checked)} aria-label={label} title={label}
      disabled={disabled || busy} onClick={() => onChange(!checked)}
      className={`inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed md:h-8 ${busy ? 'opacity-60' : ''} ${disabled && !busy ? 'opacity-50' : ''}`}
    >
      <span className={`flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

/** A labelled row with a switch — for forms. */
export function SwitchRow({ label, hint, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

/** Seven day buttons (Sun … Sat) plus "Every day". Empty or all seven = every day. */
export function WeekdayChips({ value = [], onChange, disabled }) {
  const t = useT();
  const every = isEveryDay(value);
  const chosen = new Set(every ? ALL_DAYS : value);
  const toggle = (d) => {
    const next = new Set(chosen);
    if (next.has(d)) next.delete(d); else next.add(d);
    if (!next.size) return; // at least one day — none at all would mean "every day"
    onChange([...next].sort((a, b) => a - b));
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((name, d) => (
          <button
            key={name} type="button" disabled={disabled} aria-pressed={chosen.has(d)} onClick={() => toggle(d)}
            className={`h-11 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 sm:h-9 ${chosen.has(d)
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}
          >
            {t(name)}
          </button>
        ))}
      </div>
      {!every && (
        <button type="button" disabled={disabled} onClick={() => onChange([...ALL_DAYS])} className="text-sm font-medium text-primary-700 hover:underline">
          {t('Every day')}
        </button>
      )}
    </div>
  );
}
