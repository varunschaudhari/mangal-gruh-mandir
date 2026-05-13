import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTransactions, voidTransaction } from '../../api/stockTransaction.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer',
  WASTAGE: 'Wastage',
  OPENING_BALANCE: 'Opening',
  ADJUSTMENT: 'Adjustment',
};

const TYPE_VARIANTS = {
  STOCK_IN: 'success',
  STOCK_OUT: 'warning',
  TRANSFER: 'info',
  WASTAGE: 'danger',
  OPENING_BALANCE: 'default',
  ADJUSTMENT: 'default',
};

const TYPES = ['', 'STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE'];

const TransactionHistory = () => {
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [filters, setFilters] = useState({ transactionType: '', department: '', startDate: null, endDate: null });
  const [page, setPage] = useState(1);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const params = {
    page,
    limit: 20,
    ...(filters.transactionType && { transactionType: filters.transactionType }),
    ...(filters.department && { department: filters.department }),
    ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
    ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => getTransactions(params),
    placeholderData: (prev) => prev,
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }) => voidTransaction(id, reason),
    onSuccess: () => {
      toast.success('Transaction voided');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to void'),
  });

  const txns = data?.data?.data?.transactions || [];
  const pagination = data?.data?.data?.pagination;

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  return (
    <div>
      <PageHeader title="Transaction History" breadcrumbs={[{ label: 'Transactions' }, { label: 'History' }]} />

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Type</label>
          <select value={filters.transactionType} onChange={(e) => setFilter('transactionType', e.target.value)} className="input text-sm">
            <option value="">All Types</option>
            {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Department</label>
          <select value={filters.department} onChange={(e) => setFilter('department', e.target.value)} className="input text-sm">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From Date</label>
          <DatePicker
            selected={filters.startDate}
            onChange={(d) => setFilter('startDate', d)}
            dateFormat="dd/MM/yyyy"
            placeholderText="Start date"
            className="input text-sm"
            maxDate={filters.endDate || new Date()}
          />
        </div>
        <div>
          <label className="label">To Date</label>
          <DatePicker
            selected={filters.endDate}
            onChange={(d) => setFilter('endDate', d)}
            dateFormat="dd/MM/yyyy"
            placeholderText="End date"
            className="input text-sm"
            maxDate={new Date()}
            minDate={filters.startDate}
          />
        </div>
        {(filters.transactionType || filters.department || filters.startDate || filters.endDate) && (
          <button
            onClick={() => { setFilters({ transactionType: '', department: '', startDate: null, endDate: null }); setPage(1); }}
            className="btn btn-ghost text-sm"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <PageLoader />
        ) : txns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No transactions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="table-th">TXN #</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Product</th>
                  <th className="table-th">From</th>
                  <th className="table-th">To</th>
                  <th className="table-th text-right">Qty</th>
                  <th className="table-th">By</th>
                  <th className="table-th">Status</th>
                  {can('transactions:delete') && <th className="table-th" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txns.map((t) => (
                  <tr key={t._id} className={`hover:bg-gray-50 ${t.isVoided ? 'opacity-50' : ''}`}>
                    <td className="table-td font-mono text-xs">{t.transactionNumber}</td>
                    <td className="table-td text-sm">{fDate(t.transactionDate)}</td>
                    <td className="table-td">
                      <Badge variant={TYPE_VARIANTS[t.transactionType]} size="sm">{TYPE_LABELS[t.transactionType]}</Badge>
                    </td>
                    <td className="table-td">
                      <div className="text-sm font-medium">{t.product?.name}</div>
                      <div className="text-xs text-gray-400">{t.product?.code}</div>
                    </td>
                    <td className="table-td text-sm">{t.fromDepartment?.name || '—'}</td>
                    <td className="table-td text-sm">{t.toDepartment?.name || '—'}</td>
                    <td className="table-td text-right text-sm font-medium">
                      {t.quantity} <span className="text-gray-400 text-xs">{t.unit?.symbol}</span>
                    </td>
                    <td className="table-td text-sm">{t.createdBy?.name}</td>
                    <td className="table-td">
                      {t.isVoided
                        ? <Badge variant="danger" size="sm">Voided</Badge>
                        : <Badge variant="success" size="sm">Active</Badge>
                      }
                    </td>
                    {can('transactions:delete') && (
                      <td className="table-td">
                        {!t.isVoided && (
                          <button
                            onClick={() => setVoidTarget(t)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
            <span>{pagination.total} transactions</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost disabled:opacity-40">Prev</button>
              <span className="px-2 py-1">{page} / {pagination.totalPages}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Void modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Void Transaction</h3>
            <p className="text-sm text-gray-500 mb-4">
              Voiding <span className="font-mono font-medium">{voidTarget.transactionNumber}</span> will reverse its effect on stock balance.
            </p>
            <label className="label">Reason for Voiding *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="input mb-4"
              rows={2}
              placeholder="Enter reason…"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setVoidTarget(null); setVoidReason(''); }} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => voidMutation.mutate({ id: voidTarget._id, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="btn btn-danger"
              >
                {voidMutation.isPending ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
