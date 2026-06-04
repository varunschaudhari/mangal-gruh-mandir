import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { getCategories, deleteCategory } from '../../../api/category.api.js';
import DataTable from '../../../components/ui/DataTable.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { ActiveBadge } from '../../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../../components/ui/Modal.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const col = createColumnHelper();

const CategoryList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => getCategories() });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: () => { toast.success('Category deleted'); qc.invalidateQueries({ queryKey: ['categories'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const categories = data?.data?.data || [];

  const columns = [
    col.accessor('code', { header: 'Code', size: 80, cell: (i) => <span className="font-mono text-xs font-bold">{i.getValue()}</span> }),
    col.accessor('name', { header: 'Category Name', cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('parentCategory.name', { header: 'Parent Category', cell: (i) => i.getValue() || <span className="text-gray-400">Root</span> }),
    col.accessor('description', { header: 'Description', cell: (i) => i.getValue() || '—' }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && <Link to={`/masters/categories/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>}
          {can('masters:delete') && <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        subtitle="Product categories and sub-categories"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Categories' }]}
        actions={can('masters:write') && <Link to="/masters/categories/new" className="btn-primary"><Plus className="h-4 w-4" /> Add Category</Link>}
      />
      <DataTable columns={columns} data={categories} loading={isLoading} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Category" message={`Delete "${deleteTarget?.name}"?`} />
    </div>
  );
};

export default CategoryList;
