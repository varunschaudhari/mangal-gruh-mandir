import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, Download, ChevronDown, ChevronRight, Search, ExternalLink, X } from 'lucide-react';
import { getAuditLogs, exportAuditLogsExcel } from '../../api/auditLog.api.js';
import { getUsers } from '../../api/user.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fDateTime } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

// ── Date shortcut helpers ─────────────────────────────────────────────────────

const isoDate = (d) => d.toISOString().split('T')[0];

const DATE_SHORTCUTS = [
  { label: 'Today',      get: () => { const t = isoDate(new Date()); return { dateFrom: t, dateTo: t }; } },
  { label: 'Yesterday',  get: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = isoDate(d); return { dateFrom: t, dateTo: t }; } },
  { label: 'This Week',  get: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { dateFrom: isoDate(mon), dateTo: isoDate(now) }; } },
  { label: 'This Month', get: () => { const now = new Date(); return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: isoDate(now) }; } },
  { label: 'Last Month', get: () => { const now = new Date(); return { dateFrom: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dateTo: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) }; } },
];

// ── Action metadata ────────────────────────────────────────────────────────────

const ACTION_COLORS = {
  'auth.login':                    'bg-green-100 text-green-800',
  'auth.logout':                   'bg-gray-100 text-gray-700',
  'auth.login_failed':             'bg-red-100 text-red-800',
  'auth.profile_update':           'bg-yellow-100 text-yellow-800',
  'auth.password_change':          'bg-orange-100 text-orange-800',
  'budget.upsert':                 'bg-indigo-100 text-indigo-800',
  'expense.create':                'bg-orange-100 text-orange-800',
  'expense.approve':               'bg-green-100 text-green-800',
  'expense.reject':                'bg-red-100 text-red-800',
  'expense.void':                  'bg-red-100 text-red-800',
  'purchase.create':               'bg-teal-100 text-teal-800',
  'purchase.void':                 'bg-red-100 text-red-800',
  'payment.create':                'bg-teal-100 text-teal-800',
  'payment.approve':               'bg-blue-100 text-blue-800',
  'payment.bulk_approve':          'bg-blue-100 text-blue-800',
  'payment.reject':                'bg-orange-100 text-orange-800',
  'payment.void':                  'bg-red-100 text-red-800',
  'stock.create':                  'bg-teal-100 text-teal-800',
  'stock.void':                    'bg-red-100 text-red-800',
  'donation.create':               'bg-pink-100 text-pink-800',
  'donation.void':                 'bg-red-100 text-red-800',
  'user.create':                   'bg-purple-100 text-purple-800',
  'user.update':                   'bg-yellow-100 text-yellow-800',
  'user.password_reset':           'bg-orange-100 text-orange-800',
  'role.create':                   'bg-purple-100 text-purple-800',
  'role.update':                   'bg-yellow-100 text-yellow-800',
  'role.delete':                   'bg-red-100 text-red-800',
  'settings.update':               'bg-gray-100 text-gray-800',
  'product.create':                'bg-teal-100 text-teal-800',
  'product.update':                'bg-yellow-100 text-yellow-800',
  'product.delete':                'bg-red-100 text-red-800',
  'category.create':               'bg-teal-100 text-teal-800',
  'category.update':               'bg-yellow-100 text-yellow-800',
  'category.delete':               'bg-red-100 text-red-800',
  'department.create':             'bg-teal-100 text-teal-800',
  'department.update':             'bg-yellow-100 text-yellow-800',
  'department.delete':             'bg-red-100 text-red-800',
  'unit.create':                   'bg-teal-100 text-teal-800',
  'unit.update':                   'bg-yellow-100 text-yellow-800',
  'unit.delete':                   'bg-red-100 text-red-800',
  'supplier.create':               'bg-teal-100 text-teal-800',
  'supplier.update':               'bg-yellow-100 text-yellow-800',
  'supplier.delete':               'bg-red-100 text-red-800',
  'donation_occasion.create':      'bg-pink-100 text-pink-800',
  'donation_occasion.update':      'bg-yellow-100 text-yellow-800',
  'donation_occasion.delete':      'bg-red-100 text-red-800',
  'mahaprasad_occasion.create':    'bg-green-100 text-green-800',
  'mahaprasad_occasion.update':    'bg-yellow-100 text-yellow-800',
  'mahaprasad_occasion.delete':    'bg-red-100 text-red-800',
  'template.create':               'bg-teal-100 text-teal-800',
  'template.delete':               'bg-red-100 text-red-800',
  'asset.create':                  'bg-purple-100 text-purple-800',
  'asset.update':                  'bg-yellow-100 text-yellow-800',
  'asset.delete':                  'bg-red-100 text-red-800',
  'asset.borrow':                  'bg-blue-100 text-blue-800',
  'asset.checkout':                'bg-teal-100 text-teal-800',
  'asset.return':                  'bg-green-100 text-green-800',
  'asset.extend':                  'bg-indigo-100 text-indigo-800',
  'asset.cancel':                  'bg-orange-100 text-orange-800',
  'asset.lost':                    'bg-red-100 text-red-800',
  'asset.fine_settle':             'bg-yellow-100 text-yellow-800',
  'asset.damage_update':           'bg-orange-100 text-orange-800',
  'asset.group_borrow':            'bg-blue-100 text-blue-800',
  'asset.group_checkout':          'bg-teal-100 text-teal-800',
  'asset.group_extend':            'bg-indigo-100 text-indigo-800',
  'asset.group_cancel':            'bg-orange-100 text-orange-800',
  'mahaprasad.issue':              'bg-green-100 text-green-800',
  'mahaprasad.redeem':             'bg-blue-100 text-blue-800',
  'mahaprasad.offline_reserve':    'bg-gray-100 text-gray-700',
  'mahaprasad.offline_sync':       'bg-blue-100 text-blue-800',
  'expense.receipt_upload':        'bg-yellow-100 text-yellow-800',
  'expense.receipt_remove':        'bg-red-100 text-red-800',
  'stock.batch_create':            'bg-teal-100 text-teal-800',
  'asset.unit_update':             'bg-yellow-100 text-yellow-800',
};

