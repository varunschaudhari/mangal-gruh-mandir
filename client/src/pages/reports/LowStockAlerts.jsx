import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBalances } from '../../api/stockBalance.api.js';
import { getDepartments } from '../../api/department.api.js';
import { downloadLowStockPDF, getLowStockWhatsApp } from '../../api/report.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { AlertTriangle, PackageX, RefreshCw, ShoppingCart, Download, FileText, MessageCircle, Copy, Check } from 'lucide-react';
import { exportToExcel } from '../../utils/exportToExcel.js';
import toast from 'react-hot-toast';
import { shareText } from '../../utils/fileSaver.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const LowStockAlerts = () => {
  const t = useT();
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [waText, setWaText] = useState('');
  const [showWa, setShowWa] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const balanceParams = { lowStock: 'true', ...(deptFilter && { department: deptFilter }) };
  const exportParams  = { ...(deptFilter && { department: deptFilter }) };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['balances', 'lowstock', balanceParams],
    queryFn: () => getBalances(balanceParams),
    staleTime: 0,
  });

  let alerts = data?.data?.data || [];

  if (search) {
    const q = search.toLowerCase();
    alerts = alerts.filter(
      (b) => b.product?.name?.toLowerCase().includes(q) || b.product?.code?.toLowerCase().includes(q)
    );
  }

  const outOfStock  = alerts.filter((b) => b.alertLevel === 'out_of_stock');
  const lowStock    = alerts.filter((b) => b.alertLevel === 'low_stock');
  const reorderSoon = alerts.filter((b) => b.alertLevel === 'reorder');

  const pdfMut = useMutation({
    mutationFn: () => downloadLowStockPDF(exportParams),
    onError: () => toast.error(t('PDF export failed')),
  });

  const waMut = useMutation({
    mutationFn: () => getLowStockWhatsApp(exportParams),
    onSuccess: (res) => { setWaText(res.data.data.text); setShowWa(true); },
    onError: () => toast.error(t('Failed to generate summary')),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(waText);
    setCopied(true);
    toast.success(t('Copied to clipboard'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const STATUS = { out_of_stock: 'Out of Stock', low_stock: 'Low Stock', reorder: 'Reorder Soon' };
    const rows = alerts.map((b) => ({
      'Product':        b.product?.name || '',
      'Code':           b.product?.code || '',
      'Department':     b.department?.name || '',
      'Current Qty':    b.quantity,
      'Unit':           b.product?.unit?.symbol || '',
      'Min Level':      b.product?.minStockLevel || '',
      'Reorder Point':  b.product?.reorderPoint || '',
      'Status':         STATUS[b.alertLevel] || '',
    }));
    exportToExcel(rows, `Stock_Alerts_${localDateStr()}`, 'Stock Alerts');
  };

  return (
    <div>
      <PageHeader
        title="Stock Alerts"
        subtitle="Products that need attention"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Low Stock Alerts' }]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {/* Below lg the page has pull-to-refresh, and four buttons don't fit a phone */}
            <button onClick={() => refetch()} disabled={isFetching} className="btn btn-ghost text-sm hidden lg:flex items-center gap-1">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
            </button>
            {alerts.length > 0 && (
              <>
                <button onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                  <FileText className="h-4 w-4 text-red-500" /> {pdfMut.isPending ? t('Generating…') : 'PDF'}
                </button>
                <button onClick={handleExport} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                  <Download className="h-4 w-4 text-green-600" /> {t('Excel')}
                </button>
                <button onClick={() => waMut.mutate()} disabled={waMut.isPending} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                  <MessageCircle className="h-4 w-4 text-green-500" /> {waMut.isPending ? t('Preparing…') : t('WhatsApp')}
                </button>
              </>
            )}
          </div>
        }
      />

      {showWa && waText && (
        <div className="card p-4 bg-green-50 border border-green-200 mb-4 sm:mb-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="font-semibold text-sm text-green-800 flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" /> {t('WhatsApp Summary')}
            </h4>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="btn btn-ghost text-xs flex items-center gap-1 border border-green-300">
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                {copied ? t('Copied!') : t('Copy')}
              </button>
              <button onClick={() => shareText(waText)}
                className="btn text-xs bg-green-500 text-white hover:bg-green-600 flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-md">
                <MessageCircle className="h-3 w-3" /> {t('Open WhatsApp')}
              </button>
            </div>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white rounded p-3 border border-green-100 max-h-60 overflow-y-auto">
            {waText}
          </pre>
        </div>
      )}

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <div className="card px-4 py-3 border-l-4 border-red-500">
            <p className="text-xs text-gray-500">{t('Out of Stock')}</p>
            <p className="text-2xl font-bold text-red-600">{outOfStock.length}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-amber-500">
            <p className="text-xs text-gray-500">{t('Low Stock')}</p>
            <p className="text-2xl font-bold text-amber-600">{lowStock.length}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-yellow-400">
            <p className="text-xs text-gray-500">{t('Reorder Soon')}</p>
            <p className="text-2xl font-bold text-yellow-600">{reorderSoon.length}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-gray-300">
            <p className="text-xs text-gray-500">{t('Total Alerts')}</p>
            <p className="text-2xl font-bold text-gray-700">{alerts.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 sm:p-4 mb-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search product…')}
          className="input text-sm sm:w-48"
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input text-sm">
          <option value="">{t('All Departments')}</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : alerts.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-green-500" />
            </div>
            <p className="font-medium text-gray-600">{t('All stocked up!')}</p>
            <p className="text-sm">{t('No products are below their minimum or reorder level.')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <AlertSection title={t('Out of Stock')}  icon={PackageX}      items={outOfStock}  headerClass="bg-red-50 text-red-700 border-red-100"      badgeVariant="red"    />
            <AlertSection title={t('Low Stock')}     icon={AlertTriangle} items={lowStock}    headerClass="bg-amber-50 text-amber-700 border-amber-100"  badgeVariant="orange" />
            <AlertSection title={t('Reorder Soon')}  icon={ShoppingCart}  items={reorderSoon} headerClass="bg-yellow-50 text-yellow-700 border-yellow-100" badgeVariant="yellow" />
          </div>
          <p className="hidden md:block text-xs text-gray-400 mt-2">
            {t('Use the')} <strong>{t('WhatsApp')}</strong> {t('button above to send a summary for all alerts, or use the per-row')} <MessageCircle className="h-3 w-3 inline" /> {t('button to alert about one item.')}
          </p>
        </>
      )}
    </div>
  );
};

