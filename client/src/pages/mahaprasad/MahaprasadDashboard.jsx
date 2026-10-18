import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Globe, Monitor, Pencil, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMahaprasadDashboard, setMahaprasadTarget } from '../../api/mahaprasadDashboard.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

// How much Mahaprasad was given today against the day's total: persons on coupons sold (counter
// and online), plates served at the hall, what's still to be served, and the day hour by hour.
// The day's total is the daily cap in Settings → Mahaprasad — one number: coupon issuing stops at
// it, and admins (Settings permission) can change it here too. 0 = no limit, so no total.
// The same figures, big, for a TV: MahaprasadScreen.jsx.

// Chart colours: categorical slots 1–2 of the validated palette (dataviz skill) — sold, served
export const SOLD = '#2a78d6';
export const SERVED = '#eb6834';

const num = (n) => Number(n || 0).toLocaleString('en-IN');
const pct = (n, total) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);
const hourText = (h) => new Date(2000, 0, 1, h).toLocaleTimeString('en-IN', { hour: 'numeric' });
const timeText = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayText = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
// With only a few hours a capped width spreads each pair apart; a fixed one keeps it together
const barWidth = (hours) => (hours <= 8 ? { barSize: 18 } : { maxBarSize: 18 });

function Meter({ value, total, color, track }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: track }} role="presentation">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct(value, total)}%`, background: color }} />
    </div>
  );
}

function Tile({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// The day's total, saved as Settings → Mahaprasad daily cap (the same number in both places)
function TargetSheet({ open, onClose, data }) {
  const t = useT();
  const qc = useQueryClient();
  const [total, setTotal] = useState('');
  useEffect(() => {
    if (open && data) setTotal(String(data.target || 0));
  }, [open, data]);

  const save = useMutation({
    mutationFn: (target) => setMahaprasadTarget({ target }),
    onSuccess: (res) => {
      toast.success(t(res.data.message));
      qc.invalidateQueries({ queryKey: ['mahaprasad-dashboard'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Could not save')),
  });
  if (!data) return null;
  const whole = /^\d+$/.test(String(total).trim());

  return (
    <Sheet open={open} onClose={onClose} title={t('Day’s total')} size="sm">
      <div className="space-y-3">
        <label htmlFor="day-total" className="text-sm font-medium text-gray-700">{t('Prasad to be given in a day')}</label>
        <div className="flex gap-2">
          <input id="day-total" type="number" inputMode="numeric" min="0" value={total} onChange={(e) => setTotal(e.target.value)} className="input flex-1" />
          <button type="button" disabled={!whole || save.isPending} onClick={() => save.mutate(Number(total))} className="btn-primary">
            {t('Save')}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {t('This is the daily cap in Settings → Mahaprasad — the same number in both places. Coupon issuing stops at it, at the counters and online. 0 = no limit.')}
        </p>
      </div>
    </Sheet>
  );
}

export default function MahaprasadDashboard() {
  const t = useT();
  const { can } = usePermissions();
  const today = localDateStr();
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: ['mahaprasad-dashboard', date],
    queryFn: () => getMahaprasadDashboard(date).then((r) => r.data.data),
    refetchInterval: date === today ? 30_000 : false,
    staleTime: 10_000,
  });
  const d = q.data;

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input type="date" value={date} max={localDateStr(new Date(Date.now() + 30 * 864e5))} onChange={(e) => e.target.value && setDate(e.target.value)} className="input text-sm max-sm:min-w-0 max-sm:flex-1" aria-label={t('Date')} />
      <button type="button" onClick={() => q.refetch()} className="btn btn-ghost border text-sm" aria-label={t('Refresh')} title={t('Refresh')}>
        <RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} />
      </button>
      <Link to={`/mahaprasad/screen${date === today ? '' : `?date=${date}`}`} className="btn btn-ghost border text-sm flex items-center gap-1.5 whitespace-nowrap">
        <Monitor className="h-4 w-4" /> {t('TV screen')}
      </Link>
    </div>
  );

  if (q.isLoading) return <><PageHeader title="Mahaprasad Dashboard" actions={actions} /><PageLoader /></>;
  if (q.isError || !d) {
    return (
      <>
        <PageHeader title="Mahaprasad Dashboard" actions={actions} />
        <div className="card p-8 text-center text-gray-500">{q.error?.response?.data?.message || t('Could not load the dashboard')}</div>
      </>
    );
  }

  const isToday = date === today;
  return (
    <div className="space-y-4">
      <PageHeader title="Mahaprasad Dashboard" subtitle={dayText(d.date)}
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad/history' }, { label: 'Dashboard' }]} actions={actions} />

      {/* The headline: served against the day's total, with sold on the second bar */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-500">{t('Prasad served')}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-semibold text-gray-900 sm:text-6xl">{num(d.served)}</span>
              {d.limited && <span className="text-xl text-gray-500">{t('of {n}', { n: num(d.target) })}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              {t('Day’s total')}: <span className="font-semibold text-gray-900">{d.limited ? num(d.target) : t('No limit')}</span>
              <span className="ml-1 text-xs">({t('Settings daily cap')})</span>
            </p>
            {can('masters:write') && (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">
                <Pencil className="h-3.5 w-3.5" /> {t('Change')}
              </button>
            )}
          </div>
        </div>
        {!d.limited ? (
          <p className="mt-4 text-sm text-gray-500">{t('Set a day’s total to see how much is left.')}</p>
        ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERVED }} />{t('Served')}</span>
              <span>{pct(d.served, d.target)}%</span>
            </div>
            <Meter value={d.served} total={d.target} color={SERVED} track="#fde4d7" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOLD }} />{t('Sold')}</span>
              <span>{pct(d.sold.persons, d.target)}%</span>
            </div>
            <Meter value={d.sold.persons} total={d.target} color={SOLD} track="#dbe8f8" />
          </div>
        </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('Sold')} value={num(d.sold.persons)}
          sub={[t(d.sold.coupons === 1 ? '{n} coupon' : '{n} coupons', { n: num(d.sold.coupons) }),
            d.sold.online ? `${num(d.sold.online)} ${t('online')}` : null,
            d.sold.free ? `${num(d.sold.free)} ${t('Free')}` : null].filter(Boolean).join(' · ')} />
        <Tile label={t('Still to serve')} value={num(d.toServe)} sub={t('Sold, not scanned at the hall yet')} />
        {!d.limited
          ? <Tile label={t('Day’s total')} value={t('No limit')} sub={t('Set it with Change, or in Settings → Mahaprasad')} />
          : d.over > 0
            ? <Tile label={t('Over the day’s total')} value={`+${num(d.over)}`} tone="text-amber-700" sub={t('More sold than the total')} />
            : <Tile label={t('Left of the total')} value={num(d.left)} sub={t('Not sold yet')} />}
        <Tile label={t('Last served')} value={d.lastServedAt ? timeText(d.lastServedAt) : '—'}
          sub={isToday ? t('Updates every 30 seconds') : null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700">{t('Sold and served by hour')}</h2>
          {d.hours.length ? (
            <>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.hours.map((h) => ({ ...h, label: hourText(h.hour) }))} barGap={2} barCategoryGap="20%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef0f2" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#52514e' }} tickLine={false} axisLine={{ stroke: '#d6d6d3' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: '#52514e' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v, name) => [num(v), name]} />
                    {/* itemSorter null: sold then served, as drawn (the default sorts by name) */}
                    <Legend iconType="square" itemSorter={null} wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => <span style={{ color: '#52514e' }}>{value}</span>} />
                    {/* A fixed width for a few hours keeps each hour's pair side by side */}
                    <Bar dataKey="sold" name={t('Sold')} fill={SOLD} radius={[4, 4, 0, 0]} {...barWidth(d.hours.length)} />
                    <Bar dataKey="served" name={t('Served')} fill={SERVED} radius={[4, 4, 0, 0]} {...barWidth(d.hours.length)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-gray-500">{t('Show as table')}</summary>
                <table className="mt-2 w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">{t('Hour')}</th><th className="py-1 text-right">{t('Sold')}</th><th className="py-1 text-right">{t('Served')}</th></tr></thead>
                  <tbody className="tabular-nums">
                    {d.hours.map((h) => (
                      <tr key={h.hour} className="border-t border-gray-100"><td className="py-1">{hourText(h.hour)}</td><td className="py-1 text-right">{num(h.sold)}</td><td className="py-1 text-right">{num(h.served)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </details>
              {d.sold.earlier > 0 && (
                <p className="mt-2 text-xs text-gray-500">{t('{n} persons were sold before this day (online, in advance).', { n: num(d.sold.earlier) })}</p>
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">{t('Nothing sold or served yet this day.')}</p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700">{t('Sold by counter')}</h2>
          {d.counters.length ? (
            <ul className="mt-2 divide-y divide-gray-100">
              {d.counters.map((c) => (
                <li key={c.online ? 'online' : c.name} className="flex items-center gap-2 py-2 text-sm">
                  {c.online ? <Globe className="h-4 w-4 text-gray-400" /> : <Users className="h-4 w-4 text-gray-400" />}
                  <span className="flex-1 truncate">{c.online ? t('Online (devotees)') : c.name}</span>
                  <span className="tabular-nums font-semibold text-gray-900">{num(c.persons)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">{t('No coupons sold yet.')}</p>
          )}
        </section>
      </div>

      <TargetSheet open={editing} onClose={() => setEditing(false)} data={d} />
    </div>
  );
}
