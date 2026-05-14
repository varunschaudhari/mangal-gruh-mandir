import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  Package, Truck, Warehouse, AlertTriangle, Users,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Trash2, TrendingUp, CalendarClock,
} from 'lucide-react';
import { getDashboardStats } from '../../api/dashboard.api.js';
import { getExpiringBatches } from '../../api/stockBatch.api.js';
import { StatCard } from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fDate } from '../../utils/formatters.js';
import { useAuth } from '../../context/AuthContext.jsx';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In', STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer', WASTAGE: 'Wastage',
};
const TYPE_VARIANTS = {
  STOCK_IN: 'success', STOCK_OUT: 'warning', TRANSFER: 'info', WASTAGE: 'danger',
};
const TYPE_ICONS = {
  STOCK_IN: ArrowDownToLine, STOCK_OUT: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight, WASTAGE: Trash2,
};

const TodayCard = ({ type, count }) => {
  const Icon = TYPE_ICONS[type] || Package;
  const variants = {
    success: 'text-green-600 bg-green-50',
    warning: 'text-amber-600 bg-amber-50',
    info:    'text-blue-600 bg-blue-50',
    danger:  'text-red-600 bg-red-50',
  };
  const cls = variants[TYPE_VARIANTS[type]] || '';
  return (
    <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-xs font-medium opacity-75">{TYPE_LABELS[type]}</p>
        <p className="text-xl font-bold">{count}</p>
      </div>
    </div>
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

const Dashboard = () => {
  const { user } = useAuth();

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

  if (isLoading) return <PageLoader />;

  const stats = data?.data?.data;
  const { counts = {}, today = {}, recentTransactions = [], weeklyMovement = [], topProducts = [] } = stats || {};
  const expiringCount = expiringRes?.data?.data?.length ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        subtitle="Mangal Grah Mandir, Amalner — Stock Management"
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Products"      value={counts.productCount    ?? '—'} icon={Package}       color="text-primary-600" bg="bg-primary-50"  border="border-l-primary-500" />
        <StatCard label="Departments"   value={counts.deptCount       ?? '—'} icon={Warehouse}     color="text-blue-600"    bg="bg-blue-50"     border="border-l-blue-500"    />
        <StatCard label="Suppliers"     value={counts.supplierCount   ?? '—'} icon={Truck}         color="text-green-600"   bg="bg-green-50"    border="border-l-green-500"   />
        <StatCard label="Active Users"  value={counts.userCount       ?? '—'} icon={Users}         color="text-purple-600"  bg="bg-purple-50"   border="border-l-purple-500"  />
        <StatCard label="Low Stock"     value={counts.lowStockItems   ?? '—'} icon={AlertTriangle} color="text-amber-600"   bg="bg-amber-50"    border="border-l-amber-500"   />
        <StatCard label="Out of Stock"  value={counts.outOfStockItems ?? '—'} icon={AlertTriangle} color="text-red-600"     bg="bg-red-50"      border="border-l-red-500"     />
        <StatCard label="Reorder Soon"  value={counts.reorderItems    ?? '—'} icon={AlertTriangle} color="text-yellow-600"  bg="bg-yellow-50"   border="border-l-yellow-500"  />
        <StatCard label="Expiring (30d)" value={expiringCount}               icon={CalendarClock} color="text-orange-600"  bg="bg-orange-50"   border="border-l-orange-500"  />
      </div>

      {/* ── Today's activity ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Today's Activity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE'].map((type) => (
            <TodayCard key={type} type={type} count={today[type] ?? 0} />
          ))}
        </div>
      </div>

      {/* ── Chart + Top Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly movement chart */}
        <div className="lg:col-span-2 card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">7-Day Stock Movement</h3>
          </div>
          {weeklyMovement.every((d) => d.stockIn === 0 && d.stockOut === 0 && d.wastage === 0) ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No transactions in the last 7 days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyMovement} barGap={2} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="stockIn"  name="Stock In"  fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="stockOut" name="Stock Out" fill="#d97706" radius={[3, 3, 0, 0]} />
                <Bar dataKey="wastage"  name="Wastage"   fill="#dc2626" radius={[3, 3, 0, 0]} />
                <Bar dataKey="transfer" name="Transfer"  fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top active products */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Products (7 days)</h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">No activity in the last 7 days.</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p._id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.code}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 shrink-0">{p.txnCount} txns</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Transactions ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Transactions</h3>
          <a href="/transactions/history" className="text-xs text-primary-600 hover:underline">View all</a>
        </div>
        {recentTransactions.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentTransactions.map((t) => (
              <div key={t._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <Badge variant={TYPE_VARIANTS[t.transactionType] || 'default'} size="sm" className="shrink-0 w-20 text-center">
                  {TYPE_LABELS[t.transactionType]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.product?.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.fromDepartment?.name && `${t.fromDepartment.name} → `}
                    {t.toDepartment?.name}
                    {' · '}{t.createdBy?.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{t.quantity} {t.unit?.symbol}</p>
                  <p className="text-xs text-gray-400">{fDate(t.transactionDate)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
