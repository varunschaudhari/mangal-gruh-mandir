import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Mail, Phone, Lock, Shield, Building2,
  MessageCircle, MessageSquare, Bell, CheckCircle2, Key, CreditCard, IndianRupee,
} from 'lucide-react';
import { getUser, createUser, updateUser } from '../../api/user.api.js';
import { getDepartments } from '../../api/department.api.js';
import { getRoles } from '../../api/role.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { ROLE_LABELS } from '../../utils/permissions.js';
import toast from 'react-hot-toast';

const Section = ({ icon: Icon, title, subtitle, children, color = 'text-gray-600', bg = 'bg-gray-50' }) => (
  <div className={`rounded-xl border border-gray-100 overflow-hidden`}>
    <div className={`flex items-center gap-3 px-5 py-4 border-b ${bg}`}>
      <div className={`${color}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="p-5 bg-white space-y-4">{children}</div>
  </div>
);

const Field = ({ label, required, error, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const AlertToggle = ({ icon: Icon, color, bg, label, description, checked, onChange }) => (
  <label className={`flex items-start gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
    checked ? `${bg} border-current ${color}` : 'bg-white border-gray-100 hover:border-gray-200'
  }`}>
    <div className={`mt-0.5 shrink-0 ${checked ? color : 'text-gray-300'}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-semibold ${checked ? color : 'text-gray-600'}`}>{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
    </div>
    <div className="shrink-0 mt-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div className={`w-10 h-5 rounded-full transition-colors flex items-center ${checked ? (color.includes('green') ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-200'}`}>
        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform mx-0.5 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </div>
  </label>
);

const UserForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      role: 'staff', isActive: true,
      whatsappAlertsEnabled: false, smsAlertsEnabled: false,
      canApproveAssets:    false,
      canApprovePayments:  false,
      monthlySalary:       0,
    },
  });

  const selectedRole      = watch('role');
  const whatsappEnabled   = watch('whatsappAlertsEnabled');
  const smsEnabled        = watch('smsAlertsEnabled');
  const canApprove         = watch('canApproveAssets');
  const canApprovePayments = watch('canApprovePayments');
  const phone             = watch('phone');

  const { data: userRes, isLoading } = useQuery({
    queryKey: ['user', id], queryFn: () => getUser(id), enabled: isEdit,
  });
  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const { data: rolesRes } = useQuery({ queryKey: ['roles'], queryFn: getRoles });

  useEffect(() => {
    if (userRes?.data?.data) {
      const u = userRes.data.data;
      reset({ ...u, departments: u.departments?.map((d) => d._id || d) });
    }
  }, [userRes]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateUser(id, data) : createUser(data),
    onSuccess: () => {
      toast.success(isEdit ? 'User updated' : 'User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/users');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  const depts = deptsRes?.data?.data || [];
  const roles = rolesRes?.data?.data?.filter((r) => r.isActive) || [];
  const showDepts = !['super_admin', 'admin'].includes(selectedRole);
  const hasPhone = phone?.trim().length >= 10;
  const alertsActive = whatsappEnabled || smsEnabled;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isEdit ? 'Edit User' : 'New User'}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users', to: '/admin/users' }, { label: isEdit ? 'Edit' : 'New' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        {/* ── Account Details ── */}
        <Section icon={User} title="Account Details" subtitle="Basic login and contact information" color="text-blue-600" bg="bg-blue-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name" required error={errors.name?.message}>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input {...register('name', { required: 'Name is required' })} className="input pl-9" placeholder="e.g. Ramesh Patil" />
              </div>
            </Field>
            <Field label="Email Address" required error={errors.email?.message}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input {...register('email', { required: 'Email is required' })} className="input pl-9" type="email" placeholder="user@mandir.com" />
              </div>
            </Field>
          </div>

          <Field
            label="Mobile Number"
            hint="Used for both WhatsApp and SMS alerts — include country code (e.g. 919876543210)"
            error={errors.phone?.message}
          >
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
              <input
                {...register('phone', {
                  validate: (v) => !v || /^\d{10,15}$/.test(v) || 'Enter number with country code, no spaces or + sign',
                })}
                className="input pl-9"
                type="tel"
                placeholder="919876543210"
              />
            </div>
          </Field>

          {!isEdit && (
            <Field label="Password" required error={errors.password?.message} hint="Minimum 6 characters">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                  {...register('password', {
                    required: !isEdit && 'Password is required',
                    minLength: { value: 6, message: 'Min 6 characters' },
                  })}
                  className="input pl-9"
                  type="password"
                  placeholder="••••••••"
                />
              </div>
            </Field>
          )}
        </Section>

        {/* ── Role & Access ── */}
        <Section icon={Shield} title="Role & Access" subtitle="Permissions and department assignment" color="text-purple-600" bg="bg-purple-50">
          <Field label="Role" required>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value || ''}
                  onChange={field.onChange}
                  options={roles.map((r) => ({ value: r.slug, label: r.name }))}
                  placeholder="Select role…"
                  nullable={false}
                />
              )}
            />
          </Field>

          {showDepts && (
            <Field label="Department Access" hint="Leave all unchecked to allow access to all departments">
              <div className="grid grid-cols-2 gap-2 mt-1">
                {depts.map((d) => (
                  <label key={d._id} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                    <input type="checkbox" value={d._id} {...register('departments')} className="h-4 w-4 rounded text-primary-600" />
                    <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-700">{d.name}</span>
                    <span className="text-gray-400 text-xs">({d.code})</span>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <Field label="Monthly Salary (₹)" hint="Used for auto-fill when recording salary expenses. Leave 0 if not on payroll.">
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
              <input
                type="number"
                min="0"
                step="100"
                {...register('monthlySalary', { min: { value: 0, message: 'Cannot be negative' }, valueAsNumber: true })}
                className="input pl-9"
                placeholder="0"
              />
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded text-primary-600" />
            <CheckCircle2 className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-700">Account is Active</span>
          </label>

          <label className={`flex items-start gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
            canApprove ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-white border-gray-100 hover:border-gray-200'
          }`}>
            <div className={`mt-0.5 shrink-0 ${canApprove ? 'text-purple-600' : 'text-gray-300'}`}>
              <Key className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${canApprove ? 'text-purple-700' : 'text-gray-600'}`}>Can Approve Asset Requests</p>
              <p className="text-xs text-gray-400 mt-0.5">This person can appear as approver when help desk logs asset borrow requests</p>
            </div>
            <div className="shrink-0 mt-0.5">
              <input type="checkbox" {...register('canApproveAssets')} className="sr-only" />
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center ${canApprove ? 'bg-purple-500' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform mx-0.5 ${canApprove ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
            canApprovePayments ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-gray-100 hover:border-gray-200'
          }`}>
            <div className={`mt-0.5 shrink-0 ${canApprovePayments ? 'text-emerald-600' : 'text-gray-300'}`}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${canApprovePayments ? 'text-emerald-700' : 'text-gray-600'}`}>Can Approve Payments</p>
              <p className="text-xs text-gray-400 mt-0.5">This person can approve or reject supplier payment vouchers (trustee-level access)</p>
            </div>
            <div className="shrink-0 mt-0.5">
              <input type="checkbox" {...register('canApprovePayments')} className="sr-only" />
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center ${canApprovePayments ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform mx-0.5 ${canApprovePayments ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </div>
          </label>
        </Section>

        {/* ── Notifications ── */}
        <Section
          icon={Bell}
          title="Notifications"
          subtitle="Choose how this user receives stock alerts"
          color="text-orange-600"
          bg="bg-orange-50"
        >
          {!hasPhone && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <Phone className="h-4 w-4 shrink-0" />
              Add a mobile number above to enable alerts
            </div>
          )}

          <div className="space-y-2">
            <AlertToggle
              icon={MessageCircle}
              color="text-green-600"
              bg="bg-green-50"
              label="WhatsApp Alerts"
              description="Instant WhatsApp message when stock drops below threshold"
              checked={whatsappEnabled}
              onChange={(e) => setValue('whatsappAlertsEnabled', e.target.checked, { shouldDirty: true })}
            />
            <AlertToggle
              icon={MessageSquare}
              color="text-blue-600"
              bg="bg-blue-50"
              label="SMS Alerts"
              description="SMS via MSG91 when stock drops below threshold"
              checked={smsEnabled}
              onChange={(e) => setValue('smsAlertsEnabled', e.target.checked, { shouldDirty: true })}
            />
          </div>

          {alertsActive && !hasPhone && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              ⚠ Please add a mobile number to receive alerts.
            </p>
          )}

          {alertsActive && hasPhone && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Alerts will be sent to <span className="font-mono font-semibold ml-1">{phone}</span>
            </div>
          )}
        </Section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary px-6">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
          </button>
          <button type="button" onClick={() => navigate('/admin/users')} className="btn-secondary">
            Cancel
          </button>
        </div>

      </form>
    </div>
  );
};

export default UserForm;
