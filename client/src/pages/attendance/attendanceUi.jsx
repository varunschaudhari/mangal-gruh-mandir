import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, PenLine, Undo2, EyeOff, Plus, AlertTriangle, Moon, Sun, Gift, IndianRupee, Ban, PartyPopper } from 'lucide-react';
import toast from 'react-hot-toast';
import Sheet from '../../components/ui/Sheet.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import {
  addManualPunch, clearDoubleDecision, getStaffDay, ignorePunch, removeOverride, setDoubleDecision, setOverride,
} from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fCurrency, fDate, localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';
import { dayCode } from '../../../../shared/attendanceCodes.js';

// Shared bits of the attendance screens: status colours/codes, time helpers, the shift
// chip, the double-shift reward picker and the day-detail sheet where supervisors fix a day.

export const STATUS = {
  present:       { label: 'Present',        cls: 'bg-green-100 text-green-800' },
  half_day:      { label: 'Half Day',       cls: 'bg-yellow-100 text-yellow-800' },
  absent:        { label: 'Absent',         cls: 'bg-red-100 text-red-700' },
  leave:         { label: 'On Leave',       cls: 'bg-teal-100 text-teal-700' },
  off:           { label: 'Weekly Off',     cls: 'bg-gray-100 text-gray-600' },
  holiday:       { label: 'Holiday',        cls: 'bg-rose-100 text-rose-700' },
  worked_off:    { label: 'Worked on Off Day', cls: 'bg-indigo-100 text-indigo-700' },
  on_duty:       { label: 'On Duty',        cls: 'bg-blue-100 text-blue-700' },
  missing_punch: { label: 'Missing Punch',  cls: 'bg-orange-100 text-orange-700' },
  working:       { label: 'Working Now',    cls: 'bg-emerald-100 text-emerald-700' },
  not_in:        { label: 'Not In Yet',     cls: 'bg-gray-100 text-gray-500' },
  upcoming:      { label: 'Shift Later',    cls: 'bg-gray-50 text-gray-400' },
  unscheduled:   { label: 'Came Without Shift', cls: 'bg-purple-100 text-purple-700' },
  none:          { label: 'No Shift',       cls: 'bg-gray-50 text-gray-400' },
  not_employed:  { label: 'Not Employed',   cls: 'bg-gray-50 text-gray-400' },
};

// Register cell colours by code (PL / EL / UL come from how leave covered the day)
export const CODE_CELL = {
  P: 'bg-green-50 text-green-700', H: 'bg-yellow-50 text-yellow-700', A: 'bg-red-50 text-red-600', UL: 'bg-red-50 text-red-600',
  PL: 'bg-teal-50 text-teal-700', EL: 'bg-cyan-50 text-cyan-700', L: 'bg-teal-50 text-teal-700',
  WO: 'bg-gray-50 text-gray-400', HO: 'bg-rose-50 text-rose-600', WP: 'bg-indigo-50 text-indigo-700', OD: 'bg-blue-50 text-blue-700',
  MP: 'bg-orange-50 text-orange-700', IN: 'bg-emerald-50 text-emerald-700', U: 'bg-purple-50 text-purple-700', '·': 'text-gray-300', '–': 'text-gray-300',
};

// Register code for a day (PL / EL / A / UL from leave cover) — same as the Excel export
export { dayCode };
export const codeCell = (code) => CODE_CELL[String(code).replace('+', '')] || '';

export const LEAVE_TYPES = { paid: 'Paid leave', extra: 'Extra leave', unpaid: 'Without pay' };

const half = (n) => (n === 0.5 ? '½' : String(n).replace('.5', '½'));
/** How leave covered an absent / half / leave day: "Paid leave", "½ paid leave · ½ unpaid"… */
export function coverText(day, t) {
  const cover = day?.cover;
  if (!cover) return '';
  if (day.status === 'leave' && day.leaveType === 'unpaid') return t('Unpaid leave');
  const parts = [
    cover.paid && [cover.paid, 'paid leave', 'Paid leave'],
    cover.extra && [cover.extra, 'extra leave', 'Extra leave'],
    cover.unpaid && [cover.unpaid, 'unpaid', 'Unpaid — no leave left'],
  ].filter(Boolean);
  return parts.map(([n, part, whole]) => (n === 1 && parts.length === 1 ? t(whole) : `${half(n)} ${t(part)}`)).join(' · ');
}

