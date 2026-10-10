import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { FormField, FormRow, FormSection } from '../../components/ui/FormField.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { createStaff, getAttendanceSettings, getStaff, updateStaff } from '../../api/attendance.api.js';
import { getDepartments } from '../../api/department.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useT } from '../../i18n/index.jsx';
import { WEEKDAYS, shiftLabel } from './attendanceUi.jsx';
import { localDateStr } from '../../utils/formatters.js';

const Check = ({ label, hint, ...props }) => (
  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded" {...props} />
    <span>
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {hint && <span className="block text-xs text-gray-400">{hint}</span>}
    </span>
  </label>
);

// The app login link (user) is not edited here, so it is left out and stays as it is.
const SALARY_FIELDS = ['monthlySalary', 'basicSalary', 'pfApplicable', 'esiApplicable', 'ptApplicable', 'uan', 'esicNo', 'bankAccount', 'ifsc'];

const toForm = ({ user: _user, ...s }) => ({
  ...s,
  department: s.department?._id || s.department || '',
  joinDate: s.joinDate ? String(s.joinDate).slice(0, 10) : '',
  leftOn: s.leftOn ? String(s.leftOn).slice(0, 10) : '',
  defaultShift: s.defaultShift || '',
  paidLeavePerMonth: s.paidLeavePerMonth ?? '',
  basicSalary: s.basicSalary ?? '',
  gender: s.gender || '',
  ptApplicable: s.ptApplicable !== false,
  machineId: s.machineId || '',
});

