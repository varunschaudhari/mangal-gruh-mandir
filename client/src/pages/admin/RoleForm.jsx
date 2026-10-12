import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRole, createRole, updateRole } from '../../api/role.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/index.jsx';

const PERMISSION_GROUPS = {
  Users:        ['users:read', 'users:write', 'users:delete'],
  Masters:      ['masters:read', 'masters:write', 'masters:delete'],
  Transactions: ['transactions:read', 'transactions:create', 'transactions:delete'],
  Reports:      ['reports:read'],
  Assets:       ['assets:read', 'assets:write', 'assets:manage'],
  Donations:    ['donations:read', 'donations:write'],
  Payments:     ['payments:read', 'payments:write', 'payments:approve'],
  Mahaprasad:   ['mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem'],
  Attendance:   ['attendance:read', 'attendance:write', 'attendance:manage', 'attendance:approve'],
  Salary:       ['salary:read', 'salary:manage'],
  Bookings:     ['bookings:read', 'bookings:create', 'bookings:void', 'bookings:manage', 'bookings:cash', 'bookings:checkin'],
};

const PERMISSION_LABELS = {
  'users:read': 'View users & roles', 'users:write': 'Create/edit users & roles', 'users:delete': 'Delete roles',
  'masters:read': 'View masters', 'masters:write': 'Create/edit masters', 'masters:delete': 'Delete masters',
  'transactions:read': 'View transactions', 'transactions:create': 'Create transactions', 'transactions:delete': 'Void transactions',
  'reports:read': 'View reports',
  'assets:read': 'View assets & borrows', 'assets:write': 'Create/edit assets', 'assets:manage': 'Manage borrow requests',
  'donations:read': 'View donations', 'donations:write': 'Create/void donations',
  'payments:read': 'View payments', 'payments:write': 'Create/edit payments', 'payments:approve': 'Approve/reject payments',
  'mahaprasad:read': 'View mahaprasad', 'mahaprasad:issue': 'Issue coupons', 'mahaprasad:redeem': 'Redeem coupons',
  'attendance:read': 'View attendance & roster', 'attendance:write': 'Plan roster & correct attendance', 'attendance:manage': 'Staff register, shifts & machine', 'attendance:approve': 'Decide double-shift rewards & overtime',
  'salary:read': 'View salary, payslips & files', 'salary:manage': 'Prepare, finalise & pay salary; advances',
  'bookings:read': 'View pooja bookings & reports', 'bookings:create': 'Book at the counter, fix details, close own shift',
  'bookings:void': 'Void bookings', 'bookings:manage': 'Booking setup (sevas, batches, closed dates)',
  'bookings:cash': 'See all cash handovers & verify them',
  'bookings:checkin': 'Scan booking slips at the hall (check-in)',
};

const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();

const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const RoleForm = () => {
  const t = useT();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { name: '', slug: '', description: '', permissions: [], isActive: true },
  });

  const name = watch('name');
  const permissions = watch('permissions') || [];

  const { data: roleRes, isLoading } = useQuery({
    queryKey: ['role', id],
    queryFn: () => getRole(id),
    enabled: isEdit,
  });

  const role = roleRes?.data?.data;

  useEffect(() => {
    if (role) {
      // '*' wildcard means all permissions — expand it so checkboxes show correctly
      const perms = role.permissions?.includes('*') ? ALL_PERMISSIONS : (role.permissions || []);
      reset({
        name: role.name,
        slug: role.slug,
        description: role.description || '',
        permissions: perms,
        isActive: role.isActive,
      });
    }
  }, [role]);

  // Auto-fill slug from name on create
  useEffect(() => {
    if (!isEdit && name) setValue('slug', toSlug(name));
  }, [name, isEdit]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateRole(id, data) : createRole(data),
    onSuccess: () => {
      toast.success(isEdit ? t('Role updated') : t('Role created'));
      qc.invalidateQueries({ queryKey: ['roles'] });
      navigate('/admin/roles');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  const togglePermission = (perm) => {
    const current = permissions;
    setValue(
      'permissions',
      current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm],
    );
  };

  const toggleGroup = (group, perms) => {
    const allChecked = perms.every((p) => permissions.includes(p));
    const current = permissions.filter((p) => !perms.includes(p));
    setValue('permissions', allChecked ? current : [...current, ...perms]);
  };

  const isSystemRole = isEdit && role?.isSystem;
  const isWildcard = isEdit && role?.permissions?.includes('*');

  if (isEdit && isLoading) return <PageLoader />;

  return (
    <div className="max-w-xl">
      <PageHeader
        title={isEdit ? 'Edit Role' : 'New Role'}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Roles', to: '/admin/roles' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title={t('Role Details')}>
          <FormField label={t('Name')} required error={errors.name?.message}>
            <input
              {...register('name', { required: 'Name is required' })}
              className="input"
              disabled={isSystemRole}
            />
          </FormField>
          <FormRow cols={2}>
            <FormField label={t('Slug')} required error={errors.slug?.message} hint={t('Lowercase letters, digits, underscores')}>
              <input
                {...register('slug', {
                  required: 'Slug is required',
                  pattern: { value: /^[a-z0-9_]+$/, message: t('Only lowercase letters, digits, underscores') },
                })}
                className="input font-mono"
                disabled={isEdit}
              />
            </FormField>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" />
                {t('Active')}
              </label>
            </div>
          </FormRow>
          <FormField label={t('Description')}>
            <input {...register('description')} className="input" placeholder={t('Optional description')} />
          </FormField>
        </FormSection>

        <FormSection title={t('Permissions')}>
          {isWildcard && (
            <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 text-sm text-primary-800 font-medium">
              {t('✦ This role has full wildcard access (')}<code className="font-mono text-xs bg-primary-100 px-1 rounded">*</code>{t('). All permissions are granted automatically — changes here will not reduce access unless you save.')}
            </div>
          )}
          {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => {
            const allChecked = perms.every((p) => permissions.includes(p));
            const someChecked = perms.some((p) => permissions.includes(p));
            return (
              <div key={group} className="rounded-lg border border-gray-200 overflow-hidden">
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer border-b border-gray-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={() => toggleGroup(group, perms)}
                  />
                  <span className="text-sm font-semibold text-gray-700">{group}</span>
                </label>
                <div className="divide-y divide-gray-100">
                  {perms.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        checked={permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                      />
                      <span className="text-sm text-gray-700 flex-1">{PERMISSION_LABELS[perm]}</span>
                      <span className="text-xs font-mono text-gray-400">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </FormSection>

        <FormActions onCancel={() => navigate('/admin/roles')} loading={mutation.isPending} submitLabel={isEdit ? 'Update Role' : 'Create Role'} />
      </form>
    </div>
  );
};

export default RoleForm;
