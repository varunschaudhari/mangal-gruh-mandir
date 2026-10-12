import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  Package, Truck, Warehouse, AlertTriangle, Users,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Trash2, TrendingUp, CalendarClock,
  ShoppingBag, CalendarDays, CreditCard, Clock, IndianRupee, TimerOff,
  Heart, Receipt, TrendingDown, ChevronRight, CheckCircle2, Bell,
} from 'lucide-react';
import { getDashboardStats } from '../../api/dashboard.api.js';
import { getExpiringBatches } from '../../api/stockBatch.api.js';
import { getPaymentDashboardSummary } from '../../api/supplierPayment.api.js';
import { getPnL } from '../../api/pnl.api.js';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fDate, fCurrency } from '../../utils/formatters.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import MahaprasadLiveTile from '../../components/mahaprasad/MahaprasadLiveTile.jsx';
import { useT } from '../../i18n/index.jsx';
import { useTemple } from '../../utils/temple.js';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In', STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer', WASTAGE: 'Wastage',
};
const TYPE_VARIANTS = {
  STOCK_IN: 'success', STOCK_OUT: 'warning', TRANSFER: 'info', WASTAGE: 'danger',
};
// <Badge> colour names for the same types (it has no success/warning/info/danger variants).
const TYPE_BADGES = {
  STOCK_IN: 'green', STOCK_OUT: 'orange', TRANSFER: 'blue', WASTAGE: 'red',
};
const TYPE_ICONS = {
  STOCK_IN: ArrowDownToLine, STOCK_OUT: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight, WASTAGE: Trash2,
};

const TYPE_ROUTES = {
  STOCK_IN:  '/transactions/history',
  STOCK_OUT: '/transactions/history',
  TRANSFER:  '/transactions/history',
  WASTAGE:   '/transactions/history',
};

