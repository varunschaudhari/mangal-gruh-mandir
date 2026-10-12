import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Armchair, CalendarDays, Info, ListOrdered, UserCheck, UserX } from 'lucide-react';
import Spinner from '../../ui/Spinner.jsx';
import { getAttendanceReport, getBookingOptions } from '../../../api/booking.api.js';
import { localDateStr } from '../../../utils/formatters.js';
import { useIsMobile } from '../../../hooks/useMediaQuery.js';
import haptics from '../../../utils/haptics.js';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { HallBadge } from '../counter/bits.jsx';
import { addDays, fmtDay, fmtRange, presetRange, sevaLabel } from '../registerUtils.js';

// Fill rate (seats booked against seats on offer) and no-shows (booked, never checked in at the
// hall) by puja date — see attendanceReport() on the server.

const PRESETS = [
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];
const rangeFor = (key, today) => (key === 'last7' ? { from: addDays(today, -6), to: today }
  : key === 'last30' ? { from: addDays(today, -29), to: today } : presetRange(key, today));

const pct = (v) => (v == null ? '—' : `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`);
const fillColor = (v) => (v == null ? 'bg-gray-200' : v >= 90 ? 'bg-green-500' : v >= 50 ? 'bg-primary-500' : 'bg-amber-400');

const Meter = ({ value, color }) => (
  <div className="flex items-center gap-2">
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value || 0)}%` }} />
    </div>
    <span className="w-12 text-right text-xs font-semibold tabular-nums text-gray-700">{pct(value)}</span>
  </div>
);

const Tile = ({ label, value, sub, icon: Icon, tone }) => (
  <div className={`card min-w-0 border-l-4 p-2.5 sm:p-4 ${tone}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 whitespace-nowrap text-lg font-bold leading-6 text-gray-800 sm:text-2xl">{value}</p>
        {sub && <p className="text-[11px] leading-tight text-gray-500">{sub}</p>}
      </div>
      <Icon className="h-5 w-5 shrink-0 text-gray-300 max-sm:hidden" />
    </div>
  </div>
);