const ACTION_LABELS = {
  'auth.login':                    'Login',
  'auth.logout':                   'Logout',
  'auth.login_failed':             'Login Failed',
  'auth.profile_update':           'Profile Updated',
  'auth.password_change':          'Password Changed',
  'budget.upsert':                 'Budget Updated',
  'expense.create':                'Expense Created',
  'expense.approve':               'Expense Approved',
  'expense.reject':                'Expense Rejected',
  'expense.void':                  'Expense Voided',
  'purchase.create':               'Purchase Created',
  'purchase.void':                 'Purchase Voided',
  'payment.create':                'Payment Created',
  'payment.approve':               'Payment Approved',
  'payment.bulk_approve':          'Bulk Approved',
  'payment.reject':                'Payment Rejected',
  'payment.void':                  'Payment Voided',
  'stock.create':                  'Stock Entry',
  'stock.void':                    'Stock Voided',
  'donation.create':               'Donation Recorded',
  'donation.void':                 'Donation Voided',
  'user.create':                   'User Created',
  'user.update':                   'User Updated',
  'user.password_reset':           'Password Reset',
  'role.create':                   'Role Created',
  'role.update':                   'Role Updated',
  'role.delete':                   'Role Deleted',
  'settings.update':               'Settings Updated',
  'product.create':                'Product Created',
  'product.update':                'Product Updated',
  'product.delete':                'Product Deleted',
  'category.create':               'Category Created',
  'category.update':               'Category Updated',
  'category.delete':               'Category Deleted',
  'department.create':             'Department Created',
  'department.update':             'Department Updated',
  'department.delete':             'Department Deleted',
  'unit.create':                   'Unit Created',
  'unit.update':                   'Unit Updated',
  'unit.delete':                   'Unit Deleted',
  'supplier.create':               'Supplier Created',
  'supplier.update':               'Supplier Updated',
  'supplier.delete':               'Supplier Deleted',
  'donation_occasion.create':      'Occasion Created',
  'donation_occasion.update':      'Occasion Updated',
  'donation_occasion.delete':      'Occasion Deleted',
  'mahaprasad_occasion.create':    'Occasion Created',
  'mahaprasad_occasion.update':    'Occasion Updated',
  'mahaprasad_occasion.delete':    'Occasion Deleted',
  'template.create':               'Template Created',
  'template.delete':               'Template Deleted',
  'asset.create':                  'Asset Created',
  'asset.update':                  'Asset Updated',
  'asset.delete':                  'Asset Deleted',
  'asset.borrow':                  'Borrow Request',
  'asset.checkout':                'Asset Checked Out',
  'asset.return':                  'Asset Returned',
  'asset.extend':                  'Borrow Extended',
  'asset.cancel':                  'Borrow Cancelled',
  'asset.lost':                    'Marked Lost',
  'asset.fine_settle':             'Fine Settled',
  'asset.damage_update':           'Damage Updated',
  'asset.group_borrow':            'Group Borrow',
  'asset.group_checkout':          'Group Checkout',
  'asset.group_extend':            'Group Extended',
  'asset.group_cancel':            'Group Cancelled',
  'mahaprasad.issue':              'Coupon Issued',
  'mahaprasad.redeem':             'Coupon Redeemed',
  'mahaprasad.offline_reserve':    'Offline Reserved',
  'mahaprasad.offline_sync':       'Offline Synced',
  'expense.receipt_upload':        'Receipt Uploaded',
  'expense.receipt_remove':        'Receipt Removed',
  'stock.batch_create':            'Batch Stock In',
  'asset.unit_update':             'Unit Condition Updated',
};

