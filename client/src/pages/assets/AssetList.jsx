import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, IndianRupee, History } from 'lucide-react';
import { getAssets, deleteAsset } from '../../api/asset.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const CATEGORY_COLORS = {
  Electronics: 'blue', Utensils: 'orange', Furniture: 'yellow',
  Mandap: 'green', Vessels: 'gray', Decoration: 'purple', Other: 'gray',
};

const col = createColumnHelper();

const AssetList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['assets'], queryFn: () => getAssets() });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteAsset(id),
    onSuccess: () => { toast.success('Asset deleted'); qc.invalidateQueries({ queryKey: ['assets'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const assets = data?.data?.data || [];

  const columns = [
    col.accessor('name', { header: 'Asset Name', cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('category', { header: 'Category', size: 120, cell: (i) => <Badge variant={CATEGORY_COLORS[i.getValue()] || 'gray'}>{i.getValue()}</Badge> }),
    col.accessor('totalQuantity', { header: 'Total Qty', size: 90, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
    col.accessor('finePerDay', {
      header: 'Fine / Day', size: 110,
      cell: (i) => i.getValue() > 0
        ? <span className="flex items-center gap-0.5 text-red-600 font-medium"><IndianRupee className="h-3 w-3" />{i.getValue()}</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('description', { header: 'Description', cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span> }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link to={`/assets/${row.original._id}/history`} className="btn-ghost p-1 text-gray-400 hover:text-purple-600" title="View borrow history"><History className="h-4 w-4" /></Link>
          {can('assets:write') && <Link to={`/assets/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>}
          {can('assets:write') && <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assets"
        subtitle="Temple assets available for borrowing"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Asset List' }]}
        actions={can('assets:write') && <Link to="/assets/new" className="btn-primary"><Plus className="h-4 w-4" /> Add Asset</Link>}
      />
      <DataTable columns={columns} data={assets} loading={isLoading} />
      <ConfirmModal
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Asset"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
      />
    </div>
  );
};

export default AssetList;
