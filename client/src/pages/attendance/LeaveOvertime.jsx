import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarPlus, Gift, Search, Clock, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { getMonth, markLeave, setMonthAdjustment } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fCurrency, fDate, localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';
import {
  DayDetailSheet, DoubleDecision, LEAVE_TYPES, MonthLockNote, codeCell, coverText, dayCode, fDays, fMinutes, shiftMonth, thisMonth,
} from './attendanceUi.jsx';

// Leave balances, late penalties, double-shift rewards and overtime for one month — what
// management checks before salary. Everything here is worked out from the attendance.

function Stat({ label, value, tone = 'text-gray-900', sub, onPage = false }) {
  return (
    <div className={onPage ? 'card px-3 py-2.5' : 'rounded-xl bg-gray-50 px-3 py-2'}>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] leading-tight text-gray-500">{label}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

const DASH = <span className="text-gray-300">—</span>;

function OvertimeForm({ staffId, month, overtime, extraMinutes }) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(overtime.monthly || '');
  const [note, setNote] = useState(overtime.note || '');
  const mut = useMutation({
    mutationFn: () => setMonthAdjustment({ staff: staffId, month, overtimeAmount: Number(amount) || 0, note }),
    onSuccess: () => { toast.success(t('Saved')); qc.invalidateQueries({ queryKey: ['attendance'] }); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-2">
      <p className="text-xs text-gray-500">{t('Extra time worked this month: {h}. There is no fixed rate — enter the amount management decides.', { h: fMinutes(extraMinutes) })}</p>
      <div className="flex flex-wrap gap-2">
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
          <input type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="input pl-7" aria-label={t('Overtime amount')} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} className="input min-w-32 flex-1" />
        <button disabled={mut.isPending} className="btn-primary">{t('Save')}</button>
      </div>
    </form>
  );
}

function StaffLeaveSheet({ staff, data, month, canApprove, onPick, onClose }) {
  const t = useT();
  const l = data.leave[staff._id];
  const tt = data.totals[staff._id];
  const days = Object.values(data.days[staff._id] || {});
  const absences = days.filter((d) => d.cover);
  const lates = days.filter((d) => d.lateMinutes > 0);
  const doubles = days.filter((d) => d.double);

  return (
    <Sheet open onClose={onClose} title={staff.name} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('Paid days')} value={fDays(l.paidDays)} tone="text-green-700" sub={t('of {n}', { n: l.daysInMonth })} />
          <Stat label={t('Paid leave used')} value={`${fDays(l.paidUsed)}/${l.paidEntitled}`} tone="text-teal-700" />
          <Stat label={t('Extra leave left')} value={fDays(l.extraAvailable)} tone="text-cyan-700" />
          <Stat label={t('Unpaid days')} value={fDays(l.unpaid + l.lateCut)} tone="text-red-600" sub={l.lateCut ? t('incl. {n} for late', { n: fDays(l.lateCut) }) : undefined} />
        </div>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Absences and leave')}</h3>
          {absences.length === 0 ? <p className="text-sm text-gray-400">{t('None this month.')}</p> : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {absences.map((d) => (
                <li key={d.date}>
                  <button onClick={() => onPick(d.date)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                    <span className={`w-9 shrink-0 rounded py-0.5 text-center text-xs font-bold ${codeCell(dayCode(d))}`}>{dayCode(d)}</span>
                    <span className="w-20 shrink-0 text-sm text-gray-700">{fDate(d.date, 'EEE dd MMM')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{coverText(d, t)}{d.note && <span className="text-gray-400"> — {d.note}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {l.credits.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Extra leave earned')}</h3>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {l.credits.map((c) => (
                <li key={c.date} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Gift className={`h-4 w-4 shrink-0 ${c.expired ? 'text-gray-300' : 'text-cyan-600'}`} />
                  <span className="flex-1 text-gray-700">{t('Double shift on {date}', { date: fDate(c.date, 'dd MMM') })}</span>
                  <span className={`text-xs ${c.expired && c.remaining ? 'text-red-600' : 'text-gray-500'}`}>
                    {c.remaining === 0 ? t('used') : c.expired ? t('expired {date}', { date: fDate(c.expiresOn, 'dd MMM') }) : t('use by {date}', { date: fDate(c.expiresOn, 'dd MMM') })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {lates.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('Late marks')} {data.latePenalty?.enabled && <span className="font-normal normal-case text-gray-400">· {t('first {n} free', { n: data.latePenalty.freeLates })}</span>}
            </h3>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {lates.map((d) => (
                <li key={d.date}>
                  <button onClick={() => onPick(d.date)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50">
                    <Clock className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="w-20 shrink-0 text-gray-700">{fDate(d.date, 'EEE dd MMM')}</span>
                    <span className="flex-1 text-orange-700">{t('{m} min late', { m: d.lateMinutes })}</span>
                    {d.lateCut && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">{t('half day cut')}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-gray-400">{t('Tap a day to waive its late mark.')}</p>
          </section>
        )}

        {doubles.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Double shifts')}</h3>
            <ul className="space-y-2">
              {doubles.map((d) => (
                <li key={d.date} className="rounded-xl border border-purple-100 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-800">{fDate(d.date, 'EEE dd MMM')} <span className="font-normal text-gray-500">· {fMinutes(d.workedMinutes)}</span></p>
                  <DoubleDecision staffId={staff._id} date={d.date} decision={d.decision} eligible={staff.doubleShiftEligible} canApprove={canApprove} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Overtime')}</h3>
          <p className="mb-2 text-sm text-gray-700">
            {t('Double shifts {a} + extra hours {b} = {total}', { a: fCurrency(l.overtime.doubles), b: fCurrency(l.overtime.monthly), total: fCurrency(l.overtime.total) })}
          </p>
          {canApprove && <OvertimeForm key={month} staffId={staff._id} month={month} overtime={l.overtime} extraMinutes={tt.extraMinutes} />}
        </section>
      </div>
    </Sheet>
  );
}

function MarkLeaveSheet({ staffOptions, onClose }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ staff: '', from: localDateStr(), to: localDateStr(), leaveType: 'paid', note: '' });
  const mut = useMutation({
    mutationFn: () => markLeave(form),
    onSuccess: (res) => {
      const { marked, skipped } = res.data.data;
      toast.success(skipped ? t('Leave marked for {n} days ({s} off days skipped)', { n: marked, s: skipped }) : t('Leave marked for {n} days', { n: marked }));
      qc.invalidateQueries({ queryKey: ['attendance'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });
  return (
    <Sheet open onClose={onClose} title={t('Mark leave')} size="md"
      footer={<button onClick={() => mut.mutate()} disabled={mut.isPending || !form.staff || !form.note.trim()} className="btn-primary w-full sm:w-auto">{t('Mark leave')}</button>}>
      <div className="space-y-4">
        <div>
          <label className="label">{t('Staff')}</label>
          <SearchableSelect value={form.staff} onChange={(v) => setForm({ ...form, staff: v })} options={staffOptions} placeholder={t('Choose a person')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">{t('From')}</label><input type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} /></div>
          <div><label className="label">{t('To')}</label><input type="date" className="input" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LEAVE_TYPES).map(([k, label]) => (
            <button type="button" key={k} onClick={() => setForm({ ...form, leaveType: k })}
              className={`rounded-full border px-3 py-1.5 text-sm ${form.leaveType === k ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
              {t(label)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{t('Paid leave uses this month\'s paid leaves, then extra leave. Weekly offs and holidays in between are skipped.')}</p>
        <input className="input" placeholder={t('Reason (required)')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
    </Sheet>
  );
}

export default function LeaveOvertime() {
  const t = useT();
  const { can } = usePermissions();
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState('');
  const [openStaff, setOpenStaff] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [marking, setMarking] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['attendance', 'month', month], queryFn: () => getMonth({ month }) });
  const res = data?.data?.data;
  const canApprove = can('attendance:approve') && !res?.locked;   // a month with finalised salary is frozen
  const q = search.trim().toLowerCase();
  const staff = useMemo(() => (res?.staff || []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.staffCode.toLowerCase().includes(q)), [res, q]);
  const pending = useMemo(() => (res?.staff || []).flatMap((s) => Object.values(res.days[s._id] || {})
    .filter((d) => d.double && !d.decision).map((d) => ({ staff: s, day: d }))), [res]);
  const sums = useMemo(() => {
    const out = { unpaid: 0, overtime: 0, review: 0 };
    for (const s of res?.staff || []) {
      const l = res.leave[s._id];
      out.unpaid += l.unpaid + l.lateCut;
      out.overtime += l.overtime.total;
      out.review += l.reviewDays;
    }
    return out;
  }, [res]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave & Overtime"
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Leave & Overtime' }]}
        actions={can('attendance:write') && (
          <button onClick={() => setMarking(true)} className="btn-primary flex items-center gap-1.5"><CalendarPlus className="h-4 w-4" />{t('Mark leave')}</button>
        )}
      />
      <MonthLockNote locked={res?.locked} />

      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-ghost p-2" aria-label={t('Previous month')}><ChevronLeft className="h-5 w-5" /></button>
        <div className="relative flex-1 text-center">
          <p className="text-base font-semibold text-gray-900">{fDate(`${month}-01`, 'MMMM yyyy')}</p>
          <input type="month" value={month} aria-label={t('Month')} onChange={(e) => e.target.value && setMonth(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </div>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month > thisMonth()} className="btn-ghost p-2 disabled:opacity-30" aria-label={t('Next month')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      {isLoading || !res ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat onPage label={t('Unpaid days (all staff)')} value={fDays(sums.unpaid)} tone="text-red-600" />
            <Stat onPage label={t('Overtime to pay')} value={fCurrency(sums.overtime)} tone="text-green-700" />
            <Stat onPage label={t('Days to fix (missing punch)')} value={sums.review} tone={sums.review ? 'text-orange-600' : 'text-gray-900'} />
          </div>

          {pending.length > 0 && (
            <section className="card space-y-3 border-purple-200 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-purple-800"><Gift className="h-4 w-4" />{t('Double shifts waiting for a decision ({n})', { n: pending.length })}</h2>
              <ul className="space-y-3">
                {pending.map(({ staff: s, day }) => (
                  <li key={`${s._id}${day.date}`} className="rounded-xl bg-purple-50/50 p-3">
                    <p className="mb-2 text-sm"><b className="font-medium text-gray-900">{s.name}</b> <span className="text-gray-500">· {fDate(day.date, 'EEE dd MMM')} · {fMinutes(day.workedMinutes)}</span></p>
                    <DoubleDecision staffId={s._id} date={day.date} decision={null} eligible={s.doubleShiftEligible} canApprove={canApprove} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name or code')} className="input pl-9" />
          </div>

          {staff.length === 0 ? <div className="card px-4 py-12 text-center text-sm text-gray-500">{t('No staff added yet.')}</div> : (
            <div className="card overflow-hidden">
              {/* One row per person; on phones the columns fold into a compact two-line row */}
              <div className="hidden grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] gap-2 border-b bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 md:grid">
                <span>{t('Staff')}</span><span className="text-center">{t('Paid leave')}</span><span className="text-center">{t('Extra leave left')}</span>
                <span className="text-center">{t('Unpaid|salary')}</span><span className="text-center">{t('Late')}</span><span className="text-center">{t('Overtime')}</span><span className="text-center">{t('Paid days')}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {staff.map((s) => {
                  const l = res.leave[s._id];
                  return (
                    <li key={s._id}>
                      <button onClick={() => setOpenStaff(s)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-gray-50 md:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] md:gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium text-gray-900">{s.name}</span>
                          <span className="flex flex-wrap gap-x-3 text-xs text-gray-500 md:hidden">
                            <span>{t('Paid leave')} <b className="text-teal-700">{fDays(l.paidUsed)}/{l.paidEntitled}</b></span>
                            {l.extraAvailable > 0 && <span>{t('Extra')} <b className="text-cyan-700">{fDays(l.extraAvailable)}</b></span>}
                            {l.unpaid > 0 && <span>{t('Unpaid|salary')} <b className="text-red-600">{fDays(l.unpaid)}</b></span>}
                            {l.lateMarks > 0 && <span>{t('Late')} <b className="text-orange-600">{l.lateMarks}</b>{l.lateCut > 0 && <b className="text-red-600"> −{fDays(l.lateCut)}</b>}</span>}
                            {l.overtime.total > 0 && <span className="flex items-center"><IndianRupee className="h-3 w-3" /><b className="text-green-700">{l.overtime.total}</b></span>}
                          </span>
                          {l.pendingDoubles > 0 && <span className="mt-0.5 inline-block rounded bg-purple-100 px-1.5 text-[11px] font-medium text-purple-700">{t('{n} double shift to decide', { n: l.pendingDoubles })}</span>}
                        </span>
                        <span className="hidden text-center text-sm text-teal-700 md:block">{fDays(l.paidUsed)}/{l.paidEntitled}</span>
                        <span className="hidden text-center text-sm text-cyan-700 md:block">{l.extraAvailable ? fDays(l.extraAvailable) : DASH}</span>
                        <span className="hidden text-center text-sm font-semibold text-red-600 md:block">{l.unpaid ? fDays(l.unpaid) : DASH}</span>
                        <span className="hidden text-center text-sm text-orange-600 md:block">{l.lateMarks || DASH}{l.lateCut > 0 && <span className="text-red-600"> (−{fDays(l.lateCut)})</span>}</span>
                        <span className="hidden text-center text-sm text-green-700 md:block">{l.overtime.total ? fCurrency(l.overtime.total) : DASH}</span>
                        <span className="text-right md:text-center">
                          <span className="block text-lg font-bold text-green-800 md:text-base">{fDays(l.paidDays)}</span>
                          <span className="block text-[11px] text-gray-400 md:hidden">{t('Paid days')}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-400">
            {t('Each month brings {n} paid leaves (or the person\'s own number); unused ones lapse. Absences use paid leave first, then extra leave, then become unpaid.', { n: res.staff.length ? res.leave[res.staff[0]._id].paidEntitled : 3 })}
            {res.latePenalty?.enabled ? ` ${t('Late penalty is on: after {n} late marks a month, each late mark cuts half a day.', { n: res.latePenalty.freeLates })}` : ` ${t('Late penalty is off (Shifts & Machine → Rules).')}`}
          </p>
        </>
      )}

      {openStaff && res && (
        <StaffLeaveSheet staff={openStaff} data={res} month={month} canApprove={canApprove} onPick={(d) => setOpenDay({ staffId: openStaff._id, date: d })} onClose={() => setOpenStaff(null)} />
      )}
      {marking && res && (
        <MarkLeaveSheet staffOptions={res.staff.map((s) => ({ value: s._id, label: s.name, sub: s.designation || s.staffCode }))} onClose={() => setMarking(false)} />
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