// Grouped for the action <optgroup> select
const ACTION_GROUPS = [
  { label: 'Auth',              actions: ['auth.login', 'auth.logout', 'auth.login_failed', 'auth.profile_update', 'auth.password_change'] },
  { label: 'Expenses',          actions: ['expense.create', 'expense.approve', 'expense.reject', 'expense.void', 'expense.receipt_upload', 'expense.receipt_remove'] },
  { label: 'Budget',            actions: ['budget.upsert'] },
  { label: 'Purchases',         actions: ['purchase.create', 'purchase.void'] },
  { label: 'Payments',          actions: ['payment.create', 'payment.approve', 'payment.bulk_approve', 'payment.reject', 'payment.void', 'template.create', 'template.delete'] },
  { label: 'Stock',             actions: ['stock.create', 'stock.void', 'stock.batch_create'] },
  { label: 'Donations',         actions: ['donation.create', 'donation.void', 'donation_occasion.create', 'donation_occasion.update', 'donation_occasion.delete'] },
  { label: 'Users & Roles',     actions: ['user.create', 'user.update', 'user.password_reset', 'role.create', 'role.update', 'role.delete'] },
  { label: 'Masters',           actions: ['product.create', 'product.update', 'product.delete', 'category.create', 'category.update', 'category.delete', 'department.create', 'department.update', 'department.delete', 'unit.create', 'unit.update', 'unit.delete', 'supplier.create', 'supplier.update', 'supplier.delete'] },
  { label: 'Assets',            actions: ['asset.create', 'asset.update', 'asset.delete', 'asset.unit_update', 'asset.borrow', 'asset.checkout', 'asset.return', 'asset.extend', 'asset.cancel', 'asset.lost', 'asset.fine_settle', 'asset.damage_update', 'asset.group_borrow', 'asset.group_checkout', 'asset.group_extend', 'asset.group_cancel'] },
  { label: 'Mahaprasad',        actions: ['mahaprasad.issue', 'mahaprasad.redeem', 'mahaprasad.offline_reserve', 'mahaprasad.offline_sync', 'mahaprasad_occasion.create', 'mahaprasad_occasion.update', 'mahaprasad_occasion.delete'] },
  { label: 'Settings',          actions: ['settings.update'] },
];

