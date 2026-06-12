import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { getOccasions, createOccasion, updateOccasion, deleteOccasion } from '../../api/mahaprasadOccasion.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { ActiveBadge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const col = createColumnHelper();

const OccasionForm = ({ initial, onSave, onClose, loading }) => {
  const [name,      setName]      = useState(initial?.name      || '');
  const [notes,     setNotes]     = useState(initial?.notes     || '');
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive,  setIsActive]  = useState(initial?.isActive !== false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Name <span className="text-red-400">*</span>
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Ekadashi" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Optional description" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Sort Order</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="input" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={() => onSave({ name, notes, sortOrder, isActive })} disabled={loading || !name.trim()} className="btn-primary">
          {loading ? 'Saving…' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
};

export default function MahaprasadOccasionList() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [editTarget,   setEditTarget]   = useState(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mahaprasad-occasions-admin'],
    queryFn:  () => getOccasions({}),
  });
  const occasions = data?.data?.data || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mahaprasad-occasions'] });
    qc.invalidateQueries({ queryKey: ['mahaprasad-occasions-admin'] });
  };

  const createMut = useMutation({
    mutationFn: createOccasion,
    onSuccess: () => { toast.success('Occasion created'); invalidate(); setShowCreate(false); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateOccasion(id, data),
    onSuccess: () => { toast.success('Occasion updated'); invalidate(); setEditTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteOccasion(id),
    onSuccess: () => { toast.success('Occasion deleted'); invalidate(); setDeleteTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const columns = [
    col.accessor('name',      { header: 'Occasion Name', cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('notes',     { header: 'Notes',         cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span> }),
    col.accessor('sortOrder', { header: 'Order', size: 80 }),
    col.accessor('isActive',  { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && (
            <button onClick={() => setEditTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600">
              <Pencil className="h-4 w-4" />
            </button>
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
        title="Mahaprasad Occasions"
        subtitle="Preset occasion names for free coupon distribution"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Occasions' }]}
        actions={can('masters:write') && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Occasion
          </button>
        )}
      />

      <DataTable columns={columns} data={occasions} loading={isLoading} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Occasion" size="sm">
        <OccasionForm onSave={(d) => createMut.mutate(d)} onClose={() => setShowCreate(false)} loading={createMut.isPending} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Occasion" size="sm">
        {editTarget && (
          <OccasionForm initial={editTarget}
            onSave={(d) => updateMut.mutate({ id: editTarget._id, data: d })}
            onClose={() => setEditTarget(null)}
            loading={updateMut.isPending} />
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        title="Delete Occasion"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`} />
    </div>
  );
}
