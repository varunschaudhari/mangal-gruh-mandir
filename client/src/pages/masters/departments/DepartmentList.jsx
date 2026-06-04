import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { getDepartments, deleteDepartment } from '../../../api/department.api.js';
import DataTable from '../../../components/ui/DataTable.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../../components/ui/Modal.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { capitalize } from '../../../utils/formatters.js';
import toast from 'react-hot-toast';

const TYPE_COLORS = { store:'blue', kitchen:'orange', puja:'yellow', flower:'green', distribution:'gray', office:'gray', other:'gray' };
const col = createColumnHelper();

const DepartmentList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteDepartment(id),
    onSuccess: () => { toast.success('Department deleted'); qc.invalidateQueries({ queryKey: ['departments'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const depts = data?.data?.data || [];

  const columns = [
    col.accessor('code', { header: 'Code', size: 80, cell: (i) => <span className="font-mono text-xs font-bold text-gray-600">{i.getValue()}</span> }),
    col.accessor('name', { header: 'Department Name', cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('type', { header: 'Type', size: 120, cell: (i) => <Badge variant={TYPE_COLORS[i.getValue()] || 'gray'}>{capitalize(i.getValue())}</Badge> }),
    col.accessor('description', { header: 'Description', cell: (i) => <span className="text-gray-500">{i.getValue() || '—'}</span> }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && <Link to={`/masters/departments/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>}
          {can('masters:delete') && <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Departments"
        subtitle="Manage godowns and departments"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Departments' }]}
        actions={can('masters:write') && <Link to="/masters/departments/new" className="btn-primary"><Plus className="h-4 w-4" /> Add Department</Link>}
      />
      <DataTable columns={columns} data={depts} loading={isLoading} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Department" message={`Delete "${deleteTarget?.name}"? This cannot be undone.`} />
    </div>
  );
};

export default DepartmentList;
