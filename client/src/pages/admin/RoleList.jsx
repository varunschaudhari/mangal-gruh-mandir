import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { getRoles, deleteRole } from '../../api/role.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';
import { useT, rich } from '../../i18n/index.jsx';

const col = createColumnHelper();

const RoleList = () => {
  const { can } = usePermissions();
  const t = useT();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['roles'], queryFn: getRoles });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteRole(id),
    onSuccess: () => { toast.success(t('Role deleted')); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed to delete')),
  });

  const roles = data?.data?.data || [];

  const columns = [
    col.accessor('name', {
      header: 'Role',
      cell: (i) => (
        <div className="flex items-center gap-2">
          {i.row.original.isSystem && <Shield className="h-3.5 w-3.5 text-primary-500 shrink-0" title={t('System role')} />}
          <div>
            <p className="font-medium text-gray-900">{i.getValue()}</p>
            <p className="text-xs text-gray-400">{i.row.original.slug}</p>
          </div>
        </div>
      ),
    }),
    col.accessor('description', {
      header: 'Description',
      cell: (i) => <span className="text-sm text-gray-500">{i.getValue() || '—'}</span>,
    }),
    col.accessor('permissions', {
      header: 'Permissions',
      size: 110,
      cell: (i) => <span className="text-sm font-medium">{i.getValue()?.length ?? 0}</span>,
    }),
    col.accessor('userCount', {
      header: 'Users',
      size: 80,
      cell: (i) => <span className="text-sm">{i.getValue() ?? 0}</span>,
    }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('users:write') && (
            <>
              <Link
                to={`/admin/roles/${row.original._id}/edit`}
                className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"
              >
                <Pencil className="h-4 w-4" />
              </Link>
              {!row.original.isSystem && (
                <button
                  onClick={() => setDeleteTarget(row.original)}
                  className="btn-ghost p-1 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        subtitle="Manage permission roles"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Roles' }]}
        actions={
          can('users:write') && (
            <Link to="/admin/roles/new" className="btn-primary">
              <Plus className="h-4 w-4" /> {t('Add Role')}
            </Link>
          )
        }
      />
      <DataTable columns={columns} data={roles} loading={isLoading} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('Delete Role — {name}', { name: deleteTarget?.name })}
        size="sm"
      >
        <div className="space-y-4">
          {deleteTarget?.userCount > 0 ? (
            <p className="text-sm text-red-600">
              {rich(t('Cannot delete: {n} user(s) are assigned this role. Reassign them first.'), { n: <strong>{deleteTarget.userCount}</strong> })}
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              {rich(t('Are you sure you want to delete the {name} role? This cannot be undone.'), { name: <strong>{deleteTarget?.name}</strong> })}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>{t('Cancel')}</button>
            {deleteTarget?.userCount === 0 && (
              <button
                className="btn-danger"
                onClick={() => deleteMut.mutate(deleteTarget._id)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? t('Deleting…') : t('Delete')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RoleList;
