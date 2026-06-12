import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Download, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { getAuditLogs, exportAuditLogsExcel } from '../../api/auditLog.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fDateTime } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const ACTION_COLORS = {
  'auth.login':          'bg-green-100 text-green-800',
  'auth.login_failed':   'bg-red-100 text-red-800',
  'payment.approve':     'bg-blue-100 text-blue-800',
  'payment.bulk_approve':'bg-blue-100 text-blue-800',
  'payment.reject':      'bg-orange-100 text-orange-800',
  'payment.void':        'bg-red-100 text-red-800',
  'stock.void':          'bg-red-100 text-red-800',
  'donation.void':       'bg-red-100 text-red-800',
  'user.create':         'bg-purple-100 text-purple-800',
  'user.update':         'bg-yellow-100 text-yellow-800',
  'user.password_reset': 'bg-orange-100 text-orange-800',
  'settings.update':     'bg-gray-100 text-gray-800',
  'purchase.create':     'bg-teal-100 text-teal-800',
  'purchase.void':       'bg-red-100 text-red-800',
  'product.create':      'bg-teal-100 text-teal-800',
  'product.update':      'bg-yellow-100 text-yellow-800',
  'product.delete':      'bg-red-100 text-red-800',
  'asset.create':        'bg-purple-100 text-purple-800',
  'asset.update':        'bg-yellow-100 text-yellow-800',
  'asset.delete':        'bg-red-100 text-red-800',
  'mahaprasad.issue':    'bg-green-100 text-green-800',
  'mahaprasad.redeem':   'bg-blue-100 text-blue-800',
};

const ACTION_LABELS = {
  'auth.login':           'Login',
  'auth.login_failed':    'Login Failed',
  'payment.create':       'Payment Created',
  'payment.approve':      'Payment Approved',
  'payment.bulk_approve': 'Bulk Approved',
  'payment.reject':       'Payment Rejected',
  'payment.void':         'Payment Voided',
  'stock.create':         'Stock Entry',
  'stock.void':           'Stock Voided',
  'donation.create':      'Donation Recorded',
  'donation.void':        'Donation Voided',
  'user.create':          'User Created',
  'user.update':          'User Updated',
  'user.password_reset':  'Password Reset',
  'settings.update':      'Settings Updated',
  'purchase.create':      'Purchase Entry Created',
  'purchase.void':        'Purchase Entry Voided',
  'product.create':       'Product Created',
  'product.update':       'Product Updated',
  'product.delete':       'Product Deleted',
  'asset.create':         'Asset Created',
  'asset.update':         'Asset Updated',
  'asset.delete':         'Asset Deleted',
  'mahaprasad.issue':     'Coupon Issued',
  'mahaprasad.redeem':    'Coupon Redeemed',
};

const ENTITIES = ['', 'PurchaseEntry', 'SupplierPayment', 'StockTransaction', 'Donation', 'User', 'Settings', 'Product', 'Asset', 'MahaprasadCoupon'];

const ACTIONS = [
  '', 'auth.login', 'auth.login_failed',
  'purchase.create', 'purchase.void',
  'payment.create', 'payment.approve', 'payment.bulk_approve', 'payment.reject', 'payment.void',
  'stock.create', 'stock.void',
  'donation.create', 'donation.void',
  'user.create', 'user.update', 'user.password_reset',
  'settings.update',
  'product.create', 'product.update', 'product.delete',
  'asset.create', 'asset.update', 'asset.delete',
  'mahaprasad.issue', 'mahaprasad.redeem',
];

function DiffRow({ label, value }) {
  if (value == null) return null;
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 w-36 shrink-0">{label}:</span>
      <span className="font-mono text-gray-800 break-all whitespace-pre-wrap">{display}</span>
    </div>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = log.before || log.after || log.meta;
  const actionClass = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700';

  return (
    <>
      <tr
        className={`border-b hover:bg-gray-50 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded((e) => !e)}
      >
        <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">
          {fDateTime(log.timestamp)}
        </td>
        <td className="py-2 px-3 text-sm">
          <div className="font-medium">{log.user?.name || <span className="text-gray-400 italic">System</span>}</div>
          {log.user?.role && <div className="text-xs text-gray-400">{log.user.role}</div>}
        </td>
        <td className="py-2 px-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionClass}`}>
            {ACTION_LABELS[log.action] || log.action}
          </span>
        </td>
        <td className="py-2 px-3 text-sm text-gray-700">{log.entity}</td>
        <td className="py-2 px-3 text-sm font-mono text-gray-600">{log.entityId || '—'}</td>
        <td className="py-2 px-3 text-xs text-gray-400">{log.ip || '—'}</td>
        <td className="py-2 px-3 text-center">
          {hasDetails && (
            expanded
              ? <ChevronDown size={14} className="text-gray-400 mx-auto" />
              : <ChevronRight size={14} className="text-gray-400 mx-auto" />
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 pb-3 pt-1">
            <div className="border rounded bg-white p-3 space-y-1">
              {log.before && (
                <div>
                  <div className="text-xs font-semibold text-orange-600 mb-1">Before</div>
                  {Object.entries(log.before).map(([k, v]) => <DiffRow key={k} label={k} value={v} />)}
                </div>
              )}
              {log.after && (
                <div className={log.before ? 'mt-2' : ''}>
                  <div className="text-xs font-semibold text-green-600 mb-1">After</div>
                  {Object.entries(log.after).map(([k, v]) => <DiffRow key={k} label={k} value={v} />)}
                </div>
              )}
              {log.meta && (
                <div className={log.before || log.after ? 'mt-2' : ''}>
                  <div className="text-xs font-semibold text-blue-600 mb-1">Details</div>
                  {Object.entries(log.meta).map(([k, v]) => <DiffRow key={k} label={k} value={v} />)}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const AuditLog = () => {
  const [filters, setFilters] = useState({ page: 1, limit: 50, dateFrom: '', dateTo: '', entity: '', action: '', search: '' });
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))),
    keepPreviousData: true,
  });

  const logs = data?.data?.logs || [];
  const pagination = data?.data?.pagination || {};

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: key !== 'page' ? 1 : value }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== '' && !['page', 'limit', 'search'].includes(k)));
      const res = await exportAuditLogsExcel(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Complete activity trail for all system actions"
        icon={<Shield size={22} />}
        actions={
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={15} />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        }
      />

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="relative col-span-2">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user, action, entity ID…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className="pl-8 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => set('dateFrom', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => set('dateTo', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={filters.entity}
          onChange={(e) => set('entity', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {ENTITIES.map((e) => <option key={e} value={e}>{e || 'All Entities'}</option>)}
        </select>
        <select
          value={filters.action}
          onChange={(e) => set('action', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {ACTIONS.map((a) => <option key={a} value={a}>{a ? (ACTION_LABELS[a] || a) : 'All Actions'}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Ref</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
              <th className="py-3 px-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">No audit log entries found</td></tr>
            ) : (
              logs.map((log) => <LogRow key={log._id} log={log} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Showing {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={filters.page <= 1}
              onClick={() => set('page', filters.page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={filters.page >= pagination.totalPages}
              onClick={() => set('page', filters.page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
