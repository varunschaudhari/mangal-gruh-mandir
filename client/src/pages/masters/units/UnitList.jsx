import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { getUnits, createUnit, updateUnit, deleteUnit } from '../../../api/unit.api.js';
import DataTable from '../../../components/ui/DataTable.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Badge, { ActiveBadge } from '../../../components/ui/Badge.jsx';
import Modal, { ConfirmModal } from '../../../components/ui/Modal.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { capitalize } from '../../../utils/formatters.js';
import { useForm } from 'react-hook-form';
import { FormField, FormRow, FormActions } from '../../../components/ui/FormField.jsx';
import toast from 'react-hot-toast';

const TYPE_COLORS = { weight:'blue', volume:'green', count:'orange', other:'gray' };
const col = createColumnHelper();

const UnitList = () => {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['units'], queryFn: () => getUnits() });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { type: 'count', isActive: true } });

  const openEdit = (unit) => { setEditTarget(unit); reset(unit); setModalOpen(true); };
  const openNew = () => { setEditTarget(null); reset({ type: 'count', isActive: true }); setModalOpen(true); };

  const saveMut = useMutation({
    mutationFn: (data) => editTarget ? updateUnit(editTarget._id, data) : createUnit(data),
    onSuccess: () => { toast.success(editTarget ? 'Unit updated' : 'Unit created'); qc.invalidateQueries({ queryKey: ['units'] }); setModalOpen(false); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteUnit(id),
    onSuccess: () => { toast.success('Unit deleted'); qc.invalidateQueries({ queryKey: ['units'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const units = data?.data?.data || [];

  const columns = [
    col.accessor('name', { header: 'Unit Name', cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    col.accessor('symbol', { header: 'Symbol', size: 80, cell: (i) => <span className="font-mono text-sm font-bold text-gray-600">{i.getValue()}</span> }),
    col.accessor('type', { header: 'Type', size: 100, cell: (i) => <Badge variant={TYPE_COLORS[i.getValue()]}>{capitalize(i.getValue())}</Badge> }),
    col.accessor('isActive', { header: 'Status', size: 80, cell: (i) => <ActiveBadge isActive={i.getValue()} /> }),
    col.display({
      id: 'actions', header: 'Actions', size: 90,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {can('masters:write') && <button onClick={() => openEdit(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>}
          {can('masters:delete') && <button onClick={() => setDeleteTarget(row.original)} className="btn-ghost p-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Units of Measurement" subtitle="kg, L, pcs, etc." breadcrumbs={[{ label: 'Masters' }, { label: 'Units' }]}
        actions={can('masters:write') && <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Add Unit</button>}
      />
      <DataTable columns={columns} data={units} loading={isLoading} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Unit' : 'New Unit'} size="sm">
        <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-4">
          <FormRow>
            <FormField label="Name" required error={errors.name?.message}>
              <input {...register('name', { required: true })} className="input" placeholder="e.g. Kilogram" />
            </FormField>
            <FormField label="Symbol" required error={errors.symbol?.message}>
              <input {...register('symbol', { required: true })} className="input" placeholder="e.g. kg" />
            </FormField>
          </FormRow>
          <FormField label="Type">
            <select {...register('type')} className="input">
              {['weight','volume','count','other'].map((t) => <option key={t} value={t}>{capitalize(t)}</option>)}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> Active
          </label>
          <FormActions onCancel={() => setModalOpen(false)} loading={saveMut.isPending} submitLabel={editTarget ? 'Update' : 'Create'} />
        </form>
      </Modal>

      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending} title="Delete Unit" message={`Delete "${deleteTarget?.name}"?`} />
    </div>
  );
};

export default UnitList;
