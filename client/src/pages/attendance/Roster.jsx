import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Copy, Moon, Sun, RotateCcw, CalendarOff } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { copyRosterWeek, getRoster, saveRoster } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { fDate, localDateStr } from '../../utils/formatters.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';
import { ShiftChip, addDaysStr, weekStartOf } from './attendanceUi.jsx';

// Who works which shift each day of the week. Days nobody planned follow the person's
// default (their usual shift, weekly off on their off day) and are shown faded.

function Cell({ cell, shiftById, onClick, disabled }) {
  const t = useT();
  if (!cell) return <span className="text-gray-300">—</span>;
  if (cell.employed === false) return <span className="text-[11px] text-gray-300" title={t('Not Employed')}>–</span>;
  const content = cell.off && cell.holiday && !cell.planned ? (
    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600" title={cell.holiday}>{t('Holiday')}</span>
  ) : cell.off ? (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">{t('Off')}</span>
  ) : cell.shifts.length === 0 ? (
    <span className="text-gray-300">—</span>
  ) : (
    <span className="flex flex-wrap justify-center gap-0.5">{cell.shifts.map((id) => <ShiftChip key={id} shift={shiftById.get(String(id))} small />)}</span>
  );
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`flex min-h-9 w-full items-center justify-center rounded-md px-1 py-1 ${cell.planned ? '' : 'opacity-50'} ${disabled ? 'cursor-default' : 'hover:bg-orange-50 active:bg-orange-100'}`}
    >
      {content}
    </button>
  );
}

function CellEditor({ target, roster, shiftById, onClose }) {
  const t = useT();
  const qc = useQueryClient();
  const { staff, date } = target;
  const cell = roster.cells[staff._id]?.[date];
  const [shifts, setShifts] = useState(cell?.off ? [] : (cell?.shifts || []).map(String));
  const [off, setOff] = useState(Boolean(cell?.off));
  const [wholeWeek, setWholeWeek] = useState(false);

  const holidays = new Map((roster.holidays || []).map((h) => [h.date, h.name]));
  // "Whole week" leaves the week's holidays as holidays (only this day is set if it is one)
  const days = wholeWeek ? roster.dates.filter((d) => d === date || !holidays.has(d)) : [date];
  const mut = useMutation({
    mutationFn: (reset) => saveRoster(days.map((d) => (reset
      ? { staff: staff._id, date: d, reset: true }
      : { staff: staff._id, date: d, shifts: off ? [] : shifts, off }))),
    onSuccess: () => {
      haptics.success();
      qc.invalidateQueries({ queryKey: ['attendance'] });
      onClose();
    },
    onError: (err) => toast.error(t(err.response?.data?.message || 'Failed')),
  });

  const toggle = (id) => {
    setOff(false);
    setShifts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));
  };

  return (
    <Sheet
      open onClose={onClose} size="sm"
      title={`${staff.name} · ${fDate(date, 'EEE dd MMM')}`}
      footer={(
        <div className="flex gap-2">
          <button onClick={() => mut.mutate(true)} disabled={mut.isPending} className="btn-ghost flex items-center gap-1.5 text-gray-600">
            <RotateCcw className="h-4 w-4" />{t('Use default')}
          </button>
          <button onClick={() => mut.mutate(false)} disabled={mut.isPending || (!off && !shifts.length)} className="btn-primary ml-auto">{t('Save')}</button>
        </div>
      )}
    >
      <div className="space-y-2">
        {holidays.has(date) && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {t('Holiday: {name}', { name: holidays.get(date) })} — {t('choosing a shift here means this person works on the holiday.')}
          </p>
        )}
        {roster.shifts.map((s) => {
          const on = shifts.includes(String(s._id));
          const Icon = s.kind === 'night' ? Moon : Sun;
          return (
            <button
              key={s._id} type="button" onClick={() => toggle(String(s._id))}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${on ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white'}`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: s.color }}><Icon className="h-4 w-4" /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-800">{s.name}</span>
                <span className="block text-xs text-gray-500">{s.start} – {s.end}</span>
              </span>
              <input type="checkbox" readOnly checked={on} className="h-4 w-4 rounded" tabIndex={-1} />
            </button>
          );
        })}
        <button
          type="button" onClick={() => { setOff(true); setShifts([]); }}
          className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${off ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white'}`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-gray-600"><CalendarOff className="h-4 w-4" /></span>
          <span className="flex-1 text-sm font-semibold text-gray-800">{t('Weekly Off')}</span>
        </button>
        {shifts.length === 2 && (
          <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
            {staff.doubleShiftEligible ? t('Double shift — both shifts on the same day.') : t('Double shift — note: this person is not marked as eligible for double shifts.')}
          </p>
        )}
        <label className="flex items-center gap-2 pt-2 text-sm text-gray-700">
          <input type="checkbox" checked={wholeWeek} onChange={(e) => setWholeWeek(e.target.checked)} className="h-4 w-4 rounded" />
          {t('Apply to the whole week')}
        </label>
        {wholeWeek && roster.dates.some((d) => d !== date && holidays.has(d)) && (
          <p className="text-xs text-gray-500">{t('Holidays in the week stay holidays.')}</p>
        )}
      </div>
    </Sheet>
  );
}

