import { useQuery } from '@tanstack/react-query';
import { Fingerprint, IndianRupee } from 'lucide-react';
import { getAttendanceSettings } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';
import { WEEKDAYS, shiftLabel } from '../attendance/attendanceUi.jsx';

// The "On attendance & payroll" part of the user form: attendance details (machine number,
// shifts, weekly off…) and salary details (pay, PF/ESI, bank). Saved with the user as
// `staffProfile`; the server keeps them in the person's attendance profile.

export const SALARY_FIELDS = ['monthlySalary', 'basicSalary', 'pfApplicable', 'esiApplicable', 'ptApplicable', 'uan', 'esicNo', 'bankAccount', 'ifsc'];

/** Form values for a user's profile (or a fresh one). */
export const profileToForm = (p, { oldSalary = 0, machineId = '', onPayroll = false } = {}) => ({
  onPayroll: p ? p.onPayroll !== false : onPayroll,
  staffCode: p?.staffCode || '',
  designation: p?.designation || '',
  gender: p?.gender || '',
  joinDate: p?.joinDate ? String(p.joinDate).slice(0, 10) : localDateStr(),
  leftOn: p?.leftOn ? String(p.leftOn).slice(0, 10) : '',
  machineId: p?.machineId ?? machineId,
  defaultShift: p?.defaultShift || '',
  nightOnly: Boolean(p?.nightOnly),
  weeklyOffDay: p?.weeklyOffDay ?? 0,
  doubleShiftEligible: Boolean(p?.doubleShiftEligible),
  paidLeavePerMonth: p?.paidLeavePerMonth ?? '',
  notes: p?.notes || '',
  monthlySalary: p?.monthlySalary ?? (oldSalary || ''),
  basicSalary: p?.basicSalary ?? '',
  pfApplicable: Boolean(p?.pfApplicable),
  esiApplicable: Boolean(p?.esiApplicable),
  ptApplicable: p ? p.ptApplicable !== false : true,
  uan: p?.uan || '',
  esicNo: p?.esicNo || '',
  bankAccount: p?.bankAccount || '',
  ifsc: p?.ifsc || '',
});

/** What is sent to the server — only the parts this person may change. */
export function profileFromForm(f, { canSalary }) {
  const { staffCode: _code, ...rest } = f;
  const out = {
    ...rest,
    weeklyOffDay: Number(f.weeklyOffDay),
    monthlySalary: Number(f.monthlySalary) || 0,
    basicSalary: f.basicSalary === '' ? '' : Number(f.basicSalary),
    paidLeavePerMonth: f.paidLeavePerMonth === '' ? '' : Number(f.paidLeavePerMonth),
  };
  return canSalary ? out : Object.fromEntries(Object.entries(out).filter(([k]) => !SALARY_FIELDS.includes(k)));
}

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
  </label>
);

const Tick = ({ label, hint, ...props }) => (
  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded" {...props} />
    <span>
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {hint && <span className="block text-xs text-gray-400">{hint}</span>}
    </span>
  </label>
);

