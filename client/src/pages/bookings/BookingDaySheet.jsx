import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown, Printer, RefreshCw, Search, Users, Phone, StickyNote, CalendarDays, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner, { PageLoader } from '../../components/ui/Spinner.jsx';
import BookingDetailSheet from '../../components/booking/BookingDetailSheet.jsx';
import { getBookingOptions, getDaySheet } from '../../api/booking.api.js';
import { printHtml } from '../../utils/printHtml.js';
import { localDateStr } from '../../utils/formatters.js';
import { hallHeading } from '../../utils/halls.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import haptics from '../../utils/haptics.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { PRINT_FONT, addDays, esc, fmtDay, fmtTime, nBookings, nPeople, parseDay } from '../../components/booking/registerUtils.js';

// Who is coming on a puja date, batch by batch and in serial order — what the hall
// volunteers check devotees against and what the pujaris read the sankalp from.

const groupKey = (g) => (g.batch ? String(g.batch) : `${g.label}|${g.hall}|${g.sevaNames.join(',')}`);
const rashiLine = (d) => [d?.rashi, d?.nakshatra].filter(Boolean).join(' / ');

/** The coming Tuesday after `today` (Tuesdays are the busiest day at a Mangal temple). */
const nextTuesday = (today) => {
  const dow = parseDay(today).getDay();
  return addDays(today, ((2 - dow + 7) % 7) || 7);
};