const AlertSection = ({ title, icon: Icon, items, headerClass, badgeVariant }) => {
  const t = useT();
  if (!items.length) return null;

  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${headerClass}`}>
        <Icon className="h-4 w-4" />
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant={badgeVariant} size="sm">{items.length}</Badge>
      </div>
      {/* Phones: compact rows instead of a 7-column table */}
      <div className="divide-y divide-gray-100 md:hidden">
        {items.map((b) => <AlertRow key={b._id} b={b} compact />)}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="table-th">{t('Product')}</th>
              <th className="table-th">{t('Department')}</th>
              <th className="table-th text-right">{t('Current Qty')}</th>
              <th className="table-th text-right">{t('Min Level')}</th>
              <th className="table-th text-right">{t('Reorder Point')}</th>
              <th className="table-th">{t('Status')}</th>
              <th className="table-th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((b) => <AlertRow key={b._id} b={b} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ALERT_CONFIG = {
  out_of_stock: { label: 'Out of Stock', variant: 'red',    rowBg: 'bg-red-50'    },
  low_stock:    { label: 'Low Stock',    variant: 'orange', rowBg: 'bg-amber-50'  },
  reorder:      { label: 'Reorder Soon', variant: 'yellow', rowBg: 'bg-yellow-50' },
};

const AlertRow = ({ b, compact = false }) => {
  const t = useT();
  const cfg = ALERT_CONFIG[b.alertLevel] || {};

  const sendSingleAlert = () => {
    const STATUS = { out_of_stock: 'Out of Stock ❌', low_stock: 'Low Stock ⚠️', reorder: 'Reorder Soon 🔄' };
    const text = [
      `⚠️ *Stock Alert — ${b.product?.name}*`,
      `Code: ${b.product?.code || '—'}`,
      `Department: ${b.department?.name || '—'}`,
      `Status: ${STATUS[b.alertLevel] || b.alertLevel}`,
      `Current Stock: *${b.quantity} ${b.product?.unit?.symbol || ''}*`,
      b.product?.minStockLevel ? `Min Level: ${b.product.minStockLevel} ${b.product?.unit?.symbol || ''}` : null,
      b.product?.reorderPoint  ? `Reorder Point: ${b.product.reorderPoint} ${b.product?.unit?.symbol || ''}` : null,
      `\nPlease arrange to restock.`,
    ].filter(Boolean).join('\n');
    shareText(text);
  };

  if (compact) {
    const unit = b.product?.unit?.symbol || '';
    return (
      <div className={`flex items-center gap-3 px-4 py-3 ${cfg.rowBg}`}>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-gray-900 break-words">{b.product?.name}</p>
          <p className="text-xs text-gray-500">
            <span className="font-mono">{b.product?.code}</span>{b.department?.name && ` · ${b.department.name}`}
          </p>
          {(b.product?.minStockLevel || b.product?.reorderPoint) && (
            <p className="mt-0.5 text-xs text-gray-400">
              {b.product?.minStockLevel ? `Min ${b.product.minStockLevel}` : ''}
              {b.product?.minStockLevel && b.product?.reorderPoint ? ' · ' : ''}
              {b.product?.reorderPoint ? `Reorder at ${b.product.reorderPoint}` : ''}
              {unit && ` ${unit}`}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-lg font-bold">{b.quantity}</span>
          <span className="ml-1 text-xs text-gray-500">{unit}</span>
        </div>
        <button
          onClick={sendSingleAlert}
          aria-label={t('Send WhatsApp alert for {name}', { name: b.product?.name })}
          className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-green-600 active:bg-green-100"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <tr className={`hover:brightness-95 text-sm ${cfg.rowBg}`}>
      <td className="table-td">
        <div className="font-medium">{b.product?.name}</div>
        <div className="text-xs text-gray-400 font-mono">{b.product?.code}</div>
      </td>
      <td className="table-td">{b.department?.name}</td>
      <td className="table-td text-right">
        <span className="font-bold text-base">{b.quantity}</span>
        <span className="ml-1 text-xs text-gray-400">{b.product?.unit?.symbol}</span>
      </td>
      <td className="table-td text-right text-gray-500">{b.product?.minStockLevel || '—'}</td>
      <td className="table-td text-right text-gray-500">{b.product?.reorderPoint || '—'}</td>
      <td className="table-td">
        <Badge variant={cfg.variant} size="sm">{t(cfg.label)}</Badge>
      </td>
      <td className="table-td text-center">
        <button
          onClick={sendSingleAlert}
          title={t('Send WhatsApp alert for this item')}
          className="inline-flex items-center justify-center h-7 w-7 rounded-full hover:bg-green-100 text-green-600 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
};

export default LowStockAlerts;
