import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { getProducts, deleteProduct } from '../../../api/product.api.js';
import DataTable from '../../../components/ui/DataTable.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { ActiveBadge } from '../../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../../components/ui/Modal.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const col = createColumnHelper();

const ProductList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => getProducts({ search, active: undefined }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteProduct(id),
    onSuccess: () => {
      toast.success('Product deleted');
      qc.invalidateQueries({ queryKey: ['products'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const products = data?.data?.data || [];

  const columns = [
    col.accessor('code', {
      header: 'Code',
      size: 100,
      cell: (i) => <span className="font-mono text-xs text-gray-500">{i.getValue()}</span>,
    }),
    col.accessor('name', {
      header: 'Product Name',
      cell: (i) => (
        <div>
          <p className="font-medium text-gray-900">{i.getValue()}</p>
          {i.row.original.aliases?.length > 0 && (
            <p className="text-xs text-gray-400">{i.row.original.aliases.join(', ')}</p>
          )}
        </div>
      ),
    }),
    col.accessor('category.name', { header: 'Category', size: 130 }),
    col.accessor('unit.symbol', { header: 'Unit', size: 70 }),
    col.accessor('minStockLevel', { header: 'Min Stock', size: 90 }),
    col.accessor('isPujaItem', {
      header: 'Puja Item',
      size: 90,
      cell: (i) => i.getValue() ? <span className="text-xs text-orange-600 font-medium">Yes</span> : <span className="text-xs text-gray-400">No</span>,
    }),
    col.accessor('isActive', {
      header: 'Status',
      size: 80,
      cell: (i) => <ActiveBadge isActive={i.getValue()} />,
    }),
    col.display({
      id: 'actions',
      header: 'Actions',
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {can('masters:write') && (
            <Link to={`/masters/products/${row.original._id}/edit`} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600">
              <Pencil className="h-4 w-4" />
            </Link>
          )}
          {can('masters:delete') && (
            <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        subtitle="Manage all temple inventory items"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Products' }]}
        actions={
          can('masters:write') && (
            <Link to="/masters/products/new" className="btn-primary">
              <Plus className="h-4 w-4" /> Add Product
            </Link>
          )
        }
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      <DataTable columns={columns} data={products} loading={isLoading} />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
      />
    </div>
  );
};

export default ProductList;