/** A4 "Sankalp list" for the pujaris — one batch per page, Devanagari-safe fonts. */
function sankalpHtml({ date, groups, t, sevaText, hallText }) {
  const dateLong = fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const totalBookings = groups.reduce((s, g) => s + g.bookings.length, 0);
  const totalPeople = groups.reduce((s, g) => s + g.people, 0);
  const printed = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const section = (g) => {
    const many = g.sevaNames.length > 1;
    const rows = g.bookings.map((b) => `
      <tr>
        <td class="sr">${esc(b.serialNo ?? '')}</td>
        <td><b>${esc(b.devotee?.name)}</b>${many ? `<div class="sub">${esc(sevaText(b.sevaName))}</div>` : ''}</td>
        <td>${esc(b.devotee?.gotra)}</td>
        <td>${esc((b.devotee?.familyNames || []).join(', '))}</td>
        <td>${esc(rashiLine(b.devotee))}</td>
        <td class="num">${esc(b.peopleCount || 1)}</td>
        <td class="mono">${esc(b.receiptNo)}<br>${esc(b.devotee?.phone)}</td>
        <td>${esc(b.notes)}</td>
        <td class="tick"></td>
      </tr>`).join('');
    return `
    <section class="batch">
      <div class="bh">
        <div>
          <h2>${esc(g.label || t('No fixed time'))}${g.hall ? ` &nbsp;·&nbsp; ${esc(hallText(g.hall))}` : ''}</h2>
          <p>${esc(g.sevaNames.map(sevaText).join(', '))}</p>
        </div>
        <div class="count">${esc(nBookings(t, g.bookings.length))}<br><span>${esc(nPeople(t, g.people))}</span></div>
      </div>
      <table>
        <colgroup><col style="width:30px"><col style="width:20%"><col style="width:11%"><col style="width:17%"><col style="width:13%">
          <col style="width:44px"><col style="width:112px"><col><col style="width:22px"></colgroup>
        <thead><tr>
          <th class="sr">${esc(t('Sr.'))}</th><th>${esc(t('Name'))}</th><th>${esc(t('Gotra'))}</th><th>${esc(t('Family names'))}</th>
          <th>${esc(t('Rashi / Nakshatra'))}</th><th class="num">${esc(t('People'))}</th><th>${esc(t('Receipt / Phone'))}</th>
          <th>${esc(t('Notes'))}</th><th class="tick">✓</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  };

  return `<!DOCTYPE html><html lang="mr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t('Sankalp list'))} — ${esc(date)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: ${PRINT_FONT}; color: #111827; margin: 0; padding: 16px; font-size: 11.5px; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #ea580c; padding-bottom: 6px; margin-bottom: 10px; }
  header h1 { margin: 0; font-size: 18px; color: #9a3412; }
  header p { margin: 2px 0 0; font-size: 12px; color: #374151; }
  header .tot { text-align: right; font-size: 12px; color: #374151; }
  .batch + .batch { break-before: page; page-break-before: always; }
  .bh { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 4px 0 6px; }
  .bh h2 { margin: 0; font-size: 16px; }
  .bh p { margin: 2px 0 0; color: #4b5563; }
  .bh .count { text-align: right; font-weight: 700; font-size: 13px; } .bh .count span { font-weight: 400; color: #4b5563; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: #fff7ed; text-align: left; font-size: 10.5px; color: #7c2d12; border: 1px solid #fdba74; padding: 4px 5px; }
  td { border: 1px solid #e5e7eb; padding: 4px 5px; vertical-align: top; overflow-wrap: anywhere; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .sr { text-align: center; font-weight: 700; font-size: 13px; }
  .num { text-align: center; }
  .mono { font-family: Consolas, "Courier New", monospace; font-size: 9.5px; color: #374151; overflow-wrap: normal; }
  th.num, th.sr { padding-left: 2px; padding-right: 2px; }
  .sub { font-size: 10px; color: #6b7280; }
  footer { margin-top: 12px; font-size: 10px; color: #6b7280; text-align: right; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
  <div><h1>श्री मंगळग्रह मंदिर, अमळनेर</h1><p><b>${esc(t('Sankalp list'))}</b> — ${esc(dateLong)}</p></div>
  <div class="tot">${esc(nBookings(t, totalBookings))} · ${esc(nPeople(t, totalPeople))}</div>
</header>
${groups.map(section).join('')}
<footer>${esc(t('Printed {time}', { time: printed }))}</footer>
<script>window.onload = () => window.print()</script>
</body></html>`;
}

export default function BookingDaySheet() {
  const t = useT();
  const { lang } = useLanguage();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const today = localDateStr();
  const [date, setDate] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : today));
  const [search, setSearch] = useState('');
  const [hall, setHall] = useState('');
  const [toggled, setToggled] = useState(() => new Set());
  const [selected, setSelected] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['booking-day-sheet', date],
    queryFn: () => getDaySheet(date),
    select: (r) => r.data.data,
    refetchInterval: date >= today ? 60 * 1000 : false, // the counter keeps booking for today / ahead
  });
  const { data: options } = useQuery({
    queryKey: ['booking-options'], queryFn: getBookingOptions, select: (r) => r.data.data, staleTime: 5 * 60 * 1000,
  });

  const sevaByName = useMemo(() => new Map((options?.allSevaTypes || options?.sevaTypes || []).map((s) => [s.name, s])), [options]);
  const sevaText = (name) => (lang === 'mr' && sevaByName.get(name)?.nameMr) || name;
  const hallText = (code) => hallHeading(t, code, options?.settings?.hallNames, lang);

  const groups = useMemo(() => data?.groups || [], [data]);
  const halls = useMemo(() => [...new Set(groups.map((g) => g.hall).filter(Boolean))].sort(), [groups]);
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => groups
    .filter((g) => !hall || g.hall === hall)
    .map((g) => {
      if (!q) return g;
      const bookings = g.bookings.filter((b) => [b.devotee?.name, b.receiptNo, b.devotee?.phone, b.devotee?.gotra, ...(b.devotee?.familyNames || [])]
        .some((v) => String(v || '').toLowerCase().includes(q)));
      return { ...g, bookings, people: bookings.reduce((s, b) => s + (b.peopleCount || 1), 0) };
    })
    .filter((g) => g.bookings.length > 0), [groups, hall, q]);

  const totalBookings = shown.reduce((s, g) => s + g.bookings.length, 0);
  const totalPeople = shown.reduce((s, g) => s + g.people, 0);

  // Phones start with batches folded (a Tuesday has a dozen); searching opens them.
  const defaultOpen = !isMobile || !!q || shown.length <= 2;
  const isOpen = (g) => defaultOpen !== toggled.has(groupKey(g));
  const toggle = (g) => {
    haptics.tap();
    setToggled((prev) => { const next = new Set(prev); const k = groupKey(g); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  };

  const changeDate = (d) => {
    if (!d) return;
    haptics.select();
    setDate(d);
    setToggled(new Set());
    setParams(d === today ? {} : { date: d }, { replace: true });
  };

  const print = (list) => {
    if (!list.length) return;
    printHtml(sankalpHtml({ date, groups: list, t, sevaText, hallText }), {
      filename: list.length === 1
        ? `Sankalp-${date}-${(list[0].hall || 'batch')}-${(list[0].label || '').split(' ')[0].replace(/\W/g, '')}.pdf`
        : `Sankalp-${date}.pdf`,
    });
  };

  const isToday = date === today;
  const tuesday = nextTuesday(today);
  const quick = [
    { key: today, label: t('Today') },
    { key: addDays(today, 1), label: t('Tomorrow') },
    ...(tuesday !== addDays(today, 1) ? [{ key: tuesday, label: t('Next Tuesday') }] : []),
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <PageHeader
        title="Day Sheet"
        subtitle="Devotees for each batch, in serial order"
        breadcrumbs={[{ label: 'Pooja Booking' }, { label: 'Day Sheet' }]}
        actions={(
          <>
            <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary max-sm:hidden" aria-label={t('Refresh')}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
            </button>
            <button onClick={() => print(shown)} disabled={!shown.length} className="btn-primary whitespace-nowrap">
              <Printer className="h-4 w-4" /> {hall ? t('Print hall {hall}', { hall }) : t('Print sankalp list')}
            </button>
          </>
        )}
      />

      {/* Date switcher — tap the date to pick any day */}
      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => changeDate(addDays(date, -1))} className="btn-ghost p-2" aria-label={t('Previous day')}><ChevronLeft className="h-5 w-5" /></button>
        <div className="relative flex-1 text-center">
          <span className="block text-base font-semibold text-gray-900">
            {isToday ? t('Today') : date === addDays(today, 1) ? t('Tomorrow') : parseDay(date).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'long' })}
          </span>
          <span className="block text-xs text-gray-500">{fmtDay(date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <input
            type="date" value={date} aria-label={t('Date')}
            onChange={(e) => changeDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <button onClick={() => changeDate(addDays(date, 1))} className="btn-ghost p-2" aria-label={t('Next day')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-none sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {quick.map((c) => (
              <button key={c.key} onClick={() => changeDate(c.key)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium max-sm:py-2 ${date === c.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                {c.label}
              </button>
            ))}
            {halls.length > 1 && <span className="mx-1 w-px self-stretch bg-gray-200" aria-hidden="true" />}
            {halls.length > 1 && ['', ...halls].map((h) => (
              <button key={h || 'all'} onClick={() => { haptics.select(); setHall(h); }} title={h ? hallText(h) : undefined}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium max-sm:py-2 ${hall === h ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                {h ? t('Hall {hall}', { hall: h }) : t('All halls')}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} enterKeyHint="search"
            placeholder={t('Name, receipt, phone or gotra')} className="input pl-9" />
        </div>
      </div>

      {/* Day totals */}
      {!isLoading && groups.length > 0 && (
        <div className="card flex divide-x divide-gray-100 overflow-hidden text-center">
          {[
            [t('Batches'), shown.length],
            [t('Bookings'), totalBookings],
            [t('People'), totalPeople],
          ].map(([label, value]) => (
            <div key={label} className="flex-1 px-2 py-2.5">
              <p className="text-xl font-bold text-gray-900">{value.toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? <PageLoader /> : shown.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <CalendarDays className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">{q || hall ? t('No bookings match your search.') : t('No bookings for this date.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((g) => {
            const open = isOpen(g);
            const many = g.sevaNames.length > 1;
            return (
              <div key={groupKey(g)} className="card overflow-hidden">
                {/* Batch header: tap to fold on phones */}
                <div className="flex items-center gap-2 border-b border-gray-100 bg-orange-50/60 px-3 py-2.5 sm:px-4">
                  <button onClick={() => toggle(g)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[15px] font-bold text-gray-900">{g.label || t('No fixed time')}</span>
                        {g.hall && <Badge variant="orange">{hallText(g.hall)}</Badge>}
                      </p>
                      <p className="truncate text-xs text-gray-600">{g.sevaNames.map(sevaText).join(', ')}</p>
                    </div>
                  </button>
                  <div className="shrink-0 text-right text-xs text-gray-600">
                    <p className="text-sm font-bold text-gray-900">{nBookings(t, g.bookings.length)}</p>
                    <p>{nPeople(t, g.people)}</p>
                    {g.capacity > 0 && <p className="text-gray-400">{t('Capacity {n}', { n: g.capacity })}</p>}
                    {g.arrived > 0 && <p className="font-semibold text-green-700">{t('{n} of {total} arrived', { n: g.arrived, total: g.bookings.length })}</p>}
                  </div>
                  <button onClick={() => print([g])} className="btn-ghost shrink-0 p-2" title={t('Print this batch')} aria-label={t('Print this batch')}>
                    <Printer className="h-4 w-4" />
                  </button>
                </div>

                {open && (isMobile ? (
                  <ul className="divide-y divide-gray-100">
                    {g.bookings.map((b) => (
                      <li key={b._id || b.receiptNo}>
                        <button onClick={() => { haptics.tap(); setSelected(b); }} className="flex w-full gap-3 px-3 py-2.5 text-left active:bg-gray-50">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white tabular-nums ${b.checkedInAt ? 'bg-green-600' : 'bg-gray-900'}`}>
                            {b.serialNo ?? '—'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="break-words font-semibold text-gray-900">{b.devotee?.name}</span>
                              {b.peopleCount > 1 && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-gray-600"><Users className="h-3 w-3" />{b.peopleCount}</span>
                              )}
                            </span>
                            {many && <span className="block text-xs text-primary-700">{sevaText(b.sevaName)}</span>}
                            {(b.devotee?.gotra || rashiLine(b.devotee)) && (
                              <span className="block text-xs text-gray-600">
                                {[b.devotee?.gotra && `${t('Gotra')}: ${b.devotee.gotra}`, rashiLine(b.devotee)].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            {b.devotee?.familyNames?.length > 0 && (
                              <span className="block text-xs text-gray-600">{t('Family')}: {b.devotee.familyNames.join(', ')}</span>
                            )}
                            <span className="block font-mono text-[11px] text-gray-400">{b.receiptNo} · {b.devotee?.phone}</span>
                            {b.checkedInAt && (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />{t('Checked in {time}', { time: fmtTime(b.checkedInAt) })}</span>
                            )}
                            {b.notes && (
                              <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700"><StickyNote className="mt-0.5 h-3 w-3 shrink-0" />{b.notes}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[56rem] table-fixed">
                      {/* Same widths in every batch, so the columns line up down the page */}
                      <colgroup>
                        <col className="w-[5%]" /><col className="w-[19%]" /><col className="w-[10%]" /><col className="w-[17%]" />
                        <col className="w-[13%]" /><col className="w-[7%]" /><col className="w-[14%]" /><col className="w-[15%]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="table-th px-2 text-center">{t('Sr.')}</th>
                          <th className="table-th">{t('Devotee')}</th>
                          <th className="table-th">{t('Gotra')}</th>
                          <th className="table-th">{t('Family names')}</th>
                          <th className="table-th">{t('Rashi / Nakshatra')}</th>
                          <th className="table-th px-2 text-center">{t('People')}</th>
                          <th className="table-th">{t('Receipt / Phone')}</th>
                          <th className="table-th">{t('Notes')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {g.bookings.map((b) => (
                          <tr key={b._id || b.receiptNo} onClick={() => setSelected(b)} className="cursor-pointer hover:bg-orange-50/50">
                            <td className={`table-td px-2 text-center text-base font-bold tabular-nums ${b.checkedInAt ? 'text-green-700' : 'text-gray-900'}`}>{b.serialNo ?? '—'}</td>
                            <td className="table-td break-words">
                              <p className="font-medium text-gray-900">{b.devotee?.name}</p>
                              {many && <p className="text-xs text-primary-700">{sevaText(b.sevaName)}</p>}
                              {b.checkedInAt && (
                                <p className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />{t('Checked in {time}', { time: fmtTime(b.checkedInAt) })}</p>
                              )}
                            </td>
                            <td className="table-td break-words">{b.devotee?.gotra || '—'}</td>
                            <td className="table-td break-words">{b.devotee?.familyNames?.join(', ') || '—'}</td>
                            <td className="table-td break-words">{rashiLine(b.devotee) || '—'}</td>
                            <td className="table-td px-2 text-center">{b.peopleCount || 1}</td>
                            <td className="table-td">
                              <p className="truncate font-mono text-xs text-gray-600">{b.receiptNo}</p>
                              <a href={`tel:${b.devotee?.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap text-gray-700 hover:text-primary-700">
                                <Phone className="h-3 w-3" />{b.devotee?.phone}
                              </a>
                            </td>
                            <td className="table-td break-words text-xs text-amber-800">{b.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {isFetching && !isLoading && <div className="flex justify-center"><Spinner size="sm" /></div>}

      <BookingDetailSheet booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