export default function StaffProfileSection({ register, watch, isActive }) {
  const t = useT();
  const { can } = usePermissions();
  const canAttendance = can('attendance:manage');
  const seeSalary = can('salary:read');
  const canSalary = can('salary:manage');
  const { data } = useQuery({ queryKey: ['attendance', 'settings'], queryFn: getAttendanceSettings, enabled: can('attendance:read') });
  const settings = data?.data?.data;
  const shifts = settings?.shifts || [];

  const on = watch('staffProfile.onPayroll');
  const nightOnly = watch('staffProfile.nightOnly');
  const pf = watch('staffProfile.pfApplicable');
  const esi = watch('staffProfile.esiApplicable');
  const code = watch('staffProfile.staffCode');
  const p = (name) => `staffProfile.${name}`;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      <div className="flex items-center gap-3 border-b bg-teal-50 px-5 py-4">
        <Fingerprint className="h-5 w-5 text-teal-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{t('Attendance & payroll')}</p>
          <p className="mt-0.5 text-xs text-gray-500">{t('For temple workers who punch the attendance machine and get a salary')}</p>
        </div>
        {code && <span className="rounded bg-white px-2 py-0.5 font-mono text-xs text-teal-700">{code}</span>}
      </div>
      <fieldset disabled={!canAttendance} className="space-y-4 bg-white p-5">
        <Tick label={t('On attendance & payroll')} hint={t('Shows in the attendance registers and in monthly salary.')} {...register(p('onPayroll'))} />

        {on && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('Designation')}>
                <input {...register(p('designation'))} className="input" placeholder={t('Pujari, Cook, Guard, Store…')} list="designations" />
                <datalist id="designations">
                  {['Pujari', 'Cook', 'Helper', 'Guard', 'Cleaner', 'Store', 'Office', 'Driver', 'Gardener'].map((d) => <option key={d} value={d} />)}
                </datalist>
              </Field>
              <Field label={t('Gender')} hint={t('Professional Tax slabs differ for men and women.')}>
                <select {...register(p('gender'))} className="input">
                  <option value="">—</option>
                  <option value="male">{t('Male')}</option>
                  <option value="female">{t('Female')}</option>
                </select>
              </Field>
              <Field label={t('Machine number')} hint={t('The number this person is enrolled with on the biometric machine.')}>
                <input {...register(p('machineId'))} className="input font-mono" inputMode="numeric" autoComplete="off" />
              </Field>
              <Field label={t('Joining date')} hint={t('Days before this are not counted.')}>
                <input {...register(p('joinDate'))} className="input" type="date" />
              </Field>
              <Field label={t('Usual shift')} hint={t('Used for days without a roster.')}>
                <select {...register(p('defaultShift'))} className="input">
                  <option value="">{nightOnly ? t('First night shift') : t('First day shift')}</option>
                  {shifts.map((s) => <option key={s._id} value={s._id}>{shiftLabel(s)}</option>)}
                </select>
              </Field>
              <Field label={t('Weekly off')} hint={t('Used for weeks without a roster.')}>
                <select {...register(p('weeklyOffDay'))} className="input">
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
                </select>
              </Field>
              <Field label={t('Paid leaves per month')} hint={t('Leave empty to use the default ({n}).', { n: settings?.defaultPaidLeavePerMonth ?? 3 })}>
                <input {...register(p('paidLeavePerMonth'))} className="input" type="number" min={0} max={31} inputMode="numeric" placeholder={String(settings?.defaultPaidLeavePerMonth ?? 3)} />
              </Field>
              {!isActive && (
                <Field label={t('Last working day')} hint={t('Days after this are not counted.')}>
                  <input {...register(p('leftOn'))} className="input" type="date" />
                </Field>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Tick label={t('Night duty only')} hint={t('Always on the night shift.')} {...register(p('nightOnly'))} />
              <Tick label={t('Can do double shift')} hint={t('Day + same-night duty earns an extra leave.')} {...register(p('doubleShiftEligible'))} />
            </div>

            {seeSalary && (
              <fieldset disabled={!canSalary} className="space-y-4 rounded-xl border border-gray-100 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><IndianRupee className="h-4 w-4 text-green-600" />{t('Salary')}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('Monthly salary (₹)')}>
                    <input {...register(p('monthlySalary'))} className="input" type="number" min={0} inputMode="numeric" />
                  </Field>
                  <Field label={t('Basic salary (₹)')} hint={t('PF is on basic. Empty = the whole salary is basic.')}>
                    <input {...register(p('basicSalary'))} className="input" type="number" min={0} inputMode="numeric" />
                  </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Tick label={t('PF applicable')} {...register(p('pfApplicable'))} />
                  <Tick label={t('ESI applicable')} {...register(p('esiApplicable'))} />
                  <Tick label={t('Professional Tax')} {...register(p('ptApplicable'))} />
                </div>
                {(pf || esi) && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {pf && <Field label={t('UAN (PF)')}><input {...register(p('uan'))} className="input font-mono" inputMode="numeric" /></Field>}
                    {esi && <Field label={t('ESIC number')}><input {...register(p('esicNo'))} className="input font-mono" inputMode="numeric" /></Field>}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('Bank account number')}><input {...register(p('bankAccount'))} className="input font-mono" inputMode="numeric" autoComplete="off" /></Field>
                  <Field label={t('IFSC')}><input {...register(p('ifsc'))} className="input font-mono uppercase" autoComplete="off" /></Field>
                </div>
              </fieldset>
            )}
            <Field label={t('Notes')}><textarea {...register(p('notes'))} rows={2} className="input" /></Field>
          </>
        )}
      </fieldset>
    </div>
  );
}
