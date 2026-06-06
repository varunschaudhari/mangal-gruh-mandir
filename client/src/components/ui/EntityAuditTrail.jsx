import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronDown, ChevronRight } from 'lucide-react';
import { getEntityHistory } from '../../api/auditLog.api.js';
import { fDateTime } from '../../utils/formatters.js';

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
};

const ACTION_DOT = {
  create:  'bg-green-500',
  approve: 'bg-blue-500',
  reject:  'bg-orange-500',
  void:    'bg-red-500',
  update:  'bg-yellow-500',
  login:   'bg-gray-400',
};

function dotColor(action) {
  for (const [key, cls] of Object.entries(ACTION_DOT)) {
    if (action.includes(key)) return cls;
  }
  return 'bg-gray-400';
}

function MetaBlock({ label, data, colorClass }) {
  if (!data) return null;
  return (
    <div className="mt-1">
      <div className={`text-xs font-semibold mb-0.5 ${colorClass}`}>{label}</div>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-gray-400 w-28 shrink-0">{k}:</span>
          <span className="font-mono text-gray-700 break-all">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrailEntry({ log }) {
  const [open, setOpen] = useState(false);
  const hasDetails = log.before || log.after || log.meta;

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor(log.action)}`} />
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-800">
            {ACTION_LABELS[log.action] || log.action}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{fDateTime(log.timestamp)}</span>
        </div>
        <div className="text-xs text-gray-500">
          {log.user?.name || 'System'}
          {log.user?.role && <span className="text-gray-400"> · {log.user.role}</span>}
        </div>

        {hasDetails && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-1"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {open ? 'Hide details' : 'Show details'}
          </button>
        )}

        {open && hasDetails && (
          <div className="mt-2 bg-gray-50 border rounded p-2 text-xs space-y-1">
            <MetaBlock label="Before" data={log.before} colorClass="text-orange-600" />
            <MetaBlock label="After"  data={log.after}  colorClass="text-green-600" />
            <MetaBlock label="Details" data={log.meta}  colorClass="text-blue-600" />
          </div>
        )}
      </div>
    </div>
  );
}

const EntityAuditTrail = ({ entityRef, title = 'History' }) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-trail', entityRef],
    queryFn: () => getEntityHistory(entityRef),
    enabled: open && !!entityRef,
  });

  const logs = data?.data?.data || [];

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <History size={15} />
          {title}
        </div>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t">
          {isLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading history…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No history found</p>
          ) : (
            <div className="mt-2">
              {logs.map((log, i) => (
                <TrailEntry key={log._id || i} log={log} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EntityAuditTrail;
