import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { getSuppliers, deleteSupplier } from '../../../api/supplier.api.js';
import DataTable from '../../../components/ui/DataTable.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../../components/ui/Modal.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { capitalize } from '../../../utils/formatters.js';
import toast from 'react-hot-toast';

const TYPE_COLORS = { vendor: 'blue', donor: 'green', both: 'orange' };
const col = createColumnHelper();

const SupplierList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['suppliers', search], queryFn: () => getSuppliers({ search }) });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteSupplier(id),
    onSuccess: () => { toast.success('Supplier deleted'); qc.invalidateQueries({ queryKey: ['suppliers'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const suppliers = data?.data?.data || [];

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('type', { header: 'Type', size: 90, cell: (i) => <Badge variant={TYPE_COLORS[i.getValue()]}>{capitalize(i.getValue())}</Badge> }),
    col.accessor('contactPerson', { header: 'Contact Person', cell: (i) => i.getValue() || '—' }),
    col.accessor('phone', { header: 'Phone', cell: (i) => i.getValue() || '—' }),
    col.accessor('city', { header: 'City', cell: (i) => i.getValue() || '—' }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && <Link to={`/masters/suppliers/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></Link>}
          {can('masters:delete') && <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers & Donors"
        subtitle="Vendors who supply goods and donors who donate"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Suppliers' }]}
        actions={can('masters:write') && <Link to="/masters/suppliers/new" className="btn-primary"><Plus className="h-4 w-4" /> Add Supplier</Link>}
      />
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
      </div>
      <DataTable columns={columns} data={suppliers} loading={isLoading} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Supplier" message={`Delete "${deleteTarget?.name}"?`} />
    </div>
  );
};

export default SupplierList;
