import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Moon, Sun, Fingerprint, CheckCircle2, Clock, Save, PartyPopper } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { getAttendanceSettings, updateAttendanceSettings } from '../../api/attendance.api.js';
import { publicUrl } from '../../utils/platform.js';
import { fDate, fDateTime, localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';
import { fMinutes } from './attendanceUi.jsx';

// Shift timings, attendance rules and the biometric machine(s).
// Used by Attendance → Shifts & Machine and Settings → Attendance.

const RULES = [
  { key: 'graceMinutes',       label: 'Late after (minutes)',        hint: 'Punching in within this many minutes of the shift start is not late.', step: 1 },
  { key: 'halfDayBelowHours',  label: 'Half day below (hours)',      hint: 'Worked less than this → half day.', step: 0.5 },
  { key: 'absentBelowHours',   label: 'Absent below (hours)',        hint: 'Worked less than this → absent.', step: 0.5 },
  { key: 'punchMergeMinutes',  label: 'Repeat punches within (minutes)', hint: 'Several taps on the machine within this time count once.', step: 1 },
  { key: 'defaultPaidLeavePerMonth', label: 'Paid leaves per month',  hint: 'Default for everyone; can be changed per person.', step: 1 },
  { key: 'extraLeaveValidDays', label: 'Extra leave valid for (days)', hint: 'Extra leave earned by a double shift lapses after this.', step: 1 },
];

const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
const shiftLength = (s) => { let d = toMin(s.end) - toMin(s.start); if (d <= 0) d += 1440; return d; };
const NEW_SHIFT = { name: '', start: '09:00', end: '18:00', kind: 'day', short: '', color: '#10b981' };

export default function AttendanceSettingsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'settings'],
    queryFn: getAttendanceSettings,
    refetchInterval: 30 * 1000, // a newly connected machine shows up without reloading
  });
  const server = data?.data?.data;

  const [shifts, setShifts] = useState(null);
  const [rules, setRules] = useState(null);
  const [deviceEdits, setDeviceEdits] = useState({}); // serial → { name?, approved?, removed? }
  const [holidays, setHolidays] = useState(null);

  // Local copy for editing, taken once — background refetches only refresh the machine list.
  useEffect(() => {
    if (server && !shifts) {
      setShifts(server.shifts.map((s) => ({ ...s })));
      setHolidays((server.holidays || []).map((h) => ({ ...h })));
      setRules({
        ...Object.fromEntries(RULES.map((r) => [r.key, server[r.key]])),
        lateEnabled: server.latePenalty?.enabled, freeLates: server.latePenalty?.freeLates,
      });
    }
  }, [server, shifts]);

  const devices = (server?.devices || [])
    .map((d) => ({ ...d, ...deviceEdits[d.serial] }))
    .filter((d) => !d.removed);

  const mut = useMutation({
    mutationFn: () => updateAttendanceSettings({
      shifts: shifts.map(({ _id, name, start, end, kind, short, color }) => ({ _id, name: name.trim(), start, end, kind, short: short.trim(), color })),
      ...Object.fromEntries(RULES.map((r) => [r.key, Number(rules[r.key])])),
      latePenalty: { enabled: Boolean(rules.lateEnabled), freeLates: Number(rules.freeLates) },
      devices: devices.map(({ serial, name, approved }) => ({ serial, name, approved })),
      holidays: holidays.filter((h) => h.date),
    }),
    onSuccess: (res) => {
      toast.success(t('Attendance settings saved'));
      const saved = res.data.data;
      setShifts(saved.shifts.map((s) => ({ ...s })));
      setHolidays(saved.holidays.map((h) => ({ ...h })));
      setDeviceEdits({});
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  if (isLoading || !shifts || !rules || !holidays) return <PageLoader />;

  const setShift = (i, patch) => setShifts((cur) => cur.map((s, j) => {
    if (j !== i) return s;
    const next = { ...s, ...patch };
    // Ending at or before the start means the shift runs past midnight — always a night shift
    if (toMin(next.end) <= toMin(next.start)) next.kind = 'night';
    return next;
  }));
  const editDevice = (serial, patch) => setDeviceEdits((cur) => ({ ...cur, [serial]: { ...cur[serial], ...patch } }));
  const host = new URL(publicUrl('/')).hostname;
  const invalid = shifts.some((s) => !s.name.trim() || !s.start || !s.end);

  return (
    <div className="max-w-3xl space-y-5">
      {/* ── Shifts ── */}
      <section className="card space-y-3 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{t('Shift timings')}</h2>
          <p className="text-sm text-gray-500">{t('A shift that ends before it starts runs past midnight and counts on the day it started.')}</p>
        </div>
        {shifts.map((s, i) => (
          <div key={s._id || `new${i}`} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <input type="color" value={s.color} onChange={(e) => setShift(i, { color: e.target.value })} className="h-9 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={t('Colour')} />
              <input value={s.name} onChange={(e) => setShift(i, { name: e.target.value })} placeholder={t('Shift name')} className="input flex-1 font-medium" />
              <input value={s.short} maxLength={3} onChange={(e) => setShift(i, { short: e.target.value.toUpperCase() })} placeholder="D" className="input w-14 text-center font-semibold" aria-label={t('Short label')} />
              <button type="button" onClick={() => setShifts(shifts.filter((_, j) => j !== i))} disabled={shifts.length === 1} className="btn-ghost p-2 text-gray-400 hover:text-red-600 disabled:opacity-30" aria-label={t('Remove')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <input type="time" value={s.start} onChange={(e) => setShift(i, { start: e.target.value })} className="input w-32" aria-label={t('Start')} />
              <span className="text-gray-400">→</span>
              <input type="time" value={s.end} onChange={(e) => setShift(i, { end: e.target.value })} className="input w-32" aria-label={t('End')} />
              <button
                type="button" disabled={toMin(s.end) <= toMin(s.start)} title={t('Day or night shift')}
                onClick={() => setShift(i, { kind: s.kind === 'night' ? 'day' : 'night' })}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.kind === 'night' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {s.kind === 'night' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                {s.kind === 'night' ? t('Night') : t('Day')} · {fMinutes(shiftLength(s))}
              </button>
              {toMin(s.end) <= toMin(s.start) && <span className="text-xs text-indigo-600">{t('ends next morning')}</span>}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setShifts([...shifts, { ...NEW_SHIFT }])} className="btn-secondary flex items-center gap-1.5">
          <Plus className="h-4 w-4" />{t('Add shift')}
        </button>
      </section>

      {/* ── Rules ── */}
      <section className="card space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800">{t('Rules')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {RULES.map((r) => (
            <label key={r.key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t(r.label)}</span>
              <input type="number" min={0} step={r.step} value={rules[r.key] ?? ''} onChange={(e) => setRules({ ...rules, [r.key]: e.target.value })} className="input w-32" inputMode="decimal" />
              <span className="mt-1 block text-xs text-gray-400">{t(r.hint)}</span>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-gray-700">{t('Late penalty')}</span>
              <span className="block text-xs text-gray-400">{t('After the free late marks in a month, each late mark cuts half a day. A supervisor can waive any late mark.')}</span>
            </span>
            <input type="checkbox" checked={Boolean(rules.lateEnabled)} onChange={(e) => setRules({ ...rules, lateEnabled: e.target.checked })} className="h-5 w-5 rounded" />
          </label>
          {rules.lateEnabled && (
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              {t('Free late marks per month')}
              <input type="number" min={0} max={31} value={rules.freeLates ?? 3} onChange={(e) => setRules({ ...rules, freeLates: e.target.value })} className="input w-20" />
            </label>
          )}
        </div>
      </section>

      {/* ── Holidays ── */}
      <section className="card space-y-3 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{t('Holidays')}</h2>
          <p className="text-sm text-gray-500">{t('Paid days off for everyone. Anyone rostered on a holiday works as usual. Leave empty if staff use their leaves instead.')}</p>
        </div>
        {holidays.length === 0 && <p className="text-sm text-gray-400">{t('No holidays added.')}</p>}
        {holidays.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 shrink-0 text-rose-500" />
            <input type="date" value={h.date} onChange={(e) => setHolidays(holidays.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className="input w-[8.5rem] shrink-0 px-2 sm:w-40 sm:px-3" aria-label={t('Date')} />
            <input value={h.name} onChange={(e) => setHolidays(holidays.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t('e.g. Dasara')} className="input min-w-0 flex-1" />
            {h.date && <span className="hidden text-xs text-gray-400 sm:inline">{fDate(h.date, 'EEE')}</span>}
            <button type="button" onClick={() => setHolidays(holidays.filter((_, j) => j !== i))} className="btn-ghost p-2 text-gray-400 hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setHolidays([...holidays, { date: localDateStr(), name: '' }])} className="btn-secondary flex items-center gap-1.5">
          <Plus className="h-4 w-4" />{t('Add holiday')}
        </button>
      </section>

      {/* ── Machines ── */}
      <section className="card space-y-3 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{t('Biometric machine')}</h2>
          <p className="text-sm text-gray-500">{t('The machine sends every punch to this app over the internet. On the machine open Menu → Comm. → Cloud Server Setting and enter:')}</p>
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-sm">
          <dt className="text-gray-500">{t('Server address')}</dt><dd className="break-all font-mono font-semibold text-gray-800">{host}</dd>
          <dt className="text-gray-500">{t('Port')}</dt><dd className="font-mono font-semibold text-gray-800">80</dd>
          <dt className="text-gray-500">{t('Domain name / DNS')}</dt><dd className="text-gray-800">{t('On')}</dd>
        </dl>
        <p className="text-xs text-gray-400">{t('Set the machine clock to India time. A new machine appears below within a minute — approve it, then enrol staff on the machine using their machine numbers.')}</p>

        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
            <Fingerprint className="mx-auto mb-1 h-6 w-6" />{t('No machine has connected yet.')}
          </div>
        ) : devices.map((d) => {
          const fresh = d.lastSeenAt && Date.now() - new Date(d.lastSeenAt) < 5 * 60 * 1000;
          return (
            <div key={d.serial} className={`rounded-xl border p-3 ${d.approved ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex items-center gap-2">
                <input value={d.name || ''} onChange={(e) => editDevice(d.serial, { name: e.target.value })} placeholder={t('Name, e.g. Main gate')} className="input flex-1" />
                <button type="button" onClick={() => editDevice(d.serial, { removed: true })} className="btn-ghost p-2 text-gray-400 hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="font-mono">{d.serial}</span>
                <span className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${fresh ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {d.lastSeenAt ? t('Last contact {time}', { time: fDateTime(d.lastSeenAt) }) : t('Never')}
                </span>
                {d.lastIp && <span>{d.lastIp}</span>}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={Boolean(d.approved)} onChange={(e) => editDevice(d.serial, { approved: e.target.checked })} className="h-4 w-4 rounded" />
                {d.approved
                  ? <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />{t('Approved — punches are accepted')}</span>
                  : <span className="flex items-center gap-1 text-amber-700"><Clock className="h-4 w-4" />{t('Waiting for approval — tick to accept punches')}</span>}
              </label>
            </div>
          );
        })}
      </section>

      <StickyActionBar>
        <button type="button" onClick={() => mut.mutate()} disabled={mut.isPending || invalid} className="btn-primary flex items-center justify-center gap-2">
          <Save className="h-4 w-4" />{mut.isPending ? t('Saving...') : t('Save')}
        </button>
      </StickyActionBar>
    </div>
  );
}
