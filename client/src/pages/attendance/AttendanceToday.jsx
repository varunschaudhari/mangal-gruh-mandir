import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, WifiOff, UserPlus, Fingerprint } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { getAttendanceDays, getAttendanceSettings, getUnmappedIds } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fDate, fDateTime, localDateStr } from '../../utils/formatters.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';
import { DayDetailSheet, ShiftChip, StatusBadge, addDaysStr, fMinutes, fTime } from './attendanceUi.jsx';

// Who is in, who hasn't come, who forgot to punch — for one day. Tap a person to fix their day.

const FILTERS = [
  { key: 'all',     label: 'All',           match: () => true },
  { key: 'in',      label: 'Present',       match: (d) => ['present', 'working', 'worked_off', 'on_duty'].includes(d.status) },
  { key: 'not_in',  label: 'Not In Yet',    match: (d) => d.status === 'not_in' },
  { key: 'absent',  label: 'Absent',        match: (d) => ['absent', 'half_day'].includes(d.status) },
  { key: 'leave',   label: 'On Leave',      match: (d) => d.status === 'leave' },
  { key: 'missing', label: 'Missing Punch', match: (d) => d.status === 'missing_punch' || d.status === 'unscheduled' },
  { key: 'late',    label: 'Late',          match: (d) => d.lateMinutes > 0 },
  { key: 'off',     label: 'Weekly Off',    match: (d) => ['off', 'holiday', 'none'].includes(d.status) },
];

const MACHINE_QUIET_MIN = 30;

export default function AttendanceToday() {
  const t = useT();
  const { can } = usePermissions();
  const [date, setDate] = useState(localDateStr());
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null); // staff id

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'days', date, date],
    queryFn: () => getAttendanceDays({ from: date, to: date }),
    refetchInterval: date === localDateStr() ? 60 * 1000 : false,
  });
  const { data: settingsRes } = useQuery({ queryKey: ['attendance', 'settings'], queryFn: getAttendanceSettings, enabled: can('attendance:read') });
  const { data: unmappedRes } = useQuery({ queryKey: ['attendance', 'unmapped'], queryFn: getUnmappedIds, enabled: can('attendance:manage') });

  const res = data?.data?.data;
  const shifts = res?.shifts || [];
  const shiftById = useMemo(() => new Map((res?.shifts || []).map((s) => [String(s._id), s])), [res]);
  const rows = useMemo(() => (res?.staff || []).map((s) => ({ staff: s, day: res.days[s._id]?.[date] }))
    .filter((r) => r.day && r.day.status !== 'not_employed'), [res, date]);
  const holiday = rows.find((r) => r.day.holiday)?.day.holiday;

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => f.match(r.day)).length]));
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => FILTERS.find((f) => f.key === filter).match(r.day)
    && (!q || r.staff.name.toLowerCase().includes(q) || r.staff.staffCode.toLowerCase().includes(q) || (r.staff.designation || '').toLowerCase().includes(q)));

  const devices = settingsRes?.data?.data?.devices || [];
  const approved = devices.filter((d) => d.approved);
  const quiet = approved.filter((d) => !d.lastSeenAt || Date.now() - new Date(d.lastSeenAt) > MACHINE_QUIET_MIN * 60 * 1000);
  const waiting = devices.filter((d) => !d.approved);
  const unmapped = unmappedRes?.data?.data || [];
  const isToday = date === localDateStr();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Daily Attendance"
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Daily Attendance' }]}
      />

      {/* Machine health — only for people who manage it */}
      {can('attendance:manage') && (approved.length === 0 || quiet.length > 0 || waiting.length > 0) && (
        <Link to="/attendance/settings" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {waiting.length > 0 ? t('A new attendance machine is waiting for approval.')
              : approved.length === 0 ? t('No attendance machine connected yet. Set it up in Shifts & Machine.')
                : t('Machine "{name}" has not been in touch since {time}.', { name: quiet[0].name || quiet[0].serial, time: quiet[0].lastSeenAt ? fDateTime(quiet[0].lastSeenAt) : '—' })}
          </span>
        </Link>
      )}
      {can('attendance:manage') && unmapped.length > 0 && (
        <Link to="/attendance/staff" className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('Machine numbers not linked to any staff member: {ids}. Tap to add them.', { ids: unmapped.slice(0, 5).map((u) => u.machineId).join(', ') })}</span>
        </Link>
      )}

      {/* Date switcher */}
      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => setDate(addDaysStr(date, -1))} className="btn-ghost p-2" aria-label={t('Previous day')}><ChevronLeft className="h-5 w-5" /></button>
        {/* The date input sits invisibly over the label, so a tap opens the native picker */}
        <div className="relative flex-1 text-center">
          <span className="block text-base font-semibold text-gray-900">{isToday ? t('Today') : fDate(date, 'EEEE')}</span>
          <span className="block text-xs text-gray-500">{fDate(date, 'dd MMM yyyy')}</span>
          <input
            type="date" value={date} max={localDateStr()} aria-label={t('Date')}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <button onClick={() => setDate(addDaysStr(date, 1))} disabled={isToday} className="btn-ghost p-2 disabled:opacity-30" aria-label={t('Next day')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      {holiday && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{t('Holiday: {name}', { name: holiday })}</p>}

      {/* Filter chips with counts */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
        <div className="flex w-max gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { haptics.select(); setFilter(f.key); }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                filter === f.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {t(f.label)}
              <span className={`rounded-full px-1.5 text-xs ${filter === f.key ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name, code or designation')} className="input pl-9" />
      </div>

      {isLoading ? <PageLoader /> : rows.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <Fingerprint className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">{t('No staff added yet.')}</p>
          {can('attendance:manage') && can('users:write') && <Link to="/admin/users/new?payroll=1&from=staff" className="btn-primary mt-4 inline-flex">{t('Add staff')}</Link>}
        </div>
      ) : shown.length === 0 ? (
        <div className="card px-4 py-10 text-center text-sm text-gray-400">{t('Nobody in this list.')}</div>
      ) : (
        <ul className="card divide-y divide-gray-100 overflow-hidden">
          {shown.map(({ staff, day }) => (
            <li key={staff._id}>
              <button onClick={() => setOpen(staff._id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[15px] font-medium text-gray-900">
                    {staff.name}
                    {day.shifts.map((id) => <ShiftChip key={id} shift={shiftById.get(String(id))} small />)}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[staff.designation, staff.staffCode].filter(Boolean).join(' · ')}
                    {day.firstIn && <> · {t('In')} {fTime(day.firstIn)}{day.lastOut && <> · {t('Out')} {fTime(day.lastOut)}</>}</>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={day.status} />
                  <span className="flex gap-1.5 text-[11px] text-gray-400">
                    {day.lateMinutes > 0 && <span className="font-medium text-orange-600">{t('Late {m}m', { m: day.lateMinutes })}</span>}
                    {day.workedMinutes > 0 && <span>{fMinutes(day.workedMinutes)}</span>}
                    {day.double && <span className="font-medium text-purple-600">{t('Double')}</span>}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DayDetailSheet
        key={`${open}|${date}`}
        staffId={open}
        date={open ? date : null}
        shifts={shifts}
        canWrite={can('attendance:write')}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