export const ISSUES = {
  missing_punch:     'In or out punch is missing',
  short_hours:       'Worked fewer hours than the shift',
  double_incomplete: 'Double shift planned, only one worked',
};

const VERIFY = { finger: 'Fingerprint', face: 'Face', card: 'Card', password: 'Password', palm: 'Palm' };

// Statuses a supervisor can set by hand (same list as the server).
export const OVERRIDE_STATUSES = ['present', 'half_day', 'absent', 'leave', 'off', 'on_duty'];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Date / time helpers (YYYY-MM-DD strings, device = India time) ────────────

export const parseDay = (s) => new Date(`${s}T12:00:00`);
export const addDaysStr = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return localDateStr(d); };
export const weekdayOf = (s) => parseDay(s).getDay();
/** Monday of the week containing `s`. */
export const weekStartOf = (s) => addDaysStr(s, -((weekdayOf(s) + 6) % 7));
export const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: localDateStr(new Date(y, m, 0)) };
};
export const thisMonth = () => localDateStr().slice(0, 7);
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
export const fMinutes = (min) => {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
};
/** 2.5 → "2½" */
export const fDays = (n) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);

// ── Small pieces ─────────────────────────────────────────────────────────────

export function StatusBadge({ status, className = '' }) {
  const t = useT();
  const s = STATUS[status] || STATUS.none;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cls} ${className}`}>{t(s.label)}</span>;
}

export function ShiftChip({ shift, small = false }) {
  if (!shift) return null;
  const Icon = shift.kind === 'night' ? Moon : Sun;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded font-semibold text-white ${small ? 'px-1 text-[10px] leading-4' : 'px-1.5 py-0.5 text-xs'}`}
      style={{ backgroundColor: shift.color || '#f97316' }}
      title={`${shift.name} ${shift.start}–${shift.end}`}
    >
      {!small && <Icon className="h-3 w-3" />}
      {shift.short || shift.name.slice(0, 1)}
    </span>
  );
}

export const shiftLabel = (s) => (s ? `${s.name} (${s.start}–${s.end})` : '');

// ── Double shift reward (management) ────────────────────────────────────────

/** What management decided for a double shift, with buttons to decide or change it. */
export function DoubleDecision({ staffId, date, decision, eligible = true, canApprove }) {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [overtime, setOvertime] = useState(null); // { amount, note } while entering an amount

  const after = () => {
    setEditing(false);
    setOvertime(null);
    qc.invalidateQueries({ queryKey: ['attendance'] });
  };
  const fail = (err) => toast.error(err.response?.data?.message || t('Failed'));
  const save = useMutation({
    mutationFn: (body) => setDoubleDecision({ staff: staffId, date, ...body }),
    onSuccess: () => { toast.success(t('Saved')); after(); },
    onError: fail,
  });
  const clear = useMutation({ mutationFn: () => clearDoubleDecision(staffId, date), onSuccess: after, onError: fail });

  const current = decision && (
    decision.decision === 'extra_leave' ? <span className="flex items-center gap-1.5 text-cyan-700"><Gift className="h-4 w-4" />{t('1 extra leave, use by {date}', { date: fDate(decision.expiresOn, 'dd MMM') })}</span>
      : decision.decision === 'overtime' ? <span className="flex items-center gap-1.5 text-green-700"><IndianRupee className="h-4 w-4" />{t('Overtime {amount}', { amount: fCurrency(decision.amount) })}</span>
        : <span className="flex items-center gap-1.5 text-gray-500"><Ban className="h-4 w-4" />{t('No reward')}</span>
  );

  if (decision && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {current}
        {decision.by && <span className="text-xs text-gray-400">— {decision.by}</span>}
        {canApprove && <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-primary-600">{t('Change')}</button>}
      </div>
    );
  }
  if (!canApprove) return <p className="text-sm text-amber-700">{t('Waiting for management to decide the reward')}</p>;

  if (overtime) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ decision: 'overtime', amount: Number(overtime.amount), note: overtime.note }); }} className="flex flex-wrap items-center gap-2">
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
          <input autoFocus type="number" min={1} inputMode="numeric" required value={overtime.amount} onChange={(e) => setOvertime({ ...overtime, amount: e.target.value })} className="input pl-7" aria-label={t('Overtime amount')} />
        </div>
        <input value={overtime.note} onChange={(e) => setOvertime({ ...overtime, note: e.target.value })} placeholder={t('Note (optional)')} className="input min-w-32 flex-1" />
        <button type="button" onClick={() => setOvertime(null)} className="btn-secondary">{t('Cancel')}</button>
        <button disabled={save.isPending} className="btn-primary">{t('Save')}</button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      {!eligible && <p className="text-xs text-gray-500">{t('Not marked as eligible for double shifts.')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={save.isPending} onClick={() => save.mutate({ decision: 'extra_leave' })} className="btn-secondary flex items-center gap-1.5 border-cyan-200 text-cyan-800">
          <Gift className="h-4 w-4" />{t('Extra leave')}
        </button>
        <button type="button" onClick={() => setOvertime({ amount: decision?.amount || '', note: '' })} className="btn-secondary flex items-center gap-1.5 border-green-200 text-green-800">
          <IndianRupee className="h-4 w-4" />{t('Overtime')}
        </button>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate({ decision: 'none' })} className="btn-secondary flex items-center gap-1.5 text-gray-600">
          <Ban className="h-4 w-4" />{t('No reward')}
        </button>
        {decision && <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-gray-500">{t('Cancel')}</button>}
        {decision && <button type="button" onClick={() => clear.mutate()} className="btn-ghost text-red-600">{t('Undecide')}</button>}
      </div>
    </div>
  );
}

