import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Utensils, TrendingUp, IndianRupee } from 'lucide-react';
import { getDailySummary } from '../../api/mahaprasad.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';

const todayStr = () => new Date().toISOString().split('T')[0];

function agoLabel(ms) {
  const s = Math.round(ms / 1000);
  if (s < 20)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function MahaprasadLiveTile() {
  const { can } = usePermissions();

  const historyRef = useRef([]);
  const [pace,    setPace]    = useState(null);
  const [msAgo,   setMsAgo]   = useState(0);

  const { data, dataUpdatedAt } = useQuery({
    queryKey:       ['mahaprasad-summary', todayStr()],
    queryFn:        () => getDailySummary(todayStr()),
    refetchInterval: 30 * 1000,
    staleTime:       20 * 1000,
    enabled:         can('mahaprasad:read'),
  });

  const summary = data?.data?.data || null;
  const {
    total = 0, redeemed = 0, pending = 0,
    cap   = 0, collected = 0, paid   = 0, free = 0,
  } = summary || {};

  // Rolling history → pace (coupons issued per hour)
  useEffect(() => {
    if (summary === null) return;
    const now = Date.now();
    const h   = historyRef.current;
    const last = h[h.length - 1];

    if (!last || last.total !== total || (now - last.ts) > 25_000) {
      h.push({ ts: now, total });
      if (h.length > 20) h.shift();   // ~10 min window at 30s interval
    }

    if (h.length >= 2) {
      const oldest   = h[0];
      const newest   = h[h.length - 1];
      const delta    = newest.total - oldest.total;
      const mins     = (newest.ts - oldest.ts) / 60_000;
      const computed = mins >= 0.3 && delta >= 0 ? Math.round((delta / mins) * 60) : null;
      setPace(computed);
    }
  }, [dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Updated X ago" ticker
  useEffect(() => {
    if (!dataUpdatedAt) return;
    setMsAgo(Date.now() - dataUpdatedAt);
    const t = setInterval(() => setMsAgo(Date.now() - dataUpdatedAt), 5_000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  if (!can('mahaprasad:read') || summary === null) return null;

  const pct    = total > 0 ? Math.round((redeemed / total) * 100) : 0;
  const capPct = cap   > 0 ? Math.round((total    / cap)   * 100) : 0;
  const capCls = capPct >= 100 ? 'text-red-600 font-semibold'
               : capPct >=  80 ? 'text-orange-500 font-medium'
               :                 'text-gray-400';

  return (
    <div className="card p-4 space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-700">Mahaprasad Today</h2>
          {/* live pulse dot */}
          <span className="relative flex h-2 w-2 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 tabular-nums">{agoLabel(msAgo)}</span>
          <Link to="/mahaprasad/counter" className="text-xs text-primary-600 hover:underline">Counter →</Link>
        </div>
      </div>

      {/* ── Big numbers ── */}
      <div className="grid grid-cols-3 gap-2">
        <Link to="/mahaprasad/history"
          className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-2.5 text-center hover:bg-blue-100 transition-colors">
          <p className="text-2xl font-black text-blue-700 tabular-nums">{total.toLocaleString('en-IN')}</p>
          <p className="text-xs text-blue-600 font-medium mt-0.5">Issued</p>
        </Link>
        <Link to="/mahaprasad/redeem"
          className="rounded-lg bg-green-50 border border-green-100 px-2 py-2.5 text-center hover:bg-green-100 transition-colors">
          <p className="text-2xl font-black text-green-700 tabular-nums">{redeemed.toLocaleString('en-IN')}</p>
          <p className="text-xs text-green-600 font-medium mt-0.5">Redeemed</p>
        </Link>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-2.5 text-center">
          <p className="text-2xl font-black text-amber-700 tabular-nums">{pending.toLocaleString('en-IN')}</p>
          <p className="text-xs text-amber-600 font-medium mt-0.5">Pending</p>
        </div>
      </div>

      {/* ── Redemption progress bar ── */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Redemption</span>
            <span className="font-medium text-gray-600 tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Footer: pace · collection · cap ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 border-t border-gray-50 text-xs text-gray-500">
        {pace != null && pace > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <TrendingUp className="h-3 w-3" />
            ~{pace}/hr
          </span>
        )}
        {collected > 0 && (
          <span className="flex items-center gap-1">
            <IndianRupee className="h-3 w-3" />
            {collected.toLocaleString('en-IN')} collected
            {paid > 0 && free > 0 && (
              <span className="text-gray-400 ml-0.5">({paid} paid · {free} free)</span>
            )}
          </span>
        )}
        {cap > 0 && (
          <span className={capCls}>
            Cap {total}/{cap}{capPct >= 100 ? ' — FULL' : capPct >= 80 ? ` (${capPct}%)` : ''}
          </span>
        )}
        {total === 0 && <span className="text-gray-400 italic">No coupons issued today</span>}
      </div>
    </div>
  );
}
