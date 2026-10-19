import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, KeyRound, MessageCircle, MessageSquare, Key, Search, X, Trash2 } from 'lucide-react';
import { getUsers, resetUserPassword, getUserDeleteCheck, deleteUser, updateUser } from '../../api/user.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { FormField, FormActions } from '../../components/ui/FormField.jsx';
import { ROLE_LABELS } from '../../utils/permissions.js';
import { fDateTime } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useT, rich } from '../../i18n/index.jsx';

const ROLE_COLORS = { super_admin:'red', admin:'orange', store_manager:'blue', staff:'green', viewer:'gray' };
const col = createColumnHelper();

const UserList = () => {
  const { can, user: me } = usePermissions();
  const t = useT();
  const qc = useQueryClient();
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  // Delete is for super admins only, and never their own login
  const myId = String(me?._id || me?.id || '');
  const canDelete = (u) => me?.role === 'super_admin' && String(u._id) !== myId;

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => getUsers() });
  const resetMut = useMutation({
    mutationFn: ({ id, newPassword }) => resetUserPassword(id, { newPassword }),
    onSuccess: () => { toast.success(t('Password reset')); setResetTarget(null); reset(); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });
  // Whether the login has done anything in the app — then it can only be deactivated
  const { data: checkRes, isLoading: checking, isError: checkFailed } = useQuery({
    queryKey: ['user-delete-check', deleteTarget?._id],
    queryFn: () => getUserDeleteCheck(deleteTarget._id),
    enabled: !!deleteTarget,
    staleTime: 0,
  });
  const check = checkRes?.data?.data;
  const closeDelete = () => setDeleteTarget(null);
  const deleteMut = useMutation({
    mutationFn: (id) => deleteUser(id),
    onSuccess: () => { toast.success(t('Login deleted')); closeDelete(); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed to delete')),
  });
  const deactivateMut = useMutation({
    mutationFn: (id) => updateUser(id, { isActive: false }),
    onSuccess: () => { toast.success(t('Login deactivated')); closeDelete(); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  const users = data?.data?.data || [];
  // Search by name, email, phone, role (as shown, in either language), staff code or department
  const q = search.trim().toLowerCase();
  const shown = q
    ? users.filter((u) => [
      u.name, u.email, u.phone, u.staffCode, u.role, ROLE_LABELS[u.role], t(ROLE_LABELS[u.role] || ''),
      ...(u.departments || []).map((d) => `${d.code || ''} ${d.name || ''}`),
    ].filter(Boolean).join(' ').toLowerCase().includes(q))
    : users;

  const columns = [
    col.accessor('name', {
      header: 'Name',
      cell: (i) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{i.getValue()}</p>
            {i.row.original.canApproveAssets && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                <Key className="h-3 w-3" /> {t('Approver')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {i.row.original.email}
            {i.row.original.onPayroll && <span className="ml-1.5 rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700">{i.row.original.staffCode}</span>}
          </p>
        </div>
      ),
    }),
    col.accessor('role', {
      header: 'Role',
      size: 130,
      cell: (i) => <Badge variant={ROLE_COLORS[i.getValue()]}>{t(ROLE_LABELS[i.getValue()])}</Badge>,
    }),
    col.accessor('departments', {
      header: 'Departments',
      cell: (i) => {
        const depts = i.getValue();
        if (!depts?.length) return <span className="text-gray-400">{t('All')}</span>;
        return depts.map((d) => d.code || d).join(', ');
      },
    }),
    col.accessor('lastLogin', {
      header: 'Last Login',
      size: 160,
      cell: (i) => <span className="text-xs text-gray-500">{fDateTime(i.getValue())}</span>,
    }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'alerts',
      header: 'Alerts',
      size: 110,
      cell: ({ row }) => {
        const wa  = row.original.whatsappAlertsEnabled;
        const sms = row.original.smsAlertsEnabled;
        if (!wa && !sms) return <span className="text-xs text-gray-400">{t('None')}</span>;
        return (
          <div className="flex items-center gap-1.5">
            {wa  && <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded"><MessageCircle className="h-3 w-3" />WA</span>}
            {sms && <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"><MessageSquare className="h-3 w-3" />SMS</span>}
          </div>
        );
      },
    }),
    col.display({
      id: 'actions', header: 'Actions', size: 100,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('users:write') && (
            <>
              <Link to={`/admin/users/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>
              <button onClick={() => { setResetTarget(row.original); reset(); }} className="btn-ghost p-1 text-gray-400 hover:text-orange-600"><KeyRound className="h-4 w-4" /></button>
            </>
          )}
          {canDelete(row.original) && (
            <button onClick={() => setDeleteTarget(row.original)} aria-label={t('Delete')} title={t('Delete')}
              className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Manage staff accounts and roles"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users' }]}
        actions={can('users:write') && <Link to="/admin/users/new" className="btn-primary"><Plus className="h-4 w-4" /> {t('Add User')}</Link>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
            placeholder={t('Search name, email, phone or role')} aria-label={t('Search users')}
            className="input pl-9 pr-9" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label={t('Clear search')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {q && !isLoading && (
          <p className="text-sm text-gray-500">{t('{n} of {total} users', { n: shown.length, total: users.length })}</p>
        )}
      </div>
      <DataTable columns={columns} data={shown} loading={isLoading} />

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={t('Reset Password — {name}', { name: resetTarget?.name })} size="sm">
        <form onSubmit={handleSubmit(({ newPassword }) => resetMut.mutate({ id: resetTarget._id, newPassword }))} className="space-y-4">
          <FormField label={t('New Password')} required error={errors.newPassword?.message}>
            <input type="password" {...register('newPassword', { required: true, minLength: { value: 6, message: t('Min 6 characters') } })} className="input" />
          </FormField>
          <FormActions onCancel={() => setResetTarget(null)} loading={resetMut.isPending} submitLabel="Reset Password" />
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={closeDelete} title={t('Delete Login — {name}', { name: deleteTarget?.name })} size="sm">
        <div className="space-y-4">
          {checking ? (
            <p className="text-sm text-gray-500">{t('Checking this login’s records…')}</p>
          ) : checkFailed || !check ? (
            <p className="text-sm text-red-600">{t('Could not check this login. Try again.')}</p>
          ) : check.canDelete ? (
            <p className="text-sm text-gray-600">
              {rich(t('Delete the login {email}? It has no records in the app. This cannot be undone.'), { email: <strong>{deleteTarget?.email}</strong> })}
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-red-600">{t('This login can’t be deleted — it has records in the app:')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {check.records.map((r) => <li key={r} className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{t(r)}</li>)}
              </ul>
              <p className="text-gray-600">
                {deleteTarget?.isActive
                  ? t('Deactivate it instead: they can’t sign in, and old records still show their name.')
                  : t('It is already inactive, so they can’t sign in.')}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={closeDelete}>{t('Cancel')}</button>
            {check?.canDelete && (
              <button className="btn-danger" onClick={() => deleteMut.mutate(deleteTarget._id)} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? t('Deleting…') : t('Delete')}
              </button>
            )}
            {check && !check.canDelete && deleteTarget?.isActive && (
              <button className="btn-danger" onClick={() => deactivateMut.mutate(deleteTarget._id)} disabled={deactivateMut.isPending}>
                {t('Deactivate')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserList;
