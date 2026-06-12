import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, IndianRupee, History, Handshake, QrCode } from 'lucide-react';
import { getAssets, deleteAsset } from '../../api/asset.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import AssetLabelModal from '../../components/assets/AssetLabelModal.jsx';
import toast from 'react-hot-toast';

const CATEGORY_COLORS = {
  Electronics: 'blue', Utensils: 'orange', Furniture: 'yellow',
  Mandap: 'green', Vessels: 'gray', Decoration: 'purple', Other: 'gray',
};

const col = createColumnHelper();

const AssetList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [labelAsset,   setLabelAsset]     = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['assets'], queryFn: () => getAssets() });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteAsset(id),
    onSuccess: () => { toast.success('Asset deleted'); qc.invalidateQueries({ queryKey: ['assets'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const assets = data?.data?.data || [];

  const columns = [
    col.accessor('assetCode', {
      header: 'Code', size: 120,
      cell: (i) => i.getValue()
        ? <Link to={`/assets/${i.row.original._id}/history`} className="font-mono text-xs font-bold text-orange-600 hover:underline">{i.getValue()}</Link>
        : <span className="text-gray-300 text-xs">—</span>,
    }),
    col.accessor('name', {
      header: 'Asset Name',
      cell: (i) => (
        <Link to={`/assets/${i.row.original._id}/history`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline">
          {i.getValue()}
        </Link>
      ),
    }),
    col.accessor('category', { header: 'Category', size: 120, cell: (i) => <Badge variant={CATEGORY_COLORS[i.getValue()] || 'gray'}>{i.getValue()}</Badge> }),
    col.accessor('totalQuantity', { header: 'Total Qty', size: 90, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
    col.accessor('finePerDay', {
      header: 'Fine / Day', size: 110,
      cell: (i) => i.getValue() > 0
        ? <span className="flex items-center gap-0.5 text-red-600 font-medium"><IndianRupee className="h-3 w-3" />{i.getValue()}</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('isBorrowable', {
      header: 'Borrowable', size: 100,
      cell: (i) => i.getValue()
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5"><Handshake className="h-3 w-3" />Yes</span>
        : <span className="text-xs text-gray-400">No</span>,
    }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 120,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setLabelAsset(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-orange-600" title="Print unit labels"><QrCode className="h-4 w-4" /></button>
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
        actions={can('assets:write') && <Link to="/assets/new" className="btn-primary flex items-center gap-2"><Plus className="h-4 w-4" /> Add Asset</Link>}
      />
      <DataTable columns={columns} data={assets} loading={isLoading} />
      <ConfirmModal
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Asset"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
      />
      {labelAsset && <AssetLabelModal asset={labelAsset} onClose={() => setLabelAsset(null)} />}
    </div>
  );
};

export default AssetList;