const ENTITIES = [
  '', 'Expense', 'ExpenseBudget', 'PurchaseEntry', 'SupplierPayment',
  'StockTransaction', 'Donation', 'DonationOccasion', 'User', 'Role',
  'Settings', 'Product', 'Category', 'Department', 'Unit', 'Supplier',
  'PaymentTemplate', 'Asset', 'AssetTransaction', 'BorrowGroup',
  'MahaprasadCoupon', 'MahaprasadOccasion', 'AssetUnit',
];

// ── Entity → route mapping ────────────────────────────────────────────────────

const ENTITY_ROUTE = {
  Expense:              (ref) => `/expenses/${ref}`,
  PurchaseEntry:        (ref) => `/purchases/${ref}`,
  SupplierPayment:      (ref) => `/payments/${ref}`,
  Donation:             (ref) => `/donations/${ref}`,
  Asset:                (ref) => `/assets/${ref}`,
  AssetTransaction:     (ref) => `/assets/borrows/${ref}`,
  BorrowGroup:          (ref) => `/assets/borrows/groups/${ref}`,
  Product:              (ref) => `/masters/products/${ref}`,
  Supplier:             (ref) => `/masters/suppliers/${ref}`,
  User:                 (ref) => `/admin/users/${ref}/edit`,
  Role:                 (ref) => `/admin/roles/${ref}/edit`,
  ExpenseBudget:        ()    => `/expenses/budget`,
  Settings:             ()    => `/settings`,
  Category:             ()    => `/masters/categories`,
  Department:           ()    => `/masters/departments`,
  Unit:                 ()    => `/masters/units`,
  DonationOccasion:     ()    => `/admin/occasions`,
  MahaprasadOccasion:   ()    => `/mahaprasad/occasions`,
  PaymentTemplate:      ()    => `/payments/templates`,
};

// ── Diff view ─────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null)           return <span className="text-gray-300 italic">—</span>;
  if (typeof v === 'boolean') return <span className={v ? 'text-green-600' : 'text-red-500'}>{String(v)}</span>;
  if (typeof v === 'object')  return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
  return <span>{String(v)}</span>;
}