const Card = ({ title, icon: Icon, children, right }) => (
  <div className="card min-w-0 p-3 sm:p-4">
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary-600" />
      <h3 className="flex-1 text-sm font-semibold text-gray-700">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

export default function AttendanceReport() {
  const t = useT();
  const { lang } = useLanguage();
  const isMobile = useIsMobile();
  const today = localDateStr();
  const [preset, setPreset] = useState('last30');
  const [custom, setCustom] = useState(() => rangeFor('last30', today));
  const range = preset === 'custom' ? custom : rangeFor(preset, today);

  const { data: options } = useQuery({
    queryKey: ['booking-options'], queryFn: getBookingOptions, select: (r) => r.data.data, staleTime: 5 * 60 * 1000,
  });
  const sevaById = useMemo(() => new Map((options?.allSevaTypes || []).map((s) => [String(s._id), s])), [options]);
  const { data: d, isLoading, isFetching } = useQuery({
    queryKey: ['booking-attendance', range.from, range.to],
    queryFn: () => getAttendanceReport({ from: range.from, to: range.to }).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });

  // "Mon", "सोम" … for weekday numbers (11 Oct 2026 was a Sunday).
  const weekdayName = (n) => new Date(2026, 9, 11 + n).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'short' });
  const dayTick = (k) => (isMobile ? String(Number(k.slice(8, 10))) : fmtDay(k, { day: '2-digit', month: 'short' }));
  const yesterday = addDays(today, -1);
  const noShowLink = d && `/bookings?${new URLSearchParams({
    dateField: 'puja', range: 'custom', from: d.from, to: d.to < today ? d.to : yesterday, arrival: 'noshow',
  })}`;

  const fill = d?.fill;
  const ns = d?.noShow;
  const counted = ns?.scannedDays > 0;

  return (
    <div className="space-y-4">
      {/* Period (by puja date) */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {PRESETS.map((p) => (
              <button key={p.key} type="button"
                onClick={() => { haptics.select(); if (p.key === 'custom') setCustom(range); setPreset(p.key); }}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-3.5 max-sm:py-2 max-sm:text-sm ${
                  preset === p.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`}>
                {t(p.label)}
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            {[['from', 'From'], ['to', 'To']].map(([k, label]) => (
              <label key={k} className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t(label)}</span>
                <input type="date" value={custom[k]} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))} className="input" />
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">
          {t('By puja date')}{d ? ` · ${fmtRange(d.from, d.to)}` : ''}{isFetching && !isLoading ? ' …' : ''}
        </p>
      </div>

      {isLoading || !d ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Tile label={t('Fill rate')} value={pct(fill.totals.fill)} icon={Armchair} tone="border-primary-500"
              sub={t('{n} of {total} seats booked', { n: fill.totals.booked.toLocaleString('en-IN'), total: fill.totals.capacity.toLocaleString('en-IN') })} />
            <Tile label={t('No-shows')} value={counted ? pct(ns.totals.noShowRate) : '—'} icon={UserX} tone="border-red-400"
              sub={counted ? t('{n} of {total} bookings did not come', { n: ns.totals.noShow, total: ns.totals.bookings }) : t('Starts once the hall scans slips')} />
            <Tile label={t('Came')} value={counted ? ns.totals.arrived.toLocaleString('en-IN') : '—'} icon={UserCheck} tone="border-green-500"
              sub={counted ? t('{n} people', { n: ns.totals.arrivedPeople.toLocaleString('en-IN') }) : ''} />
            <Tile label={t('Days counted')} value={ns.scannedDays} icon={CalendarDays} tone="border-sky-400"
              sub={ns.unscannedDays ? t(ns.unscannedDays === 1 ? '1 day without scanning left out' : '{n} days without scanning left out', { n: ns.unscannedDays }) : t('Past days with check-ins')} />
          </div>

          {(!counted || ns.unscannedDays > 0) && (
            <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {!counted
                ? t('No-shows appear once devotees are checked in at the hall. No past day in this period has any check-ins yet.')
                : ns.unscannedDays === 1
                  ? t('1 day had bookings but no check-ins at all (the hall did not scan) — it is left out of the no-show count.')
                  : t('{n} days had bookings but no check-ins at all (the hall did not scan) — they are left out of the no-show count.', { n: ns.unscannedDays })}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('Fill rate by batch')} icon={Armchair}>
              {!fill.byBatch.length ? <p className="py-6 text-center text-sm text-gray-400">{t('No batches in this period')}</p> : (
                <ul className="space-y-2.5">
                  {fill.byBatch.map((b) => (
                    <li key={b.key}>
                      <div className="mb-1 flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{b.label}</span>
                        <HallBadge hall={b.hall} />
                        <span className="shrink-0 text-xs tabular-nums text-gray-500">{b.booked}/{b.capacity}</span>
                      </div>
                      <Meter value={b.fill} color={fillColor(b.fill)} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-gray-400">{t('Seats on offer use each batch’s capacity as set now in Booking Setup. Closed days are left out.')}</p>
            </Card>

            <Card title={t('Fill rate by day of the week')} icon={CalendarDays}>
              <ul className="space-y-2.5">
                {fill.byWeekday.map((w) => (
                  <li key={w.weekday} className="flex items-center gap-3 text-sm">
                    <span className="w-12 shrink-0 font-medium text-gray-700">{weekdayName(w.weekday)}</span>
                    <div className="flex-1"><Meter value={w.fill} color={fillColor(w.fill)} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title={t('Fill rate by puja date')} icon={CalendarDays}>
            <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
              {/* `rate`, not `fill`: Recharts would read a `fill` field as the bar colour */}
              <BarChart data={fill.daily.map((x) => ({ date: x.date, rate: x.fill }))} maxBarSize={28} margin={{ top: 5, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v) => [pct(v), t('Fill rate')]} labelFormatter={(k) => fmtDay(k, { weekday: 'short', day: '2-digit', month: 'short' })} cursor={{ fill: '#fff7ed' }} />
                <Bar dataKey="rate" fill="#ea580c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {counted && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title={t('No-shows by batch')} icon={UserX}
                  right={<Link to={noShowLink} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"><ListOrdered className="h-3.5 w-3.5" /> {t('See who did not come')}</Link>}>
                  <ul className="space-y-2.5">
                    {ns.byBatch.map((b) => (
                      <li key={`${b.label}|${b.hall}`}>
                        <div className="mb-1 flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{b.label}</span>
                          <HallBadge hall={b.hall} />
                          <span className="shrink-0 text-xs tabular-nums text-gray-500">{t('{n} of {total}', { n: b.noShow, total: b.bookings })}</span>
                        </div>
                        <Meter value={b.noShowRate} color="bg-red-400" />
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title={t('No-shows by seva')} icon={UserX}>
                  <ul className="space-y-2.5">
                    {ns.bySeva.map((s) => (
                      <li key={String(s.sevaType)}>
                        <div className="mb-1 flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{sevaLabel(lang, sevaById, s.sevaType, s.name)}</span>
                          <span className="shrink-0 text-xs tabular-nums text-gray-500">{t('{n} of {total}', { n: s.noShow, total: s.bookings })}</span>
                        </div>
                        <Meter value={s.noShowRate} color="bg-red-400" />
                      </li>
                    ))}
                  </ul>
                  <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-gray-400">{t('By day of the week')}</h4>
                  <ul className="space-y-2">
                    {ns.byWeekday.map((w) => (
                      <li key={w.weekday} className="flex items-center gap-3 text-sm">
                        <span className="w-12 shrink-0 font-medium text-gray-700">{weekdayName(w.weekday)}</span>
                        <div className="flex-1"><Meter value={w.noShowRate} color="bg-red-400" /></div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card title={t('No-shows by puja date')} icon={CalendarDays}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[22rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2 font-semibold">{t('Puja date')}</th>
                        <th className="px-2 py-1.5 text-right font-semibold">{t('Bookings')}</th>
                        <th className="px-2 py-1.5 text-right font-semibold">{t('Came')}</th>
                        <th className="py-1.5 pl-2 text-right font-semibold">{t('No-shows')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...ns.daily].reverse().map((r) => (
                        <tr key={r.date} className={r.scanned ? '' : 'text-gray-400'}>
                          <td className="py-2 pr-2">{fmtDay(r.date, { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.bookings}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.scanned ? r.arrived : '—'}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">
                            {r.scanned ? <span className={r.noShow ? 'font-semibold text-red-600' : 'text-green-700'}>{r.noShow}</span> : <span className="text-xs">{t('Not scanned')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