// Whole rupees: two decimals don't fit half a phone screen.
const fRupees = (n) => (n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—');

// Phones show the short amount, sm and up keep the full one.
const Amount = ({ value }) => (
  <>
    <span className="sm:hidden">{fRupees(value)}</span>
    <span className="hidden sm:inline">{fCurrency(value)}</span>
  </>
);

// Same look as <StatCard> from sm up; tighter padding and type on phones.
const KpiTile = ({ label, value, icon: Icon, color, bg, border, to, className = '' }) => (
  <Link to={to} className={`card p-2.5 sm:p-4 border-l-4 ${border} hover:shadow-md active:bg-gray-50 transition-shadow cursor-pointer ${className}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="mt-0.5 text-lg leading-6 sm:text-2xl font-bold text-gray-800">{value ?? '—'}</p>
      </div>
      <div className={`rounded-full p-1.5 sm:p-3 shrink-0 ${bg}`}>
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color}`} />
      </div>
    </div>
  </Link>
);

const TodayCard = ({ type, count }) => {
  const t = useT();
  const Icon = TYPE_ICONS[type] || Package;
  const variants = {
    success: 'text-green-600 bg-green-50 hover:bg-green-100 border border-green-100',
    warning: 'text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-100',
    info:    'text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100',
    danger:  'text-red-600 bg-red-50 hover:bg-red-100 border border-red-100',
  };
  const cls = variants[TYPE_VARIANTS[type]] || '';
  return (
    <Link to={TYPE_ROUTES[type]} className={`rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 transition-colors ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-xs font-medium opacity-75">{t(TYPE_LABELS[type])}</p>
        <p className="text-xl font-bold">{count}</p>
      </div>
    </Link>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const TONES = {
  yellow: 'bg-yellow-100 text-yellow-800',
  amber:  'bg-amber-100 text-amber-800',
  red:    'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
};

// Phone-only "inbox" at the top: the things a trustee should act on, each one tap away.
const AttentionList = ({ items }) => {
  const t = useT();
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Bell className="h-4 w-4 text-primary-600" />
        <h2 className="text-sm font-semibold text-gray-700">{t('Needs attention')}</h2>
      </div>
      <div className="card divide-y divide-gray-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{t('All caught up')}</p>
              <p className="text-xs text-gray-500">{t('No approvals, overdue bills or stock alerts')}</p>
            </div>
          </div>
        ) : items.map((it) => (
          <Link key={it.key} to={it.to} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums ${TONES[it.tone]}`}>
              {it.count > 99 ? '99+' : it.count}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800">{it.title}</p>
              {it.sub && <p className="truncate text-xs text-gray-500">{it.sub}</p>}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const t = useT();
  const { name: templeName } = useTemple();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isMobile = useIsMobile();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    staleTime: 60000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: expiringRes } = useQuery({
    queryKey: ['expiring-batches', 30],
    queryFn: () => getExpiringBatches({ days: 30 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: expiring7Res } = useQuery({
    queryKey: ['expiring-batches', 7],
    queryFn: () => getExpiringBatches({ days: 7 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: paymentSummaryRes } = useQuery({
    queryKey: ['payment-dashboard-summary'],
    queryFn: getPaymentDashboardSummary,
    staleTime: 2 * 60 * 1000,
    enabled: can('payments:read'),
  });

  const thisMonth = new Date();
  const { data: pnlRes } = useQuery({
    queryKey: ['pnl', thisMonth.getFullYear(), thisMonth.getMonth() + 1],
    queryFn:  () => getPnL({ year: thisMonth.getFullYear(), month: thisMonth.getMonth() + 1 }),
    staleTime: 5 * 60 * 1000,
    enabled: can('payments:read'),
  });

  if (isLoading) return <PageLoader />;

  const stats = data?.data?.data;
  const { counts = {}, assetCounts = {}, today = {}, recentTransactions = [], weeklyMovement = [], topProducts = [] } = stats || {};
  const expiringCount      = expiringRes?.data?.data?.length ?? '—';
  const expiring7Items     = (expiring7Res?.data?.data || []).slice(0, 5);
  const paymentSummary     = paymentSummaryRes?.data?.data || {};
  const pnl                = pnlRes?.data?.data;

  // ── Phone "needs attention" list ──────────────────────────────────────────
  const attention = [];
  // Whole phrases (not "Supplier payment" + "s" + verb) so Marathi can order the words itself.
  const canApproveNow = can('payments:approve');
  if (can('payments:read')) {
    if (paymentSummary.pendingCount > 0) {
      attention.push({
        key: 'payments', to: '/payments?status=pending_approval', tone: 'yellow', count: paymentSummary.pendingCount,
        title: t(paymentSummary.pendingCount > 1
          ? (canApproveNow ? 'Supplier payments to approve' : 'Supplier payments awaiting approval')
          : (canApproveNow ? 'Supplier payment to approve' : 'Supplier payment awaiting approval')),
        sub: t('Review vouchers'),
      });
    }
    if (pnl?.expenses?.pendingCount > 0) {
      attention.push({
        key: 'expenses', to: '/expenses?status=pending_approval', tone: 'amber', count: pnl.expenses.pendingCount,
        title: t(pnl.expenses.pendingCount > 1
          ? (canApproveNow ? 'Expenses to approve' : 'Expenses awaiting approval')
          : (canApproveNow ? 'Expense to approve' : 'Expense awaiting approval')),
        sub: t('{amount} this month', { amount: fRupees(pnl.expenses.pendingAmount) }),
      });
    }
    if (paymentSummary.overdueCount > 0) {
      attention.push({
        key: 'overdue', to: '/payments/upcoming', tone: 'red', count: paymentSummary.overdueCount,
        title: t(paymentSummary.overdueCount > 1 ? 'Overdue supplier invoices' : 'Overdue supplier invoice'),
        sub: t('{amount} past due date', { amount: fRupees(paymentSummary.overdueAmount) }),
      });
    }
  }
  const stockAlerts = (counts.outOfStockItems || 0) + (counts.lowStockItems || 0);
  if (can('masters:read') && stockAlerts > 0) {
    attention.push({
      key: 'stock', to: '/reports/low-stock', tone: 'orange', count: stockAlerts,
      title: t('Items low or out of stock'),
      sub: [
        counts.outOfStockItems > 0 && t('{n} out of stock', { n: counts.outOfStockItems }),
        counts.lowStockItems > 0 && t('{n} low', { n: counts.lowStockItems }),
        counts.reorderItems > 0 && t('{n} to reorder', { n: counts.reorderItems }),
      ].filter(Boolean).join(' · '),
    });
  }
  const showAttention = can('payments:read') || can('masters:read');

  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  // Below lg the sections stack in a flex column and `order-*` puts a trustee's priorities
  // first (approvals & dues, stock, Mahaprasad, finance). From lg up it is a plain block
  // with space-y-6, so order is ignored and the desktop layout is unchanged.
  return (
    <div className="flex flex-col gap-4 lg:block lg:space-y-6">
      <PageHeader
        title={t('Welcome back, {name}', { name: user?.name?.split(' ')[0] ?? '' })}
        subtitle={
          <>
            <span className="lg:hidden">{todayLabel}</span>
            <span className="hidden lg:inline">{t('{temple} — Stock Management', { temple: t(templeName) })}</span>
          </>
        }
      />

      {showAttention && (
        <div className="order-1 lg:hidden">
          <AttentionList items={attention} />
        </div>
      )}

      {/* ── KPI Cards ── */}
      {can('masters:read') && (
      <div className="order-6 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiTile label={t('Products')}      value={counts.productCount    ?? '—'} icon={Package}       color="text-primary-600" bg="bg-primary-50"  border="border-l-primary-500" to="/masters/products"         />
        <KpiTile label={t('Departments')}   value={counts.deptCount       ?? '—'} icon={Warehouse}     color="text-blue-600"    bg="bg-blue-50"     border="border-l-blue-500"    to="/masters/departments"      />
        <KpiTile label={t('Suppliers')}     value={counts.supplierCount   ?? '—'} icon={Truck}         color="text-green-600"   bg="bg-green-50"    border="border-l-green-500"   to="/masters/suppliers"        />
        <KpiTile label={t('Active Users')}  value={counts.userCount       ?? '—'} icon={Users}         color="text-purple-600"  bg="bg-purple-50"   border="border-l-purple-500"  to="/admin/users"              />
        {/* Stock alerts lead the grid on phones */}
        <KpiTile label={t('Low Stock')}     value={counts.lowStockItems   ?? '—'} icon={AlertTriangle} color="text-amber-600"   bg="bg-amber-50"    border="border-l-amber-500"   to="/reports/low-stock"        className="order-first lg:order-none" />
        <KpiTile label={t('Out of Stock')}  value={counts.outOfStockItems ?? '—'} icon={AlertTriangle} color="text-red-600"     bg="bg-red-50"      border="border-l-red-500"     to="/reports/low-stock"        className="order-first lg:order-none" />
        <KpiTile label={t('Reorder Soon')}  value={counts.reorderItems    ?? '—'} icon={AlertTriangle} color="text-yellow-600"  bg="bg-yellow-50"   border="border-l-yellow-500"  to="/reports/low-stock"        className="order-first lg:order-none" />
        <KpiTile label={t('Expiring (30d)')} value={expiringCount}               icon={CalendarClock} color="text-orange-600"  bg="bg-orange-50"   border="border-l-orange-500"  to="/reports/expiring-stock"   className="order-first lg:order-none" />
      </div>
      )}

      {/* ── Mahaprasad Live Tile ── (wrapper collapses when the tile renders nothing) */}
      <div className="order-2 empty:hidden">
        <MahaprasadLiveTile />
      </div>

      {/* ── Financial Summary — This Month ── */}
      {can('payments:read') && pnl && (
        <div className="order-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-700">
                {t("This Month's Finance")}
              </h2>
            </div>
            <Link to="/reports/pnl" className="-my-2 py-2 text-xs text-primary-600 hover:underline">{t('View P&L →')}</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <Link to="/donations" className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-green-100 transition-colors">
              <Heart className="h-5 w-5 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-green-700 font-medium">{t('Income')}</p>
                <p className="text-lg sm:text-xl font-bold text-green-700"><Amount value={pnl.income.total} /></p>
                <p className="text-xs text-green-600">
                  {pnl.income.bookingCount
                    ? t('{n} donations · {b} bookings', { n: pnl.income.donationCount, b: pnl.income.bookingCount })
                    : t('{n} donations', { n: pnl.income.donationCount })}
                </p>
              </div>
            </Link>
            <Link to="/expenses" className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-orange-100 transition-colors">
              <Receipt className="h-5 w-5 text-orange-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-orange-700 font-medium">{t('Expenses')}</p>
                <p className="text-lg sm:text-xl font-bold text-orange-700"><Amount value={pnl.expenses.total} /></p>
                {pnl.expenses.pendingCount > 0 && (
                  <p className="text-xs text-amber-600">{t('{n} pending', { n: pnl.expenses.pendingCount })}</p>
                )}
              </div>
            </Link>
            <Link to="/reports/pnl" className={`col-span-2 sm:col-span-1 rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 transition-colors ${
              pnl.net >= 0
                ? 'border-green-200 bg-green-50 hover:bg-green-100'
                : 'border-red-200 bg-red-50 hover:bg-red-100'
            }`}>
              {pnl.net >= 0
                ? <TrendingUp  className="h-5 w-5 text-green-600 shrink-0" />
                : <TrendingDown className="h-5 w-5 text-red-600 shrink-0" />}
              <div className="min-w-0">
                <p className={`text-xs font-medium ${pnl.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {pnl.net >= 0 ? t('Surplus') : t('Deficit')}
                </p>
                <p className={`text-lg sm:text-xl font-bold ${pnl.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  <Amount value={Math.abs(pnl.net)} />
                </p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Asset Status Widget ── */}
      {can('assets:read') && (
        <div className="order-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-gray-700">{t('Asset Status')}</h2>
            </div>
            <Link to="/assets/borrows" className="-my-2 py-2 text-xs text-primary-600 hover:underline">{t('View all')}</Link>
          </div>
          {/* Phones: icon above the number so three tiles fit one row */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <Link to="/assets/borrows?status=checked_out"
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 hover:bg-blue-100 transition-colors">
              <ShoppingBag className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-blue-700">{assetCounts.checkedOut ?? '—'}</p>
                <p className="text-xs text-blue-600 font-medium">{t('Checked Out')}</p>
              </div>
            </Link>
            <Link to="/assets/borrows?status=overdue"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 hover:bg-red-100 transition-colors">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-red-700">{assetCounts.overdue ?? '—'}</p>
                <p className="text-xs text-red-600 font-medium">{t('Overdue')}</p>
              </div>
            </Link>
            <Link to="/assets/borrows"
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 hover:bg-amber-100 transition-colors">
              <CalendarDays className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold text-amber-700">{assetCounts.dueThisWeek ?? '—'}</p>
                <p className="text-xs text-amber-600 font-medium">{t('Due This Week')}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Payment Status Widget ── */}
      {can('payments:read') && paymentSummaryRes && (
        <div className="order-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-700">{t('Payment Status')}</h2>
            </div>
            <Link to="/payments" className="-my-2 py-2 text-xs text-primary-600 hover:underline">{t('View all')}</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <Link to="/payments?status=pending_approval"
              className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-yellow-100 transition-colors">
              <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-yellow-700">{paymentSummary.pendingCount ?? '—'}</p>
                <p className="text-xs text-yellow-600 font-medium">{t('Pending Approval')}</p>
              </div>
            </Link>
            <Link to="/reports/supplier-aging"
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-blue-100 transition-colors">
              <IndianRupee className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-blue-700">
                  {paymentSummary.totalOutstanding != null ? `₹${Math.round(paymentSummary.totalOutstanding / 1000)}k` : '—'}
                </p>
                <p className="text-xs text-blue-600 font-medium">{t('Outstanding')}</p>
              </div>
            </Link>
            <Link to="/reports/supplier-aging"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-red-100 transition-colors">
              <TimerOff className="h-5 w-5 text-red-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-red-700">
                  {paymentSummary.overdueAmount != null ? `₹${Math.round(paymentSummary.overdueAmount / 1000)}k` : '—'}
                </p>
                <p className="text-xs text-red-600 font-medium">{t('Overdue')}</p>
              </div>
            </Link>
            <Link to="/reports/supplier-aging"
              className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-orange-100 transition-colors">
              <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-orange-700">{paymentSummary.overdueCount ?? '—'}</p>
                <p className="text-xs text-orange-600 font-medium">{t('Overdue Invoices')}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Expiring Soon (7 days) ── */}
      {can('reports:read') && expiring7Items.length > 0 && (
        <div className="order-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-orange-600" />
              <h2 className="text-sm font-semibold text-gray-700">{t('Expiring Within 7 Days')}</h2>
            </div>
            <Link to="/reports/expiring-stock" className="-my-2 py-2 text-xs text-primary-600 hover:underline">{t('View all')}</Link>
          </div>
          <div className="bg-white rounded-xl border border-orange-100 overflow-hidden">
            {expiring7Items.map((b, i) => {
              const daysLeft = Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000);
              const isExpired = daysLeft < 0;
              return (
                <div key={b._id} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${i !== expiring7Items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{b.product?.name}</span>
                    <span className="block text-xs text-gray-400 sm:inline sm:ml-2">{b.department?.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-right shrink-0">
                    <span className="text-xs text-gray-500">{b.remainingQty} {b.product?.unit?.symbol}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isExpired ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {isExpired ? t('{n}d ago', { n: Math.abs(daysLeft) }) : t('{n}d left', { n: daysLeft })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Today's activity ── */}
      {can('transactions:read') && (
      <div className="order-7">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("Today's Activity")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE'].map((type) => (
            <TodayCard key={type} type={type} count={today[type] ?? 0} />
          ))}
        </div>
      </div>
      )}

      {/* ── Chart + Top Products ── */}
      {can('transactions:read') && (
      <div className="order-9 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly movement chart */}
        <div className="lg:col-span-2 card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">{t('7-Day Stock Movement')}</h3>
          </div>
          {weeklyMovement.every((d) => d.stockIn === 0 && d.stockOut === 0 && d.wastage === 0) ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              {t('No transactions in the last 7 days.')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
              {/* maxBarSize (not a fixed barSize) so 7 days × 4 series fit a phone */}
              <BarChart data={weeklyMovement} barGap={isMobile ? 1 : 2} maxBarSize={14}
                margin={isMobile ? { top: 5, right: 0, bottom: 0, left: -12 } : undefined}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false}
                  tickFormatter={isMobile ? (v) => String(v).split(' ')[0] : undefined} />
                <YAxis tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} width={35} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="stockIn"  name={t('Stock In')}  fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="stockOut" name={t('Stock Out')} fill="#d97706" radius={[3, 3, 0, 0]} />
                <Bar dataKey="wastage"  name={t('Wastage')}   fill="#dc2626" radius={[3, 3, 0, 0]} />
                <Bar dataKey="transfer" name={t('Transfer')}  fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top active products */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('Top Products (7 days)')}</h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">{t('No activity in the last 7 days.')}</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <Link key={p._id} to={`/masters/products/${p._id}`} className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded-md px-1 py-1.5 sm:py-0.5 -mx-1">
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.code}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 shrink-0">{t('{n} txns', { n: p.txnCount })}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Recent Transactions ── */}
      {can('transactions:read') && (
      <div className="order-10 card overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{t('Recent Transactions')}</h3>
          <Link to="/transactions/history" className="-my-2 py-2 text-xs text-primary-600 hover:underline">{t('View all')}</Link>
        </div>
        {recentTransactions.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">{t('No transactions yet.')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentTransactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <Badge variant={TYPE_BADGES[tx.transactionType] || 'gray'} className="shrink-0 w-[4.75rem] sm:w-20 justify-center">
                  {t(TYPE_LABELS[tx.transactionType])}
                </Badge>
                <div className="flex-1 min-w-0">
                  <Link to={`/masters/products/${tx.product?._id}`} className="text-sm font-medium truncate hover:text-primary-600 hover:underline block">
                    {tx.product?.name}
                  </Link>
                  <p className="text-xs text-gray-400 truncate">
                    {tx.fromDepartment?.name && `${tx.fromDepartment.name} → `}
                    {tx.toDepartment?.name}
                    {' · '}{tx.createdBy?.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{tx.quantity} {tx.unit?.symbol}</p>
                  <p className="text-xs text-gray-400">{fDate(tx.transactionDate)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default Dashboard;
