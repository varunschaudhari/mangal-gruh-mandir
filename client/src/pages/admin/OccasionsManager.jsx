import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Heart, Utensils } from 'lucide-react';
import {
  getOccasions as getDonationOccasions,
  createOccasion as createDonationOccasion,
  updateOccasion as updateDonationOccasion,
  deleteOccasion as deleteDonationOccasion,
} from '../../api/donationOccasion.api.js';
import {
  getOccasions as getMahaprasadOccasions,
  createOccasion as createMahaprasadOccasion,
  updateOccasion as updateMahaprasadOccasion,
  deleteOccasion as deleteMahaprasadOccasion,
} from '../../api/mahaprasadOccasion.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { ActiveBadge } from '../../components/ui/Badge.jsx';
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const col = createColumnHelper();

// ── Shared form ────────────────────────────────────────────────────────────────

const OccasionForm = ({ initial, onSave, onClose, loading }) => {
  const [name,      setName]      = useState(initial?.name      || '');
  const [notes,     setNotes]     = useState(initial?.notes     || '');
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive,  setIsActive]  = useState(initial?.isActive  !== false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Name <span className="text-red-400">*</span>
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Ram Navami" />
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
        <button
          onClick={() => onSave({ name, notes, sortOrder, isActive })}
          disabled={loading || !name.trim()}
          className="btn-primary">
          {loading ? 'Saving…' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
};

// ── Reusable section (one per tab) ─────────────────────────────────────────────

const OccasionSection = ({ queryKey, getFn, createFn, updateFn, deleteFn }) => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [showCreate,   setShowCreate]   = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => getFn({}) });
  const occasions = data?.data?.data || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const createMut = useMutation({
    mutationFn: createFn,
    onSuccess: () => { toast.success('Occasion created'); invalidate(); setShowCreate(false); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateFn(id, data),
    onSuccess: () => { toast.success('Occasion updated'); invalidate(); setEditTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteFn(id),
    onSuccess: () => { toast.success('Occasion deleted'); invalidate(); setDeleteTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const columns = [
    col.accessor('name',      { header: 'Name',      cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
    col.accessor('notes',     { header: 'Notes',     cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span> }),
    col.accessor('sortOrder', { header: 'Order',     size: 80 }),
    col.accessor('isActive',  { header: 'Status',    size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 100,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && (
            <button onClick={() => setEditTarget(row.original)}
              className="btn-ghost p-1 text-gray-400 hover:text-indigo-600" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {can('masters:delete') && (
            <button onClick={() => setDeleteTarget(row.original)}
              className="btn-ghost p-1 text-gray-400 hover:text-red-600" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    }),
  ];

  return (
    <>
      {can('masters:write') && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> Add Occasion
          </button>
        </div>
      )}

      <DataTable columns={columns} data={occasions} loading={isLoading} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Occasion" size="sm">
        <OccasionForm
          onSave={(d) => createMut.mutate(d)}
          onClose={() => setShowCreate(false)}
          loading={createMut.isPending} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Occasion" size="sm">
        {editTarget && (
          <OccasionForm
            initial={editTarget}
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
    </>
  );
};

// ── Tab config ─────────────────────────────────────────────────────────────────

const TABS = [
  {
    key:    'donation',
    label:  'Donation Occasions',
    icon:   Heart,
    desc:   'Purposes and occasions for donation entries',
    color:  'text-red-600 border-red-400',
    queryKey: 'donation-occasions-admin',
    getFn:    getDonationOccasions,
    createFn: createDonationOccasion,
    updateFn: updateDonationOccasion,
    deleteFn: deleteDonationOccasion,
  },
  {
    key:    'mahaprasad',
    label:  'Mahaprasad Occasions',
    icon:   Utensils,
    desc:   'Preset occasion names for free coupon distribution',
    color:  'text-orange-600 border-orange-400',
    queryKey: 'mahaprasad-occasions-admin',
    getFn:    getMahaprasadOccasions,
    createFn: createMahaprasadOccasion,
    updateFn: updateMahaprasadOccasion,
    deleteFn: deleteMahaprasadOccasion,
  },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OccasionsManager() {
  const [active, setActive] = useState('donation');
  const tab = TABS.find((t) => t.key === active);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Occasions"
        subtitle="Manage occasion presets for donations and Mahaprasad"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Occasions' }]}
      />

      {/* Tabs */}
      <div className="card p-1 flex gap-1 max-w-sm">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              active === key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="h-4 w-4" /> {label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Active section description */}
      <p className="text-sm text-gray-500">{tab.desc}</p>

      {/* Section content */}
      <OccasionSection
        key={tab.key}
        queryKey={tab.queryKey}
        getFn={tab.getFn}
        createFn={tab.createFn}
        updateFn={tab.updateFn}
        deleteFn={tab.deleteFn}
      />
    </div>
  );
}