export default function Roster() {
  const t = useT();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const canWrite = can('attendance:write');
  const [weekStart, setWeekStart] = useState(weekStartOf(localDateStr()));
  const [mobileDay, setMobileDay] = useState(localDateStr());
  const [editing, setEditing] = useState(null);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const weekEnd = addDaysStr(weekStart, 6);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'roster', weekStart],
    queryFn: () => getRoster({ from: weekStart, to: weekEnd }),
  });
  const roster = data?.data?.data;
  const shiftById = useMemo(() => new Map((roster?.shifts || []).map((s) => [String(s._id), s])), [roster]);

  const copyMut = useMutation({
    mutationFn: () => copyRosterWeek({ fromWeekStart: addDaysStr(weekStart, -7), toWeekStart: weekStart }),
    onSuccess: () => {
      toast.success(t('Last week copied'));
      setConfirmCopy(false);
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  const goWeek = (n) => {
    const next = addDaysStr(weekStart, n * 7);
    setWeekStart(next);
    setMobileDay(next <= localDateStr() && localDateStr() <= addDaysStr(next, 6) ? localDateStr() : next);
  };

  // Head-count per shift per day — handy when planning festival days
  const countFor = (date) => {
    const out = new Map();
    for (const s of roster?.staff || []) {
      const c = roster.cells[s._id]?.[date];
      if (c && !c.off) c.shifts.forEach((id) => out.set(String(id), (out.get(String(id)) || 0) + 1));
    }
    return out;
  };

  const edit = (staff, date) => canWrite && setEditing({ staff, date });
  const isThisWeek = weekStart === weekStartOf(localDateStr());
  const holidayOn = new Map((roster?.holidays || []).map((h) => [h.date, h.name]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Weekly Roster"
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Weekly Roster' }]}
        actions={canWrite && (
          <button onClick={() => setConfirmCopy(true)} className="btn-secondary flex items-center gap-1.5">
            <Copy className="h-4 w-4" />{t('Copy last week')}
          </button>
        )}
      />

      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => goWeek(-1)} className="btn-ghost p-2" aria-label={t('Previous week')}><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex-1 text-center">
          <p className="text-base font-semibold text-gray-900">{fDate(weekStart, 'dd MMM')} – {fDate(weekEnd, 'dd MMM yyyy')}</p>
          {!isThisWeek && <button onClick={() => { setWeekStart(weekStartOf(localDateStr())); setMobileDay(localDateStr()); }} className="text-xs font-medium text-primary-600">{t('Go to this week')}</button>}
          {isThisWeek && <p className="text-xs text-gray-500">{t('This week')}</p>}
        </div>
        <button onClick={() => goWeek(1)} className="btn-ghost p-2" aria-label={t('Next week')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      {isLoading || !roster ? <PageLoader /> : roster.staff.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500">{t('No staff added yet.')}</div>
      ) : isMobile ? (
        <>
          {/* Phones: pick a day, see everyone's shift that day */}
          <div className="grid grid-cols-7 gap-1">
            {roster.dates.map((d) => {
              const active = d === mobileDay;
              return (
                <button
                  key={d} onClick={() => { haptics.select(); setMobileDay(d); }}
                  className={`flex flex-col items-center rounded-xl py-1.5 ${active ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
                >
                  <span className="text-[10px] uppercase">{t(fDate(d, 'EEE'))}</span>
                  <span className="text-base font-semibold">{fDate(d, 'd')}</span>
                  {d === localDateStr() && <span className={`h-1 w-1 rounded-full ${active ? 'bg-white' : 'bg-primary-600'}`} />}
                  {holidayOn.has(d) && <span className={`h-1 w-1 rounded-full ${active ? 'bg-rose-200' : 'bg-rose-500'}`} />}
                </button>
              );
            })}
          </div>
          {holidayOn.has(mobileDay) && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{t('Holiday: {name}', { name: holidayOn.get(mobileDay) })}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
            {[...countFor(mobileDay)].map(([id, n]) => (
              <span key={id} className="flex items-center gap-1"><ShiftChip shift={shiftById.get(id)} small />× {n}</span>
            ))}
          </div>
          <ul className="card divide-y divide-gray-100 overflow-hidden">
            {roster.staff.map((s) => (
              <li key={s._id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-gray-900">{s.name}</p>
                  <p className="truncate text-xs text-gray-500">{s.designation || s.staffCode}</p>
                </div>
                <div className="w-24 shrink-0">
                  <Cell cell={roster.cells[s._id]?.[mobileDay]} shiftById={shiftById} onClick={() => edit(s, mobileDay)} disabled={!canWrite} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="table-th sticky left-0 z-10 bg-gray-50 text-left">{t('Staff')}</th>
                {roster.dates.map((d) => (
                  <th key={d} className={`table-th w-24 text-center ${d === localDateStr() ? 'bg-orange-50 text-orange-700' : ''}`}>
                    <span className="block">{t(fDate(d, 'EEE'))}</span>
                    <span className="block text-sm font-semibold normal-case">{fDate(d, 'dd')}</span>
                    {holidayOn.has(d) && <span className="block truncate text-[10px] font-medium normal-case text-rose-600" title={holidayOn.get(d)}>{holidayOn.get(d)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.staff.map((s) => (
                <tr key={s._id} className="hover:bg-gray-50/60">
                  <td className="sticky left-0 z-10 bg-white px-4 py-1.5">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">{[s.designation, s.nightOnly && t('Night only')].filter(Boolean).join(' · ') || s.staffCode}</p>
                  </td>
                  {roster.dates.map((d) => (
                    <td key={d} className={`px-1 py-1 text-center ${d === localDateStr() ? 'bg-orange-50/40' : ''}`}>
                      <Cell cell={roster.cells[s._id]?.[d]} shiftById={shiftById} onClick={() => edit(s, d)} disabled={!canWrite} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs text-gray-600">
              <tr>
                <td className="sticky left-0 bg-gray-50 px-4 py-2 font-semibold">{t('Head count')}</td>
                {roster.dates.map((d) => (
                  <td key={d} className="px-1 py-2 text-center">
                    {[...countFor(d)].map(([id, n]) => (
                      <span key={id} className="mr-1 inline-flex items-center gap-0.5"><ShiftChip shift={shiftById.get(id)} small />{n}</span>
                    ))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">{t('Faded cells follow the staff member\'s default shift and weekly off. Tap a cell to change it.')}</p>

      {editing && roster && (
        <CellEditor key={`${editing.staff._id}|${editing.date}`} target={editing} roster={roster} shiftById={shiftById} onClose={() => setEditing(null)} />
      )}
      <ConfirmModal
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        onConfirm={() => copyMut.mutate()}
        loading={copyMut.isPending}
        title="Copy last week"
        message={t('This week\'s plan will be replaced with the shifts from {from} – {to}.', { from: fDate(addDaysStr(weekStart, -7), 'dd MMM'), to: fDate(addDaysStr(weekStart, -1), 'dd MMM') })}
        confirmLabel="Copy"
        confirmClass="btn-primary"
      />
    </div>
  );
}