export default function StaffForm() {
  const t = useT();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const seeSalary = can('salary:read');
  const canSalary = can('salary:manage');

  const { data: staffRes, isLoading } = useQuery({ queryKey: ['attendance', 'staff', 'one', id], queryFn: () => getStaff(id), enabled: isEdit });
  const { data: settingsRes } = useQuery({ queryKey: ['attendance', 'settings'], queryFn: getAttendanceSettings });
  const { data: deptRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments(), enabled: can('masters:read') });
  const staff = staffRes?.data?.data;
  const settings = settingsRes?.data?.data;
  const departments = deptRes?.data?.data || [];

  const values = useMemo(() => (staff ? toForm(staff) : undefined), [staff]);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      // New staff: attendance counts from today unless an earlier joining date is entered
      name: '', designation: '', gender: '', phone: '', department: '', joinDate: localDateStr(), leftOn: '', isActive: true,
      machineId: params.get('machineId') || '', defaultShift: '', nightOnly: false, weeklyOffDay: 0, doubleShiftEligible: false,
      monthlySalary: '', basicSalary: '', paidLeavePerMonth: '', pfApplicable: false, esiApplicable: false, ptApplicable: true,
      uan: '', esicNo: '', bankAccount: '', ifsc: '', notes: '',
    },
    values,
  });

  const mutation = useMutation({
    mutationFn: (d) => {
      let body = {
        ...d,
        weeklyOffDay: Number(d.weeklyOffDay),
        monthlySalary: Number(d.monthlySalary) || 0,
        basicSalary: d.basicSalary === '' ? '' : Number(d.basicSalary),
        paidLeavePerMonth: d.paidLeavePerMonth === '' ? '' : Number(d.paidLeavePerMonth),
      };
      // Pay and bank details are only sent by people allowed to change salary (the server checks too)
      if (!canSalary) body = Object.fromEntries(Object.entries(body).filter(([k]) => !SALARY_FIELDS.includes(k)));
      return isEdit ? updateStaff(id, body) : createStaff(body);
    },
    onSuccess: () => {
      toast.success(t(isEdit ? 'Staff updated' : 'Staff added'));
      qc.invalidateQueries({ queryKey: ['attendance'] });
      navigate('/attendance/staff');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  const nightOnly = watch('nightOnly');
  const isActive = watch('isActive');
  const pf = watch('pfApplicable');
  const esi = watch('esiApplicable');
  const shifts = settings?.shifts || [];

  if (isEdit && (isLoading || !staff)) return <PageLoader />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isEdit ? 'Edit Staff' : 'Add staff'}
        subtitle={isEdit ? staff.staffCode : undefined}
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Staff Register', to: '/attendance/staff' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="card space-y-5 p-4 sm:p-6">
          <FormSection title={t('Basic details')}>
            <FormRow>
              <FormField label={t('Name')} required error={errors.name?.message}>
                <input {...register('name', { required: t('Name is required') })} className="input" autoComplete="off" />
              </FormField>
              <FormField label={t('Designation')}>
                <input {...register('designation')} className="input" placeholder={t('Pujari, Cook, Guard, Store…')} list="designations" />
                <datalist id="designations">
                  {['Pujari', 'Cook', 'Helper', 'Guard', 'Cleaner', 'Store', 'Office', 'Driver', 'Gardener'].map((d) => <option key={d} value={d} />)}
                </datalist>
              </FormField>
            </FormRow>
            <FormRow>
              <FormField label={t('Phone')}>
                <input {...register('phone')} className="input" type="tel" inputMode="tel" />
              </FormField>
              <FormField label={t('Gender')} hint={t('Professional Tax slabs differ for men and women.')}>
                <select {...register('gender')} className="input">
                  <option value="">—</option>
                  <option value="male">{t('Male')}</option>
                  <option value="female">{t('Female')}</option>
                </select>
              </FormField>
            </FormRow>
            <FormRow>
              <FormField label={t('Joining date')} hint={t('Days before this are not counted.')}>
                <input {...register('joinDate')} className="input" type="date" />
              </FormField>
              {departments.length > 0 && (
                <FormField label={t('Department')}>
                  <select {...register('department')} className="input">
                    <option value="">—</option>
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </FormField>
              )}
            </FormRow>
            {isEdit && <Check label={t('Still working here')} hint={t('Untick when someone leaves — their past attendance is kept.')} {...register('isActive')} />}
            {isEdit && !isActive && (
              <FormField label={t('Last working day')} hint={t('Days after this are not counted.')}>
                <input {...register('leftOn')} className="input" type="date" />
              </FormField>
            )}
          </FormSection>
        </div>

        <div className="card space-y-5 p-4 sm:p-6">
          <FormSection title={t('Attendance')}>
            <FormRow>
              <FormField label={t('Machine number')} hint={t('The number this person is enrolled with on the biometric machine.')}>
                <input {...register('machineId')} className="input font-mono" inputMode="numeric" autoComplete="off" />
              </FormField>
              <FormField label={t('Weekly off')} hint={t('Used for weeks without a roster.')}>
                <select {...register('weeklyOffDay')} className="input">
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
                </select>
              </FormField>
            </FormRow>
            <FormField label={t('Usual shift')} hint={t('Used for days without a roster.')}>
              <select {...register('defaultShift')} className="input">
                <option value="">{nightOnly ? t('First night shift') : t('First day shift')}</option>
                {shifts.map((s) => <option key={s._id} value={s._id}>{shiftLabel(s)}</option>)}
              </select>
            </FormField>
            <div className="grid gap-2 sm:grid-cols-2">
              <Check label={t('Night duty only')} hint={t('Always on the night shift.')} {...register('nightOnly')} />
              <Check label={t('Can do double shift')} hint={t('Day + same-night duty earns an extra leave.')} {...register('doubleShiftEligible')} />
            </div>
            <FormField label={t('Paid leaves per month')} hint={t('Leave empty to use the default ({n}).', { n: settings?.defaultPaidLeavePerMonth ?? 3 })}>
              <input {...register('paidLeavePerMonth')} className="input sm:w-40" type="number" min={0} max={31} inputMode="numeric" placeholder={String(settings?.defaultPaidLeavePerMonth ?? 3)} />
            </FormField>
          </FormSection>
        </div>

        <div className="card space-y-5 p-4 sm:p-6">
          {seeSalary && (
          <fieldset disabled={!canSalary} className="space-y-4">
          <FormSection title={t('Salary')}>
            <FormRow>
              <FormField label={t('Monthly salary (₹)')}>
                <input {...register('monthlySalary')} className="input" type="number" min={0} inputMode="numeric" />
              </FormField>
              <FormField label={t('Basic salary (₹)')} hint={t('PF is on basic. Empty = the whole salary is basic.')}>
                <input {...register('basicSalary')} className="input" type="number" min={0} inputMode="numeric" />
              </FormField>
            </FormRow>
            <div className="grid gap-2 sm:grid-cols-3">
              <Check label={t('PF applicable')} {...register('pfApplicable')} />
              <Check label={t('ESI applicable')} {...register('esiApplicable')} />
              <Check label={t('Professional Tax')} {...register('ptApplicable')} />
            </div>
            {(pf || esi) && (
              <FormRow>
                {pf && <FormField label={t('UAN (PF)')}><input {...register('uan')} className="input font-mono" inputMode="numeric" /></FormField>}
                {esi && <FormField label={t('ESIC number')}><input {...register('esicNo')} className="input font-mono" inputMode="numeric" /></FormField>}
              </FormRow>
            )}
            <FormRow>
              <FormField label={t('Bank account number')}>
                <input {...register('bankAccount')} className="input font-mono" inputMode="numeric" autoComplete="off" />
              </FormField>
              <FormField label={t('IFSC')}>
                <input {...register('ifsc')} className="input font-mono uppercase" autoComplete="off" />
              </FormField>
            </FormRow>
          </FormSection>
          </fieldset>
          )}
          <FormField label={t('Notes')}>
            <textarea {...register('notes')} rows={2} className="input" />
          </FormField>
        </div>

        <StickyActionBar>
          <button type="button" onClick={() => navigate('/attendance/staff')} className="btn-secondary">{t('Cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? t('Saving...') : t('Save')}</button>
        </StickyActionBar>
      </form>
    </div>
  );
}
