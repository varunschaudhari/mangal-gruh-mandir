import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Vault, ChevronDown, ChevronUp, Edit3, Check, X, BarChart2 } from 'lucide-react';
import { getCashDrawer, setOpeningFloat, adjustDrawer } from '../../api/mahaprasad.api.js';
import toast from 'react-hot-toast';

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

function fmt(n) { return n.toLocaleString('en-IN'); }

// ── Opening float form ────────────────────────────────────────────────────────
function FloatForm({ date, currentCounts, onClose }) {
  const qc = useQueryClient();
  const [counts, setCounts] = useState(
    Object.fromEntries(DENOMS.map((d) => [String(d), currentCounts?.[String(d)] ?? 0]))
  );

  const mut = useMutation({
    mutationFn: () => setOpeningFloat({ date, counts }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['mahaprasad-cash-drawer', date] });
      toast.success('Opening float saved');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save float'),
  });

  const total = DENOMS.reduce((s, d) => s + d * (Number(counts[String(d)]) || 0), 0);

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Set Opening Float</p>
      <div className="grid grid-cols-2 gap-2">
        {DENOMS.map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 w-10 text-right">₹{d}</span>
            <span className="text-gray-400 text-xs">×</span>
            <input
              type="number" min={0} max={999}
              value={counts[String(d)]}
              onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: Math.max(0, parseInt(e.target.value) || 0) }))}
              className="input text-sm text-center w-16 py-1"
            />
            <span className="text-xs text-gray-400 w-14">= ₹{fmt(d * (Number(counts[String(d)]) || 0))}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-blue-200">
        <span className="text-sm font-bold text-blue-800">Total: ₹{fmt(total)}</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-ghost border text-sm px-3 py-1.5 flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="btn bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> Save Float
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main CashDrawer component ─────────────────────────────────────────────────
export default function CashDrawer({ date }) {
  const qc = useQueryClient();
  const [open,         setOpen]         = useState(true);
  const [showFloat,    setShowFloat]    = useState(false);
  const [showSummary,  setShowSummary]  = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mahaprasad-cash-drawer', date],
    queryFn:  () => getCashDrawer(date),
    staleTime: 15 * 1000,
  });

  const drawer         = data?.data?.data;
  const counts         = drawer?.counts          || {};
  const openingCounts  = drawer?.openingCounts   || {};
  const receivedCounts = drawer?.receivedCounts  || {};
  const changeCounts   = drawer?.changeCounts    || {};
  const total          = drawer?.total  ?? DENOMS.reduce((s, d) => s + d * (counts[String(d)] || 0), 0);
  const cashTotal      = drawer?.cashTotal  || 0;
  const upiTotal       = drawer?.upiTotal   || 0;

  const hasAnySummary = DENOMS.some(
    (d) => (receivedCounts[String(d)] || 0) > 0 || (changeCounts[String(d)] || 0) > 0
  );

  const adjustMut = useMutation({
    mutationFn: ({ denomination, delta }) => adjustDrawer({ date, denomination, delta }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['mahaprasad-cash-drawer', date] }),
    onError:    (e) => toast.error(e.response?.data?.message || 'Failed to adjust'),
  });

  if (isLoading) return null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2">
          <Vault className="h-4 w-4 text-green-600" />
          Cash Drawer
          {!drawer?.isFloatSet && (
            <span className="text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Float not set
            </span>
          )}
        </span>
        <span className="flex items-center gap-3">
          <span className={`text-base font-black ${total > 0 ? 'text-green-700' : 'text-gray-400'}`}>
            ₹{fmt(total)}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          {/* Float form or set-float button */}
          {showFloat ? (
            <FloatForm date={date} currentCounts={counts} onClose={() => setShowFloat(false)} />
          ) : (
            <button onClick={() => setShowFloat(true)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Edit3 className="h-3 w-3" />
              {drawer?.isFloatSet ? 'Reset opening float' : 'Set opening float'}
            </button>
          )}

          {/* Denomination grid */}
          <div className="divide-y divide-gray-50">
            {DENOMS.map((d) => {
              const count   = counts[String(d)] || 0;
              const subtotal = d * count;
              return (
                <div key={d} className="flex items-center gap-3 py-2">
                  <span className="w-12 text-right text-sm font-semibold text-gray-700">₹{d}</span>
                  <span className="text-gray-400 text-xs">×</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustMut.mutate({ denomination: d, delta: -1 })}
                      disabled={count === 0 || adjustMut.isPending}
                      className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 text-sm font-bold flex items-center justify-center">
                      −
                    </button>
                    <span className={`w-8 text-center text-sm font-bold tabular-nums ${count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>
                      {count}
                    </span>
                    <button
                      onClick={() => adjustMut.mutate({ denomination: d, delta: 1 })}
                      disabled={adjustMut.isPending}
                      className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600 hover:bg-green-50 transition-colors text-sm font-bold flex items-center justify-center">
                      +
                    </button>
                  </div>
                  <span className={`ml-auto text-sm tabular-nums font-medium ${subtotal === 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                    ₹{fmt(subtotal)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total bar */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">Total in drawer</span>
            <span className="text-lg font-black text-green-700">₹{fmt(total)}</span>
          </div>

          {/* Day Summary toggle */}
          <button type="button" onClick={() => setShowSummary((v) => !v)}
            className="w-full flex items-center justify-between pt-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />
              Day Summary
              {!hasAnySummary && <span className="font-normal text-gray-400">(no transactions yet)</span>}
            </span>
            {showSummary ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>

          {showSummary && (
            <div className="space-y-3">
              {/* Denomination breakdown table */}
              <div className="rounded-lg border border-gray-100 overflow-hidden text-xs">
                {/* Header */}
                <div className="grid grid-cols-[3rem_1fr_1fr_1fr_1fr] gap-0 bg-gray-50 px-3 py-1.5 text-gray-500 font-semibold uppercase tracking-wide">
                  <span></span>
                  <span className="text-right">Opening</span>
                  <span className="text-right text-green-700">+ Received</span>
                  <span className="text-right text-red-600">− Change</span>
                  <span className="text-right text-blue-700">Net</span>
                </div>
                {DENOMS.map((d) => {
                  const opening  = openingCounts[String(d)]  || 0;
                  const received = receivedCounts[String(d)] || 0;
                  const change   = changeCounts[String(d)]   || 0;
                  const net      = received - change;
                  if (opening === 0 && received === 0 && change === 0) return null;
                  return (
                    <div key={d} className="grid grid-cols-[3rem_1fr_1fr_1fr_1fr] gap-0 px-3 py-1.5 border-t border-gray-50 tabular-nums">
                      <span className="font-semibold text-gray-700">₹{d}</span>
                      <span className="text-right text-gray-500">{opening > 0 ? `${opening}` : '—'}</span>
                      <span className={`text-right font-medium ${received > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                        {received > 0 ? `+${received}` : '—'}
                      </span>
                      <span className={`text-right font-medium ${change > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {change > 0 ? `−${change}` : '—'}
                      </span>
                      <span className={`text-right font-bold ${net > 0 ? 'text-blue-700' : net < 0 ? 'text-red-700' : 'text-gray-400'}`}>
                        {net > 0 ? `+${net}` : net < 0 ? `${net}` : '0'}
                      </span>
                    </div>
                  );
                })}
                {!hasAnySummary && (
                  <div className="px-3 py-3 text-center text-gray-400 border-t border-gray-50">No cash transactions recorded today</div>
                )}
              </div>

              {/* Collection totals */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide mb-0.5">Cash</p>
                  <p className="text-base font-black text-green-800 tabular-nums">₹{fmt(cashTotal)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-center">
                  <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide mb-0.5">UPI</p>
                  <p className="text-base font-black text-blue-800 tabular-nums">₹{fmt(upiTotal)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-0.5">Total</p>
                  <p className="text-base font-black text-gray-800 tabular-nums">₹{fmt(cashTotal + upiTotal)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
