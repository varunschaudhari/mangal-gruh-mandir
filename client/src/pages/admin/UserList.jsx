import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, KeyRound } from 'lucide-react';
import { getUsers, resetUserPassword } from '../../api/user.api.js';
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

const ROLE_COLORS = { super_admin:'red', admin:'orange', store_manager:'blue', staff:'green', viewer:'gray' };
const col = createColumnHelper();

const UserList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [resetTarget, setResetTarget] = useState(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  const resetMut = useMutation({
    mutationFn: ({ id, newPassword }) => resetUserPassword(id, { newPassword }),
    onSuccess: () => { toast.success('Password reset'); setResetTarget(null); reset(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const users = data?.data?.data || [];

  const columns = [
    col.accessor('name', {
      header: 'Name',
      cell: (i) => (
        <div>
          <p className="font-medium text-gray-900">{i.getValue()}</p>
          <p className="text-xs text-gray-400">{i.row.original.email}</p>
        </div>
      ),
    }),
    col.accessor('role', {
      header: 'Role',
      size: 130,
      cell: (i) => <Badge variant={ROLE_COLORS[i.getValue()]}>{ROLE_LABELS[i.getValue()]}</Badge>,
    }),
    col.accessor('departments', {
      header: 'Departments',
      cell: (i) => {
        const depts = i.getValue();
        if (!depts?.length) return <span className="text-gray-400">All</span>;
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
      id: 'actions', header: 'Actions', size: 100,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('users:write') && (
            <>
              <Link to={`/admin/users/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>
              <button onClick={() => { setResetTarget(row.original); reset(); }} className="btn-ghost p-1 text-gray-400 hover:text-orange-600"><KeyRound className="h-4 w-4" /></button>
            </>
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
        actions={can('users:write') && <Link to="/admin/users/new" className="btn-primary"><Plus className="h-4 w-4" /> Add User</Link>}
      />
      <DataTable columns={columns} data={users} loading={isLoading} />

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset Password — ${resetTarget?.name}`} size="sm">
        <form onSubmit={handleSubmit(({ newPassword }) => resetMut.mutate({ id: resetTarget._id, newPassword }))} className="space-y-4">
          <FormField label="New Password" required error={errors.newPassword?.message}>
            <input type="password" {...register('newPassword', { required: true, minLength: { value: 6, message: 'Min 6 characters' } })} className="input" />
          </FormField>
          <FormActions onCancel={() => setResetTarget(null)} loading={resetMut.isPending} submitLabel="Reset Password" />
        </form>
      </Modal>
    </div>
  );
};

export default UserList;
