import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Fingerprint, Moon, AlertCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { ActiveBadge } from '../../components/ui/Badge.jsx';
import { getAttendanceSettings, getStaffList, getUnmappedIds } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fDateTime } from '../../utils/formatters.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';
import { ShiftChip, WEEKDAYS } from './attendanceUi.jsx';

// Everyone whose attendance is tracked, with their machine number, usual shift and weekly off.

const VIEWS = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Left' },
  { key: 'all', label: 'All' },
];

export default function StaffList() {
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManage = can('attendance:manage');
  const [view, setView] = useState('active');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'staff', view],
    queryFn: () => getStaffList(view === 'all' ? {} : { active: view === 'active' }),
  });
  const { data: settingsRes } = useQuery({ queryKey: ['attendance', 'settings'], queryFn: getAttendanceSettings });
  const { data: unmappedRes } = useQuery({ queryKey: ['attendance', 'unmapped'], queryFn: getUnmappedIds, enabled: canManage });

  const staff = data?.data?.data || [];
  const unmapped = unmappedRes?.data?.data || [];

  const columns = useMemo(() => {
    const shifts = settingsRes?.data?.data?.shifts || [];
    const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
    const defaultFor = (s) => shiftById.get(String(s.defaultShift)) || shifts.find((x) => x.kind === (s.nightOnly ? 'night' : 'day'));
    return [
    {
      id: 'name', accessorKey: 'name', header: 'Name',
      cell: ({ row: { original: s } }) => (
        <div>
          <p className="font-medium text-gray-900">{s.name}</p>
          <p className="text-xs text-gray-500">{[s.staffCode, s.designation].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    {
      id: 'machineId', accessorKey: 'machineId', header: 'Machine No.',
      cell: ({ getValue }) => (getValue()
        ? <span className="inline-flex items-center gap-1 font-mono"><Fingerprint className="h-3.5 w-3.5 text-gray-400" />{getValue()}</span>
        : <span className="text-xs text-orange-600">{t('Not enrolled')}</span>),
    },
    {
      id: 'shift', header: 'Usual Shift', enableSorting: false,
      cell: ({ row: { original: s } }) => {
        const sh = defaultFor(s);
        return sh ? <span className="inline-flex items-center gap-1.5"><ShiftChip shift={sh} />{s.nightOnly && <Moon className="h-3.5 w-3.5 text-indigo-500" />}</span> : '—';
      },
    },
    { id: 'weeklyOffDay', accessorKey: 'weeklyOffDay', header: 'Weekly Off', cell: ({ getValue }) => t(WEEKDAYS[getValue() ?? 0]) },
    { id: 'department', accessorFn: (s) => s.department?.name || '', header: 'Department', meta: { mobile: 'hidden' } },
    { id: 'phone', accessorKey: 'phone', header: 'Phone' },
    { id: 'isActive', accessorKey: 'isActive', header: 'Status', cell: ({ getValue }) => <ActiveBadge isActive={getValue()} /> },
    ];
  }, [t, settingsRes]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? staff.filter((s) => [s.name, s.staffCode, s.designation, s.machineId, s.phone].some((v) => String(v || '').toLowerCase().includes(q)))
    : staff;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Register"
        subtitle={t('{n} staff', { n: staff.length })}
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Staff Register' }]}
        actions={canManage && (
          <Link to="/attendance/staff/new" className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" />{t('Add staff')}</Link>
        )}
      />

      {canManage && unmapped.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <p className="mb-2 flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4" />{t('The machine has punches for numbers not given to anyone:')}</p>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map((u) => (
              <Link key={u.machineId} to={`/attendance/staff/new?machineId=${encodeURIComponent(u.machineId)}`}
                className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs" title={t('Last punch {time}', { time: fDateTime(u.last) })}>
                <b className="font-mono">{u.machineId}</b> · {u.count === 1 ? t('1 punch') : t('{n} punches', { n: u.count })} · <span className="text-blue-600">{t('Add')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => { haptics.select(); setView(v.key); }}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium ${view === v.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
              {t(v.label)}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name, code, machine no.')} className="input pl-9" />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        pageSize={25}
        onRowClick={canManage ? (s) => navigate(`/attendance/staff/${s._id}/edit`) : undefined}
      />
    </div>
  );
}
