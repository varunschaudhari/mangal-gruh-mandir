import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { downloadRegisterExcel, getMonth } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { fDate, localDateStr } from '../../utils/formatters.js';
import { saveFile } from '../../utils/fileSaver.js';
import { printHtml } from '../../utils/printHtml.js';
import { useT } from '../../i18n/index.jsx';
import {
  DayDetailSheet, MonthLockNote, STATUS, codeCell, dayCode, fDays, fMinutes, shiftMonth, thisMonth, weekdayOf,
} from './attendanceUi.jsx';
import { temple } from '../../utils/temple.js';

// Month at a glance: one row per person, a code per day, and the totals salary will use.

const LEGEND = 'P present · H half day · PL paid leave · EL extra leave · A absent (unpaid) · UL unpaid leave · WO weekly off · HO holiday · WP worked on off day · OD on duty · MP missing punch · + double shift · orange = late';

const STRIP = {
  present: 'bg-green-400', worked_off: 'bg-indigo-400', on_duty: 'bg-blue-400', half_day: 'bg-yellow-400',
  absent: 'bg-red-400', leave: 'bg-teal-400', missing_punch: 'bg-orange-400', off: 'bg-gray-300', holiday: 'bg-rose-300',
  working: 'bg-emerald-300', unscheduled: 'bg-purple-300',
};
// Absent days covered by leave are teal / cyan in the strip, unpaid ones red
const stripClass = (day) => {
  const c = dayCode(day);
  if (c === 'PL') return 'bg-teal-400';
  if (c === 'EL') return 'bg-cyan-400';
  if (c === 'UL') return 'bg-red-400';
  return STRIP[day?.status] || 'bg-gray-100';
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PDF_COLOURS = {
  P: '#dcfce7', H: '#fef9c3', A: '#fee2e2', UL: '#fee2e2', PL: '#ccfbf1', EL: '#cffafe', WO: '#f3f4f6', HO: '#ffe4e6',
  WP: '#e0e7ff', OD: '#dbeafe', MP: '#ffedd5',
};

function registerHtml({ title, dates, staff, days, totals, leave, t }) {
  const head = dates.map((d) => `<th>${Number(d.slice(8))}<br><small>${esc(t(fDate(d, 'EEE')).slice(0, 2))}</small></th>`).join('');
  const rows = staff.map((s) => {
    const cells = dates.map((d) => {
      const day = days[s._id]?.[d];
      const c = dayCode(day);
      const bg = PDF_COLOURS[c.replace('+', '')] || '#fff';
      return `<td style="background:${bg};${day?.lateMinutes ? 'color:#c2410c;font-weight:700' : ''}">${c}${day?.lateCut ? '<sup>½</sup>' : ''}</td>`;
    }).join('');
    const tt = totals[s._id];
    const l = leave[s._id];
    return `<tr><td class="name">${esc(s.name)}<br><small>${esc(s.staffCode)}</small></td>${cells}
      <td>${tt.presentValue}</td><td>${l.paidUsed}</td><td>${l.extraUsed}</td><td>${l.unpaid}</td><td>${l.lateCut}</td><td><b>${l.paidDays}</b></td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: 'Noto Sans Devanagari', Arial, sans-serif; margin: 12px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 2px; color: #c2410c; }
  p.sub { font-size: 10px; color: #6b7280; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 9px; }
  th, td { border: 1px solid #d1d5db; text-align: center; padding: 2px 1px; }
  th { background: #ea580c; color: #fff; font-weight: 600; }
  td.name { text-align: left; white-space: nowrap; padding: 2px 4px; font-size: 10px; }
  small { color: inherit; opacity: .7; font-size: 8px; }
  sup { color: #b91c1c; font-size: 7px; }
</style></head><body>
<h1>${esc(temple().name)} — ${esc(title)}</h1>
<p class="sub">${esc(t(LEGEND))} · <sup>½</sup> ${esc(t('half day cut for late'))}</p>
<table><thead><tr><th>${esc(t('Name'))}</th>${head}<th>${esc(t('Days worked'))}</th><th>PL</th><th>EL</th><th>${esc(t('Unpaid|salary'))}</th><th>${esc(t('Late cut'))}</th><th>${esc(t('Paid days'))}</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}

function StaffMonthSheet({ staff, data, onClose, onPick }) {
  const t = useT();
  const days = data.days[staff._id] || {};
  const l = data.leave[staff._id];
  const tt = data.totals[staff._id];
  const lead = (weekdayOf(data.dates[0]) + 6) % 7; // blanks before the 1st (weeks start Monday)
  return (
    <Sheet open onClose={onClose} title={staff.name} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[['Paid days', fDays(l.paidDays), 'text-green-700'], ['Paid leave', `${fDays(l.paidUsed)}/${l.paidEntitled}`, 'text-teal-700'],
            ['Unpaid|salary', fDays(l.unpaid), 'text-red-600'], ['Late', l.lateCut ? `${l.lateMarks} (−${fDays(l.lateCut)})` : l.lateMarks, 'text-orange-600']].map(([label, v, c]) => (
            <div key={label} className="rounded-xl bg-gray-50 py-2">
              <p className={`text-lg font-bold ${c}`}>{v}</p>
              <p className="text-[11px] text-gray-500">{t(label)}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="text-[10px] uppercase text-gray-400">{t(d)}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {data.dates.map((d) => {
            const day = days[d];
            const c = dayCode(day);
            return (
              <button key={d} onClick={() => onPick(d)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border border-gray-100 ${codeCell(c)} ${d === localDateStr() ? 'ring-2 ring-primary-400' : ''}`}>
                <span className="text-[10px] text-gray-400">{Number(d.slice(8))}</span>
                <span className={`text-xs font-bold ${day?.lateMinutes ? 'text-orange-600' : ''}`}>{c}</span>
                {day?.lateCut && <span className="absolute right-1 top-0.5 text-[9px] font-bold text-red-600">½</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          {t('Present {p} · Weekly off {wo} · Worked on off day {wp} · Double shifts {d} · Extra time {x}', {
            p: tt.present, wo: tt.off, wp: tt.workedOff, d: tt.doubles, x: fMinutes(tt.extraMinutes),
          })}
          {l.extraAvailable > 0 && <> · {t('Extra leave left {n}', { n: fDays(l.extraAvailable) })}</>}
        </p>
      </div>
    </Sheet>
  );
}

export default function Register() {
  const t = useT();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState('');
  const [openStaff, setOpenStaff] = useState(null);
  const [openDay, setOpenDay] = useState(null); // { staffId, date }
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'month', month],
    queryFn: () => getMonth({ month }),
  });
  const res = data?.data?.data;
  const q = search.trim().toLowerCase();
  const staff = useMemo(() => (res?.staff || []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.staffCode.toLowerCase().includes(q)), [res, q]);
  const holidayOn = useMemo(() => new Map((res?.holidays || []).map((h) => [h.date, h.name])), [res]);
  const title = `${t('Attendance Register')} — ${fDate(`${month}-01`, 'MMMM yyyy')}`;

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await downloadRegisterExcel({ month });
      await saveFile(new Blob([r.data]), `Attendance-${month}.xlsx`);
    } catch {
      toast.error(t('Export failed'));
    } finally {
      setExporting(false);
    }
  };
  const exportPdf = () => res && printHtml(registerHtml({ title, ...res, staff, t }), { filename: `Attendance-${month}.pdf`, width: 1123 });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly Register"
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Monthly Register' }]}
        actions={(
          <>
            <button onClick={exportExcel} disabled={exporting || !res} className="btn-secondary flex items-center gap-1.5 px-3">
              <FileSpreadsheet className="h-4 w-4" />{t('Excel')}
            </button>
            <button onClick={exportPdf} disabled={!res} className="btn-secondary flex items-center gap-1.5 px-3">
              <FileDown className="h-4 w-4" />{t('PDF')}
            </button>
          </>
        )}
      />
      <MonthLockNote locked={res?.locked} />

      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-ghost p-2" aria-label={t('Previous month')}><ChevronLeft className="h-5 w-5" /></button>
        <div className="relative flex-1 text-center">
          <p className="text-base font-semibold text-gray-900">{fDate(`${month}-01`, 'MMMM yyyy')}</p>
          <input type="month" value={month} max={shiftMonth(thisMonth(), 1)} aria-label={t('Month')} onChange={(e) => e.target.value && setMonth(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </div>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month > thisMonth()} className="btn-ghost p-2 disabled:opacity-30" aria-label={t('Next month')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name or code')} className="input pl-9" />
      </div>

      {isLoading || !res ? <PageLoader /> : staff.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500">{t('No staff added yet.')}</div>
      ) : isMobile ? (
        <div className="space-y-2.5">
          {staff.map((s) => {
            const l = res.leave[s._id];
            return (
              <button key={s._id} onClick={() => setOpenStaff(s)} className="card flex w-full items-center gap-3 p-3.5 text-left active:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-gray-900">{s.name}</p>
                  {/* The month at a glance: one little bar per day */}
                  <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
                    {res.dates.map((d) => <span key={d} className={`h-3 flex-1 rounded-[2px] ${stripClass(res.days[s._id]?.[d])}`} />)}
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>{t('Paid leave')} <b className="text-teal-700">{fDays(l.paidUsed)}/{l.paidEntitled}</b></span>
                    {l.extraUsed > 0 && <span>{t('Extra leave')} <b className="text-cyan-700">{fDays(l.extraUsed)}</b></span>}
                    <span>{t('Unpaid|salary')} <b className="text-red-600">{fDays(l.unpaid)}</b></span>
                    <span>{t('Late')} <b className="text-orange-600">{l.lateMarks}</b>{l.lateCut > 0 && <b className="text-red-600"> −{fDays(l.lateCut)}</b>}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold text-green-700">{fDays(l.paidDays)}</p>
                  <p className="text-[11px] text-gray-500">{t('Paid days')}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="sticky left-0 z-10 min-w-40 bg-gray-50 px-3 py-2 text-left font-semibold">{t('Staff')}</th>
                {res.dates.map((d) => (
                  <th key={d} title={holidayOn.get(d) || ''}
                    className={`min-w-7 px-0.5 py-1 text-center font-medium ${weekdayOf(d) === 0 ? 'text-red-500' : ''} ${holidayOn.has(d) ? 'bg-rose-50 text-rose-600' : ''} ${d === localDateStr() ? 'bg-orange-100 text-orange-700' : ''}`}>
                    <span className="block text-[11px] font-semibold">{Number(d.slice(8))}</span>
                    <span className="block text-[9px] uppercase">{t(fDate(d, 'EEE')).slice(0, 2)}</span>
                  </th>
                ))}
                {['Days worked', 'Paid leave', 'Extra leave', 'Unpaid|salary', 'Late cut', 'Paid days', 'Double', 'Extra time'].map((h) => (
                  <th key={h} className={`min-w-12 border-l border-gray-200 px-1.5 py-1 text-center font-semibold leading-tight ${h === 'Paid days' ? 'bg-green-50 text-green-800' : ''}`}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((s) => {
                const tt = res.totals[s._id];
                const l = res.leave[s._id];
                return (
                  <tr key={s._id} className="hover:bg-gray-50/60">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.staffCode}</p>
                    </td>
                    {res.dates.map((d) => {
                      const day = res.days[s._id]?.[d];
                      const c = dayCode(day);
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            onClick={() => setOpenDay({ staffId: s._id, date: d })}
                            title={day ? [t(STATUS[day.status]?.label || ''), day.holiday, day.lateMinutes && t('Late {m}m', { m: day.lateMinutes }), day.lateCut && t('half day cut'), day.note].filter(Boolean).join(' · ') : ''}
                            className={`relative h-7 w-full rounded font-semibold ${codeCell(c)} ${day?.lateMinutes ? 'text-orange-600' : ''} hover:ring-1 hover:ring-primary-300`}
                          >
                            {c}
                            {day?.overridden && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-blue-500" />}
                            {day?.lateCut && <span className="absolute left-0.5 top-0 text-[8px] font-bold text-red-600">½</span>}
                            {day?.double && !day.decision && <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-purple-500" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-l border-gray-200 text-center text-gray-700">{fDays(tt.presentValue)}</td>
                    <td className="text-center text-teal-700">{l.paidUsed ? `${fDays(l.paidUsed)}/${l.paidEntitled}` : ''}</td>
                    <td className="text-center text-cyan-700">{l.extraUsed ? fDays(l.extraUsed) : ''}</td>
                    <td className="text-center font-semibold text-red-600">{l.unpaid ? fDays(l.unpaid) : ''}</td>
                    <td className="text-center text-red-600">{l.lateCut ? fDays(l.lateCut) : ''}</td>
                    <td className="bg-green-50/60 text-center text-sm font-bold text-green-800">{fDays(l.paidDays)}</td>
                    <td className="text-center text-purple-600">{tt.doubles || ''}</td>
                    <td className="whitespace-nowrap px-1 text-center text-gray-600">{tt.extraMinutes ? fMinutes(tt.extraMinutes) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-gray-400">
        {t(LEGEND)}
        {' · '}{t('Blue dot = corrected by a supervisor · purple dot = double shift waiting for a decision · red ½ = half day cut for late.')}
        {' · '}{t('Paid days = days in month − unpaid days − late cuts. Absences use paid leave first, then extra leave.')}
      </p>

      {openStaff && res && (
        <StaffMonthSheet staff={openStaff} data={res} onClose={() => setOpenStaff(null)} onPick={(d) => setOpenDay({ staffId: openStaff._id, date: d })} />
      )}
      <DayDetailSheet
        key={openDay ? `${openDay.staffId}|${openDay.date}` : 'none'}
        staffId={openDay?.staffId}
        date={openDay?.date}
        shifts={res?.shifts || []}
        canWrite={can('attendance:write')}
        onClose={() => setOpenDay(null)}
      />
    </div>
  );
}
