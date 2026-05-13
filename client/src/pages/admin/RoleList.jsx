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

const col = createColumnHelper();

const RoleList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['roles'], queryFn: getRoles });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteRole(id),
    onSuccess: () => { toast.success('Role deleted'); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  });

  const roles = data?.data?.data || [];

  const columns = [
    col.accessor('name', {
      header: 'Role',
      cell: (i) => (
        <div className="flex items-center gap-2">
          {i.row.original.isSystem && <Shield className="h-3.5 w-3.5 text-primary-500 shrink-0" title="System role" />}
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
              <Plus className="h-4 w-4" /> Add Role
            </Link>
          )
        }
      />
      <DataTable columns={columns} data={roles} loading={isLoading} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete Role — ${deleteTarget?.name}`}
        size="sm"
      >
        <div className="space-y-4">
          {deleteTarget?.userCount > 0 ? (
            <p className="text-sm text-red-600">
              Cannot delete: <strong>{deleteTarget.userCount}</strong> user(s) are assigned this role. Reassign them first.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Are you sure you want to delete the <strong>{deleteTarget?.name}</strong> role? This cannot be undone.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            {deleteTarget?.userCount === 0 && (
              <button
                className="btn-danger"
                onClick={() => deleteMut.mutate(deleteTarget._id)}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RoleList;
