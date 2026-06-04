import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, AlertTriangle, Bell, ArrowRight, RotateCcw } from 'lucide-react';
import { getAssetTransactions, bulkSendReminders } from '../../api/assetTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function daysFromNow(d) {
  const diff = Math.ceil((new Date(d) - new Date().setHours(0,0,0,0)) / 86400000);
  return diff;
}

function urgencyLabel(days, status) {
  if (status === 'overdue' || days < 0) return { label: 'Overdue', cls: 'text-red-600 bg-red-50 border-red-200', badge: 'bg-red-500' };
  if (days === 0) return { label: 'Due Today', cls: 'text-orange-600 bg-orange-50 border-orange-200', badge: 'bg-orange-500' };
  if (days <= 3)  return { label: 'Due Soon', cls: 'text-amber-600 bg-amber-50 border-amber-200', badge: 'bg-amber-400' };
  return { label: 'Upcoming', cls: 'text-blue-600 bg-blue-50 border-blue-200', badge: 'bg-blue-400' };
}

const BorrowCard = ({ txn, navigate, can }) => {
  const days     = daysFromNow(txn.expectedReturnDate);
  const urgency  = urgencyLabel(days, txn.status);
  const isOverdue = txn.status === 'overdue' || days < 0;

  return (
    <div
      onClick={() => navigate(`/assets/borrows/${txn._id}`)}
      className={`rounded-xl border cursor-pointer transition-all hover:shadow-sm ${urgency.cls}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm truncate">{txn.asset?.name}</span>
              <span className="text-xs font-mono opacity-60 shrink-0">×{txn.quantityBorrowed}</span>
            </div>
            <p className="text-xs opacity-75">{txn.borrower?.name} · {txn.asset?.category}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-bold">
              {isOverdue
                ? `${Math.abs(days)}d overdue`
                : days === 0 ? 'Due today'
                : `${days}d left`}
            </p>
            <p className="text-xs opacity-60 mt-0.5">{fmt(txn.expectedReturnDate)}</p>
          </div>
        </div>
        {can('assets:manage') && (txn.status === 'checked_out' || txn.status === 'overdue') && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-current border-opacity-20">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/assets/borrows/${txn._id}/return`); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-white rounded-lg shadow-sm hover:shadow transition-shadow">
              <RotateCcw className="h-3 w-3" /> Return
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const UpcomingReturns = () => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['upcoming-returns'],
    queryFn: () => getAssetTransactions({ limit: 200 }),
    refetchInterval: 5 * 60 * 1000,
  });

  const bulkMut = useMutation({
    mutationFn: bulkSendReminders,
    onSuccess: (res) => {
      const { sent, total } = res.data?.data || {};
      toast.success(`Reminders sent to ${sent} of ${total} overdue borrower(s)`);
      qc.invalidateQueries({ queryKey: ['upcoming-returns'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send reminders'),
  });

  const result = data?.data?.data;
  const all    = result?.data || [];

  // Only active transactions, sorted by expectedReturnDate ASC
  const active = all
    .filter((t) => ['approved', 'checked_out', 'overdue'].includes(t.status))
    .sort((a, b) => new Date(a.expectedReturnDate) - new Date(b.expectedReturnDate));

  const overdueTxns  = active.filter((t) => t.status === 'overdue' || daysFromNow(t.expectedReturnDate) < 0);
  const todayTxns    = active.filter((t) => t.status !== 'overdue' && daysFromNow(t.expectedReturnDate) === 0);
  const soonTxns     = active.filter((t) => t.status !== 'overdue' && daysFromNow(t.expectedReturnDate) > 0 && daysFromNow(t.expectedReturnDate) <= 3);
  const upcomingTxns = active.filter((t) => t.status !== 'overdue' && daysFromNow(t.expectedReturnDate) > 3);

  if (isLoading) return <PageLoader />;

  const Section = ({ title, icon: Icon, txns, color }) => {
    if (!txns.length) return null;
    return (
      <div>
        <div className={`flex items-center gap-2 mb-3 ${color}`}>
          <Icon className="h-4 w-4" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs bg-current bg-opacity-10 rounded-full px-2 py-0.5 font-bold">{txns.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {txns.map((t) => <BorrowCard key={t._id} txn={t} navigate={navigate} can={can} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming Returns"
        subtitle="Active borrows sorted by due date"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Upcoming Returns' }]}
        actions={can('assets:manage') && overdueTxns.length > 0 && (
          <button
            onClick={() => bulkMut.mutate()}
            disabled={bulkMut.isPending}
            className="btn-danger flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            {bulkMut.isPending ? 'Sending…' : `Remind All Overdue (${overdueTxns.length})`}
          </button>
        )}
      />

      {active.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <CalendarClock className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No active borrows</p>
          <p className="text-sm text-gray-400 mt-1">All assets are back in the temple</p>
          <Link to="/assets/borrows/new" className="btn-primary inline-flex items-center gap-2 mt-4">
            New Borrow Request
          </Link>
        </div>
      ) : (
        <div className="space-y-7">
          <Section title="Overdue"    icon={AlertTriangle} txns={overdueTxns}  color="text-red-600" />
          <Section title="Due Today"  icon={AlertTriangle} txns={todayTxns}    color="text-orange-600" />
          <Section title="Due in 3 Days" icon={CalendarClock} txns={soonTxns} color="text-amber-600" />
          <Section title="Upcoming"   icon={CalendarClock} txns={upcomingTxns} color="text-blue-600" />
        </div>
      )}
    </div>
  );
};

export default UpcomingReturns;