function DiffView({ before, after, meta }) {
  // Side-by-side diff when we have before/after
  if (before || after) {
    const allKeys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    return (
      <div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-1.5 text-gray-500 font-semibold w-1/4">Field</th>
              <th className="text-left px-3 py-1.5 text-orange-600 font-semibold w-[37.5%]">Before</th>
              <th className="text-left px-3 py-1.5 text-green-600 font-semibold w-[37.5%]">After</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key) => {
              const bVal = before?.[key];
              const aVal = after?.[key];
              const changed = JSON.stringify(bVal) !== JSON.stringify(aVal);
              return (
                <tr key={key} className={changed ? 'bg-yellow-50' : ''}>
                  <td className="px-3 py-1.5 font-mono text-gray-600 border-t border-gray-100">{key}</td>
                  <td className={`px-3 py-1.5 border-t border-gray-100 font-mono ${changed ? 'text-orange-700 line-through opacity-70' : 'text-gray-500'}`}>
                    {fmt(bVal)}
                  </td>
                  <td className={`px-3 py-1.5 border-t border-gray-100 font-mono ${changed ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
                    {fmt(aVal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {meta && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs font-semibold text-blue-600 mb-1 px-3">Details</p>
            {Object.entries(meta).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs px-3 py-0.5">
                <span className="text-gray-500 w-32 shrink-0">{k}:</span>
                <span className="font-mono text-gray-800">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Meta-only (no before/after)
  if (meta) {
    return (
      <div className="px-3 py-2 space-y-0.5">
        {Object.entries(meta).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-gray-500 w-36 shrink-0">{k}:</span>
            <span className="font-mono text-gray-800 break-all">
              {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails  = log.before || log.after || log.meta;
  const actionClass = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700';

  const entityRoute = ENTITY_ROUTE[log.entity];
  const entityLink  = entityRoute && log.entityRef ? entityRoute(log.entityRef) : null;

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
        <td className="py-2 px-3 text-sm text-gray-500">{log.entity || '—'}</td>
        <td className="py-2 px-3 text-sm font-mono" onClick={(e) => entityLink && e.stopPropagation()}>
          {entityLink ? (
            <Link to={entityLink} className="text-primary-600 hover:underline inline-flex items-center gap-1">
              {log.entityId || log.entityRef}
              <ExternalLink size={11} className="opacity-50" />
            </Link>
          ) : (
            <span className="text-gray-600">{log.entityId || '—'}</span>
          )}
        </td>
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
          <td colSpan={7} className="px-4 pb-3 pt-1">
            <div className="border rounded bg-white overflow-hidden">
              <DiffView before={log.before} after={log.after} meta={log.meta} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const AuditLog = () => {
  const [filters, setFilters] = useState({
    page: 1, limit: 50,
    dateFrom: '', dateTo: '',
    entity: '', action: '',
    userId: '', search: '',
  });
  const [exporting,       setExporting]       = useState(false);
  const [activeShortcut,  setActiveShortcut]  = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))),
    keepPreviousData: true,
  });

  const { data: usersRes } = useQuery({
    queryKey: ['users'],
    queryFn:  () => getUsers(),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersRes?.data?.data || [];

  const logs       = data?.data?.data?.logs || data?.data?.logs || [];
  const pagination = data?.data?.data?.pagination || data?.data?.pagination || {};

  const set = (key, val) => setFilters((f) => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([k, v]) => v !== '' && !['page', 'limit', 'search'].includes(k))
      );
      const res = await exportAuditLogsExcel(params);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href = url; a.download = 'audit-log.xlsx'; a.click();
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

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-4 mb-3 space-y-3">

        {/* Row 1: Search | Staff member | Quick date range */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Entity ID, user name, action…"
                value={filters.search}
                onChange={(e) => set('search', e.target.value)}
                className="pl-8 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Staff Member</label>
            <select
              value={filters.userId}
              onChange={(e) => set('userId', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.name}{u.role ? ` (${u.role})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Quick Range</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_SHORTCUTS.map(({ label, get }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const { dateFrom, dateTo } = get();
                    setFilters((f) => ({ ...f, dateFrom, dateTo, page: 1 }));
                    setActiveShortcut(label);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    activeShortcut === label
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Date from | Date to | Entity | Action | Clear */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">From</label>
            <input
              type="date" value={filters.dateFrom}
              onChange={(e) => { set('dateFrom', e.target.value); setActiveShortcut(''); }}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">To</label>
            <input
              type="date" value={filters.dateTo}
              onChange={(e) => { set('dateTo', e.target.value); setActiveShortcut(''); }}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Entity</label>
            <select
              value={filters.entity}
              onChange={(e) => set('entity', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {ENTITIES.map((e) => <option key={e} value={e}>{e || 'All Entities'}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Action</label>
            <select
              value={filters.action}
              onChange={(e) => set('action', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Actions</option>
              {ACTION_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.actions.map((a) => (
                    <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-0.5">
            {Object.entries(filters).some(([k, v]) => !['page', 'limit'].includes(k) && v !== '') && (
              <button
                onClick={() => { setFilters({ page: 1, limit: 50, dateFrom: '', dateTo: '', entity: '', action: '', userId: '', search: '' }); setActiveShortcut(''); }}
                className="text-xs text-gray-400 hover:text-gray-700 underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active user-filter summary bar ───────────────────────────────────── */}
      {filters.userId && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg mb-3 text-sm">
          <span className="font-semibold text-indigo-900">
            {users.find((u) => u._id === filters.userId)?.name || 'Unknown User'}
          </span>
          {(filters.dateFrom || filters.dateTo) && (
            <span className="text-indigo-600 text-xs">
              · {filters.dateFrom || '…'} → {filters.dateTo || 'now'}
            </span>
          )}
          {pagination.total !== undefined && (
            <span className="ml-auto text-xs text-indigo-500 font-medium tabular-nums">
              {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <button
            onClick={() => set('userId', '')}
            title="Remove user filter"
            className="text-indigo-400 hover:text-indigo-700 transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Time</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Ref</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
              <th className="py-3 px-3 w-8" />
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
            >Previous</button>
            <button
              disabled={filters.page >= pagination.totalPages}
              onClick={() => set('page', filters.page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
