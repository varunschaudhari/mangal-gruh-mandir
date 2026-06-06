import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookTemplate, Plus, Trash2, CreditCard, RefreshCw } from 'lucide-react';
import { getTemplates, deleteTemplate } from '../../api/paymentTemplate.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

export default function PaymentTemplates() {
  const qc = useQueryClient();
  const [deleteModal, setDeleteModal] = useState(null); // template object

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['payment-templates'],
    queryFn:  () => getTemplates(),
    staleTime: 60 * 1000,
  });
  const templates = data?.data?.data || [];

  const deleteMut = useMutation({
    mutationFn: (id) => deleteTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['payment-templates'] });
      setDeleteModal(null);
    },
    onError: () => toast.error('Failed to delete template'),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payment Templates"
        subtitle="Saved payment configs for quick reuse"
        breadcrumbs={[{ label: 'Payments', to: '/payments' }, { label: 'Templates' }]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => refetch()} disabled={isFetching}
              className="btn btn-ghost text-sm flex items-center gap-1.5 border">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <Link to="/payments/new" className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" /> New Payment
            </Link>
          </div>
        }
      />

      {isLoading ? <PageLoader /> : templates.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <BookTemplate className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="font-medium text-gray-600">No templates saved yet</p>
          <p className="text-sm text-gray-400">
            When you submit a new payment, you'll be offered the option to save it as a template.
          </p>
          <Link to="/payments/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" /> Record Payment
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <BookTemplate className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">Saved Templates</h3>
            <span className="text-xs text-gray-400">({templates.length})</span>
          </div>
          <div className="divide-y divide-gray-50">
            {templates.map((tpl) => (
              <div key={tpl._id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
                    <CreditCard className="h-4 w-4 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{tpl.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tpl.supplier?.name || 'Unknown supplier'}
                      {' · '}
                      {PM_LABELS[tpl.paymentMode] || tpl.paymentMode}
                      {tpl.usageCount > 0 && ` · Used ${tpl.usageCount}×`}
                    </p>
                    {tpl.notes && <p className="text-xs text-gray-400 italic truncate mt-0.5">"{tpl.notes}"</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Link
                    to={`/payments/new?supplier=${tpl.supplier?._id || tpl.supplier}`}
                    className="btn-secondary text-xs flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Use
                  </Link>
                  <button
                    onClick={() => setDeleteModal(tpl)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Template" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Delete template <strong>"{deleteModal?.name}"</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteModal(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => deleteMut.mutate(deleteModal._id)}
              disabled={deleteMut.isPending}
              className="btn-danger flex items-center gap-2 text-sm">
              <Trash2 className="h-4 w-4" />
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