// ── Day detail: punches, missed punch, ignore, correction, leave ────────────

const nowHHMM = () => new Date().toTimeString().slice(0, 5);

export function DayDetailSheet({ staffId, date, onClose, canWrite, shifts = [] }) {
  const t = useT();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const open = Boolean(staffId && date);
  const [mode, setMode] = useState(null); // 'punch' | 'fix' | { ignore: punch }
  const [form, setForm] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'day', staffId, date],
    queryFn: () => getStaffDay(staffId, date),
    enabled: open,
  });
  const detail = data?.data?.data;
  const day = detail?.day;
  const override = detail?.override;
  const balance = detail?.balance;
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  const isFuture = date > localDateStr();

  const done = (msg) => {
    toast.success(t(msg));
    setMode(null);
    setForm({});
    qc.invalidateQueries({ queryKey: ['attendance'] });
  };
  const fail = (err) => toast.error(err.response?.data?.message || t('Failed'));

  const punchMut = useMutation({
    mutationFn: () => {
      const [h, m] = form.time.split(':').map(Number);
      const when = parseDay(form.date || date);
      when.setHours(h, m, 0, 0);
      return addManualPunch({ staff: staffId, time: when.toISOString(), reason: form.reason });
    },
    onSuccess: () => done('Punch added'),
    onError: fail,
  });
  const ignoreMut = useMutation({
    mutationFn: ({ punch, ignored }) => ignorePunch(punch._id, { ignored, reason: form.reason }),
    onSuccess: (res) => done(res.data?.message || 'Saved'),
    onError: fail,
  });
  const fixMut = useMutation({
    mutationFn: () => setOverride({
      staff: staffId, date, status: form.status || undefined, leaveType: form.status === 'leave' ? form.leaveType : undefined,
      waiveLate: Boolean(form.waiveLate), note: form.note,
    }),
    onSuccess: () => done('Saved'),
    onError: fail,
  });
  const unfixMut = useMutation({
    mutationFn: () => removeOverride(staffId, date),
    onSuccess: () => done('Correction removed'),
    onError: fail,
  });

  const startPunch = () => { setForm({ time: date === localDateStr() ? nowHHMM() : '', date, reason: '' }); setMode('punch'); };
  const startFix = () => {
    setForm({ status: override?.status || '', leaveType: override?.leaveType || 'paid', waiveLate: override?.waiveLate || false, note: override?.note || '' });
    setMode('fix');
  };

  return (
    <Sheet open={open} onClose={onClose} title={detail ? `${detail.staff.name} · ${fDate(date, 'EEE, dd MMM')}` : t('Attendance')} size="md">
      {isLoading || !day ? <PageLoader /> : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={day.status} className="text-sm" />
            {day.status === 'leave' && <span className="text-sm text-teal-700">{t(LEAVE_TYPES[day.leaveType] || 'Paid leave')}</span>}
            {day.double && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{t('Double shift')}</span>}
            {day.overridden && <span className="text-xs text-gray-500">{t('Corrected (machine said: {s})', { s: t(STATUS[day.computedStatus]?.label || day.computedStatus) })}</span>}
          </div>
          {day.holiday && <p className="flex items-center gap-1.5 text-sm text-rose-700"><PartyPopper className="h-4 w-4" />{day.holiday}</p>}
          <div className="flex flex-wrap gap-1.5">
            {day.off && !day.shifts.length && !day.holiday && <span className="text-sm text-gray-500">{t('Weekly Off')}</span>}
            {day.shifts.map((id) => {
              const s = shiftById.get(String(id));
              return s ? <span key={id} className="inline-flex items-center gap-1.5 text-sm text-gray-600"><ShiftChip shift={s} />{s.start}–{s.end}</span> : null;
            })}
          </div>
          {!isFuture && (
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
              <div><dt className="text-[11px] uppercase text-gray-400">{t('In')}</dt><dd className="font-semibold text-gray-800">{fTime(day.firstIn)}</dd></div>
              <div><dt className="text-[11px] uppercase text-gray-400">{t('Out')}</dt><dd className="font-semibold text-gray-800">{fTime(day.lastOut)}</dd></div>
              <div>
                <dt className="text-[11px] uppercase text-gray-400">{t('Worked')}</dt>
                <dd className="font-semibold text-gray-800">
                  {/* Still on duty: count the time since the last in-punch too */}
                  {day.status === 'working' && day.punches.length
                    ? `${fMinutes(day.workedMinutes + Math.max(0, Math.round((Date.now() - new Date(day.punches[day.punches.length - 1])) / 60000)))}…`
                    : fMinutes(day.workedMinutes)}
                </dd>
              </div>
            </dl>
          )}
          {(day.cover || day.lateMinutes > 0 || day.lateWaived || day.extraMinutes > 0 || day.issues.length > 0) && (
            <ul className="space-y-1 text-sm">
              {day.cover && <li className={day.cover.unpaid ? 'text-red-700' : 'text-teal-700'}>{coverText(day, t)}</li>}
              {day.lateMinutes > 0 && (
                <li className="text-orange-700">
                  {t('Late by {m} min', { m: day.lateMinutes })}
                  {day.lateNo && <> · {t('late mark {n} this month', { n: day.lateNo })}</>}
                  {day.lateCut && <b className="text-red-700"> · {t('half day cut')}</b>}
                </li>
              )}
              {day.lateWaived && <li className="text-gray-500">{t('Late mark waived')}</li>}
              {day.extraMinutes > 0 && <li className="text-green-700">{t('Extra time {h}', { h: fMinutes(day.extraMinutes) })}</li>}
              {day.issues.map((i) => (
                <li key={i} className="flex items-center gap-1.5 text-orange-700"><AlertTriangle className="h-3.5 w-3.5" />{t(ISSUES[i] || i)}</li>
              ))}
            </ul>
          )}
          {override?.note && (
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {override.note} <span className="text-xs text-blue-500">— {override.by?.name}</span>
            </p>
          )}

          {day.double && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">{t('Reward for the double shift')}</p>
              <DoubleDecision staffId={staffId} date={date} decision={day.decision} eligible={detail.staff.doubleShiftEligible} canApprove={can('attendance:approve')} />
            </div>
          )}

          {balance && (
            <p className="text-xs text-gray-500">
              {t('This month: paid leave {used} of {total} used · extra leave available {extra}', {
                used: fDays(balance.paidUsed), total: balance.paidEntitled, extra: fDays(balance.extraAvailable),
              })}
            </p>
          )}

          {/* Punches */}
          {!isFuture && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Punches')}</h3>
              {detail.punches.length === 0 ? (
                <p className="text-sm text-gray-400">{t('No punches')}</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {detail.punches.map((p) => (
                    <li key={p._id} className="flex items-center gap-3 px-3 py-2">
                      {p.source === 'manual' ? <PenLine className="h-4 w-4 shrink-0 text-blue-500" /> : <Fingerprint className="h-4 w-4 shrink-0 text-gray-400" />}
                      <div className={`min-w-0 flex-1 ${p.ignored ? 'text-gray-400 line-through' : ''}`}>
                        <p className="text-sm font-medium">{fDate(p.time, 'dd MMM')} · {fTime(p.time)}</p>
                        <p className="truncate text-xs text-gray-500">
                          {p.source === 'manual' ? `${t('Added by {name}', { name: p.by?.name || '—' })} — ${p.reason}` : (p.ignored ? p.reason : t(VERIFY[p.verify] || 'Machine'))}
                        </p>
                      </div>
                      {canWrite && (p.ignored ? (
                        <button onClick={() => ignoreMut.mutate({ punch: p, ignored: false })} className="btn-ghost p-2 text-gray-500" aria-label={t('Restore')}><Undo2 className="h-4 w-4" /></button>
                      ) : (
                        <button onClick={() => { setForm({ reason: '' }); setMode({ ignore: p }); }} className="btn-ghost p-2 text-gray-500" aria-label={t(p.source === 'manual' ? 'Remove' : 'Ignore')}>
                          <EyeOff className="h-4 w-4" />
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Actions */}
          {canWrite && !mode && (
            <div className={`grid gap-2 ${isFuture ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!isFuture && <button onClick={startPunch} className="btn-secondary flex items-center justify-center gap-1.5"><Plus className="h-4 w-4" />{t('Missed punch')}</button>}
              <button onClick={startFix} className="btn-secondary flex items-center justify-center gap-1.5"><PenLine className="h-4 w-4" />{t(isFuture ? 'Mark leave / change day' : 'Correct day')}</button>
            </div>
          )}

          {mode === 'punch' && (
            <form onSubmit={(e) => { e.preventDefault(); punchMut.mutate(); }} className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700">{t('Add a missed punch')}</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="input" value={form.date} max={localDateStr()} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
              </div>
              <input className="input" placeholder={t('Reason (required)')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
              <p className="text-xs text-gray-400">{t('For a night shift, pick the next date for the morning out-punch.')}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode(null)} className="btn-secondary">{t('Cancel')}</button>
                <button disabled={punchMut.isPending} className="btn-primary">{t('Add')}</button>
              </div>
            </form>
          )}

          {mode?.ignore && (
            <form onSubmit={(e) => { e.preventDefault(); ignoreMut.mutate({ punch: mode.ignore, ignored: true }); }} className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700">
                {t(mode.ignore.source === 'manual' ? 'Remove the punch at {time}?' : 'Ignore the punch at {time}?', { time: fTime(mode.ignore.time) })}
              </p>
              {mode.ignore.source !== 'manual' && (
                <input className="input" placeholder={t('Reason (required)')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode(null)} className="btn-secondary">{t('Cancel')}</button>
                <button disabled={ignoreMut.isPending} className="btn-danger">{t(mode.ignore.source === 'manual' ? 'Remove' : 'Ignore')}</button>
              </div>
            </form>
          )}

          {mode === 'fix' && (
            <form onSubmit={(e) => { e.preventDefault(); fixMut.mutate(); }} className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700">{t('Correct this day')}</p>
              <div className="flex flex-wrap gap-1.5">
                {['', ...OVERRIDE_STATUSES].map((s) => (
                  <button
                    type="button" key={s || 'auto'}
                    onClick={() => setForm({ ...form, status: s })}
                    className={`rounded-full border px-3 py-1.5 text-sm ${form.status === s ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                  >
                    {s ? t(STATUS[s].label) : t('As per machine')}
                  </button>
                ))}
              </div>
              {form.status === 'leave' && (
                <div className="flex flex-wrap gap-1.5 rounded-lg bg-teal-50 p-2">
                  {Object.entries(LEAVE_TYPES).map(([k, label]) => (
                    <button type="button" key={k} onClick={() => setForm({ ...form, leaveType: k })}
                      className={`rounded-full border px-3 py-1 text-sm ${form.leaveType === k ? 'border-teal-600 bg-teal-600 text-white' : 'border-teal-200 bg-white text-teal-800'}`}>
                      {t(label)}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.waiveLate} onChange={(e) => setForm({ ...form, waiveLate: e.target.checked })} className="h-4 w-4 rounded" />
                {t('Waive late mark')}
              </label>
              <input className="input" placeholder={t('Note (required) — e.g. on temple work outside')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} required />
              <div className="flex flex-wrap justify-end gap-2">
                {override && <button type="button" onClick={() => unfixMut.mutate()} className="btn-ghost mr-auto text-red-600">{t('Remove correction')}</button>}
                <button type="button" onClick={() => setMode(null)} className="btn-secondary">{t('Cancel')}</button>
                <button disabled={fixMut.isPending || (!form.status && !form.waiveLate)} className="btn-primary">{t('Save')}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}
