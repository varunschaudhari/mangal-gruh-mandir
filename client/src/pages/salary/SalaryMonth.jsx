import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calculator, Lock, LockOpen, CheckCircle2, AlertTriangle, FileText, FileSpreadsheet,
  Landmark, Banknote, Printer, Trash2, RefreshCw, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import {
  deleteSalaryDraft, downloadSalaryFile, editSalaryLine, finalizeSalary, getSalaryRun, markSalaryPaid, prepareSalary, reopenSalary,
} from '../../api/salary.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { fCurrency, fDate, fDateTime, localDateStr } from '../../utils/formatters.js';
import { saveFile } from '../../utils/fileSaver.js';
import { printHtml } from '../../utils/printHtml.js';
import { payslipsHtml } from '../../utils/payslip.js';
import { useT } from '../../i18n/index.jsx';
import { fDays, shiftMonth, thisMonth } from '../attendance/attendanceUi.jsx';

// One month's salary: work it out from the attendance, adjust by hand, finalise, download the
// bank / PF / ESI files and payslips, then mark it paid (which records it in Expenses).

const rs = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const prevMonth = () => shiftMonth(thisMonth(), -1);

const STATUS = {
  none:      { label: 'Not worked out yet', cls: 'bg-gray-100 text-gray-600' },
  draft:     { label: 'Draft', cls: 'bg-amber-100 text-amber-800' },
  finalized: { label: 'Finalised', cls: 'bg-blue-100 text-blue-800' },
  paid:      { label: 'Paid', cls: 'bg-green-100 text-green-800' },
};

export const WARNINGS = {
  no_bank: 'No bank details — paid in cash',
  no_uan: 'No UAN — left out of the PF file',
  no_esic: 'No ESIC number — left out of the ESI file',
  esi_above_ceiling: 'Salary above the ESI limit — no ESI',
  no_gender: 'Gender not set — men\'s PT slabs used',
  negative_net: 'Deductions are more than the pay',
};

const FILES = [
  { kind: 'register.xlsx', label: 'Salary register', icon: FileSpreadsheet, draft: true },
  { kind: 'bank.xlsx', label: 'Bank transfer sheet (Excel)', icon: Landmark },
  { kind: 'bank.csv', label: 'Bank transfer sheet (CSV)', icon: Landmark },
  { kind: 'ecr.txt', label: 'PF return — ECR file', icon: FileText },
  { kind: 'esi.xlsx', label: 'ESI monthly contribution', icon: FileSpreadsheet },
];

function Tile({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="card px-3 py-2.5">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] leading-tight text-gray-500">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function LineSheet({ line, view, canEdit, onClose, onPayslip }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    otherEarning: line.otherEarning || '', otherEarningNote: line.otherEarningNote || '',
    otherDeduction: line.otherDeduction || '', otherDeductionNote: line.otherDeductionNote || '',
    paymentMode: line.paymentMode,
    recoveries: Object.fromEntries((line.recoveries || []).map((r) => [String(r.advance), r.amount])),
  });
  const advances = view.advances.filter((a) => String(a.staff) === String(line.staff));
  const mut = useMutation({
    mutationFn: () => editSalaryLine(view.month, line.staff, {
      otherEarning: Number(form.otherEarning) || 0, otherEarningNote: form.otherEarningNote,
      otherDeduction: Number(form.otherDeduction) || 0, otherDeductionNote: form.otherDeductionNote,
      paymentMode: form.paymentMode,
      ...(advances.length ? { recoveries: advances.map((a) => ({ advance: a._id, amount: Number(form.recoveries[String(a._id)]) || 0 })) } : {}),
    }),
    onSuccess: (res) => {
      qc.setQueryData(['salary', 'run', view.month], res);
      toast.success(t('Saved'));
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  const Row = ({ label, value, strong, tone = '' }) => (
    <div className={`flex justify-between gap-3 py-1 text-sm ${strong ? 'font-semibold' : ''} ${tone}`}><span>{label}</span><span className="whitespace-nowrap">{value}</span></div>
  );

  return (
    <Sheet open onClose={onClose} title={line.name} size="lg"
      footer={(
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onPayslip([line])} className="btn-secondary flex items-center gap-1.5"><Printer className="h-4 w-4" />{t('Payslip')}</button>
          {canEdit && <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary ml-auto">{mut.isPending ? t('Saving...') : t('Save')}</button>}
        </div>
      )}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          {t('{paid} of {days} days paid', { paid: fDays(line.paidDays), days: line.daysInMonth })}
          {line.unpaidDays + line.lateCut > 0 && <> · <span className="text-red-600">{t('{n} unpaid', { n: fDays(line.unpaidDays + line.lateCut) })}</span></>}
          {line.paidLeave > 0 && <> · {t('{n} paid leave', { n: fDays(line.paidLeave) })}</>}
          {' · '}{t('Monthly salary {a} (basic {b})', { a: rs(line.monthlySalary), b: rs(line.basicSalary) })}
        </p>
        {line.warnings?.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {line.warnings.map((w) => <li key={w} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{t(WARNINGS[w] || w)}</li>)}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Earnings')}</p>
            <Row label={t('Basic')} value={rs(line.earnedBasic)} />
            <Row label={t('Allowances')} value={rs(line.earnedOther)} />
            {line.overtime > 0 && <Row label={t('Overtime')} value={rs(line.overtime)} />}
            {line.otherEarning > 0 && <Row label={t('Other earning')} value={rs(line.otherEarning)} />}
            <div className="mt-1 border-t pt-1"><Row label={t('Gross pay')} value={rs(line.gross)} strong /></div>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Deductions')}</p>
            {line.pfApplicable && <Row label="PF" value={rs(line.pfEmployee)} />}
            {line.esiApplicable && <Row label="ESI" value={rs(line.esiEmployee)} />}
            <Row label={t('Professional Tax')} value={rs(line.pt)} />
            {line.advanceRecovery > 0 && <Row label={t('Advance recovery')} value={rs(line.advanceRecovery)} />}
            {line.otherDeduction > 0 && <Row label={t('Other deduction')} value={rs(line.otherDeduction)} />}
            <div className="mt-1 border-t pt-1"><Row label={t('Total deductions')} value={rs(line.totalDeductions)} strong /></div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3">
          <span className="font-semibold text-green-800">{t('Net pay')}</span>
          <span className="text-2xl font-bold text-green-800">{rs(line.netPay)}</span>
        </div>
        {(line.pfEmployer > 0 || line.esiEmployer > 0) && (
          <p className="text-xs text-gray-500">{t('Temple also pays: PF {pf} · ESI {esi}', { pf: rs(line.pfEmployer), esi: rs(line.esiEmployer) })}</p>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-700">{t('Change this month')}</p>
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <input type="number" min={0} inputMode="numeric" value={form.otherEarning} onChange={(e) => setForm({ ...form, otherEarning: e.target.value })} className="input" placeholder={t('Other earning ₹')} aria-label={t('Other earning')} />
              <input value={form.otherEarningNote} onChange={(e) => setForm({ ...form, otherEarningNote: e.target.value })} className="input" placeholder={t('What for — e.g. festival bonus')} />
              <input type="number" min={0} inputMode="numeric" value={form.otherDeduction} onChange={(e) => setForm({ ...form, otherDeduction: e.target.value })} className="input" placeholder={t('Other deduction ₹')} aria-label={t('Other deduction')} />
              <input value={form.otherDeductionNote} onChange={(e) => setForm({ ...form, otherDeductionNote: e.target.value })} className="input" placeholder={t('What for — e.g. damaged item')} />
            </div>
            {advances.map((a) => (
              <label key={a._id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 text-gray-600">{t('Advance of {amount} on {date} — {left} left', { amount: rs(a.amount), date: fDate(a.date, 'dd MMM'), left: rs(a.outstanding) })}</span>
                <span className="relative w-28">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                  <input type="number" min={0} max={a.outstanding} inputMode="numeric" value={form.recoveries[String(a._id)] ?? ''} onChange={(e) => setForm({ ...form, recoveries: { ...form.recoveries, [String(a._id)]: e.target.value } })} className="input pl-7" aria-label={t('Recover this month')} />
                </span>
              </label>
            ))}
            <div className="flex gap-1.5">
              {[['bank', 'Bank transfer', Landmark], ['cash', 'Cash', Banknote]].map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, paymentMode: k })}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${form.paymentMode === k ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                  <Icon className="h-4 w-4" />{t(label)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function PaidSheet({ month, onClose, onDone }) {
  const t = useT();
  const [paidOn, setPaidOn] = useState(localDateStr());
  const [paymentRef, setPaymentRef] = useState('');
  const mut = useMutation({
    mutationFn: () => markSalaryPaid(month, { paidOn, paymentRef }),
    onSuccess: (res) => { toast.success(t('Marked as paid — recorded in Expenses')); onDone(res); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });
  return (
    <Sheet open onClose={onClose} title={t('Mark salary as paid')} size="sm"
      footer={<button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary w-full">{t('Mark as paid')}</button>}>
      <div className="space-y-3">
        <div><label className="label">{t('Paid on')}</label><input type="date" className="input" value={paidOn} max={localDateStr()} onChange={(e) => setPaidOn(e.target.value)} /></div>
        <div><label className="label">{t('Bank reference (optional)')}</label><input className="input" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder={t('Batch / UTR number')} /></div>
        <p className="text-xs text-gray-500">{t('Net pay is recorded in Expenses (bank and cash separately). PF, ESI and PT dues are added for approval once their challans are paid.')}</p>
      </div>
    </Sheet>
  );
}

export default function SalaryMonth() {
  const t = useT();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can('salary:manage');
  const isMobile = useIsMobile();
  // Salary is usually done for the month just ended
  const [month, setMonth] = useState(new Date().getDate() <= 15 ? prevMonth() : thisMonth());
  const [openLine, setOpenLine] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'finalize' | 'reopen' | 'delete'
  const [paying, setPaying] = useState(false);
  const [search, setSearch] = useState('');

  const key = ['salary', 'run', month];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => getSalaryRun(month) });
  const view = data?.data?.data;
  const run = view?.run;
  const status = run?.status || 'none';
  const totals = view?.totals;
  const q = search.trim().toLowerCase();
  const lines = useMemo(() => (run?.lines || []).filter((l) => !q || l.name.toLowerCase().includes(q) || l.staffCode.toLowerCase().includes(q)), [run, q]);
  const warned = (run?.lines || []).filter((l) => l.warnings?.length);

  const after = (msg) => (res) => {
    qc.setQueryData(key, res);
    qc.invalidateQueries({ queryKey: ['salary', 'runs'] });
    if (msg) toast.success(t(msg));
    setConfirm(null);
  };
  const fail = (err) => toast.error(t(err.response?.data?.message || 'Failed'));
  // The month is over once the night shift starting on its last evening is done: 10 AM on the 1st
  const [yy, mm] = month.split('-').map(Number);
  const overAt = new Date(yy, mm, 1, 10, 0);
  const notOver = new Date() < overAt;
  const prep = useMutation({ mutationFn: () => prepareSalary(month), onSuccess: after('Salary worked out from attendance'), onError: fail });
  const fin = useMutation({ mutationFn: () => finalizeSalary(month, { confirmIssues: openIssues }), onSuccess: after('Salary finalised'), onError: fail });
  const reo = useMutation({ mutationFn: () => reopenSalary(month), onSuccess: after('Reopened for changes'), onError: fail });
  const del = useMutation({
    mutationFn: () => deleteSalaryDraft(month),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success(t('Draft deleted')); setConfirm(null); },
    onError: fail,
  });

  const download = async (kind) => {
    try {
      const res = await downloadSalaryFile(month, kind);
      await saveFile(new Blob([res.data]), `salary-${month}-${kind}`);
    } catch (err) {
      const text = await err.response?.data?.text?.().catch(() => '');
      toast.error((text && JSON.parse(text).message) || t('Download failed'));
    }
  };
  const payslips = (forLines) => printHtml(payslipsHtml(forLines, { label: view.label, temple: view.temple, t }), {
    filename: forLines.length === 1 ? `Payslip-${forLines[0].staffCode}-${month}.pdf` : `Payslips-${month}.pdf`,
  });
  const cl = view?.checklist;
  const openIssues = Boolean(cl && (cl.pendingDoubles > 0 || cl.reviewDays > 0));

  return (
    <div className="space-y-4">
      <PageHeader title="Monthly Salary" breadcrumbs={[{ label: 'Salary' }, { label: 'Monthly Salary' }]} />

      <div className="card flex items-center gap-2 p-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-ghost p-2" aria-label={t('Previous month')}><ChevronLeft className="h-5 w-5" /></button>
        <div className="relative flex-1 text-center">
          <p className="text-base font-semibold text-gray-900">{fDate(`${month}-01`, 'MMMM yyyy')}</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[status].cls}`}>{t(STATUS[status].label)}</span>
          <input type="month" value={month} max={thisMonth()} aria-label={t('Month')} onChange={(e) => e.target.value && setMonth(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </div>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} className="btn-ghost p-2 disabled:opacity-30" aria-label={t('Next month')}><ChevronRight className="h-5 w-5" /></button>
      </div>

      {isLoading || !view ? <PageLoader /> : (
        <>
          {/* Before finalising: what the attendance still needs */}
          {cl && (cl.pendingDoubles > 0 || cl.reviewDays > 0 || cl.noSalary.length > 0 || warned.length > 0) && (
            <div className="card space-y-1.5 border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />{t('Check before finalising')}</p>
              {cl.pendingDoubles > 0 && <p>· <Link className="underline" to="/attendance/leave">{t('{n} double shifts waiting for a reward decision', { n: cl.pendingDoubles })}</Link></p>}
              {cl.reviewDays > 0 && <p>· <Link className="underline" to="/attendance/register">{t('{n} days with a missing punch', { n: cl.reviewDays })}</Link></p>}
              {cl.noSalary.length > 0 && <p>· <Link className="underline" to="/attendance/staff">{t('No salary set for: {names}', { names: cl.noSalary.map((s) => s.name).join(', ') })}</Link></p>}
              {warned.length > 0 && <p>· {t('{n} people have notes (bank, UAN, ESIC or gender missing) — open them to see', { n: warned.length })}</p>}
            </div>
          )}

          {/* Actions */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {status === 'none' && (
                <button onClick={() => prep.mutate()} disabled={prep.isPending} className="btn-primary flex items-center gap-1.5">
                  <Calculator className="h-4 w-4" />{prep.isPending ? t('Working out…') : t('Work out salary from attendance')}
                </button>
              )}
              {status === 'draft' && (
                <>
                  <button onClick={() => setConfirm('finalize')} disabled={notOver} title={notOver ? t('Can be finalised from {date}', { date: fDateTime(overAt) }) : undefined}
                    className="btn-primary flex items-center gap-1.5"><Lock className="h-4 w-4" />{t('Finalise')}</button>
                  <button onClick={() => prep.mutate()} disabled={prep.isPending} className="btn-secondary flex items-center gap-1.5"><RefreshCw className={`h-4 w-4 ${prep.isPending ? 'animate-spin' : ''}`} />{t('Recalculate from attendance')}</button>
                  <button onClick={() => setConfirm('delete')} className="btn-ghost flex items-center gap-1.5 text-red-600"><Trash2 className="h-4 w-4" />{t('Delete draft')}</button>
                </>
              )}
              {status === 'finalized' && (
                <>
                  <button onClick={() => setPaying(true)} className="btn-primary flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />{t('Mark as paid')}</button>
                  <button onClick={() => setConfirm('reopen')} className="btn-secondary flex items-center gap-1.5"><LockOpen className="h-4 w-4" />{t('Reopen')}</button>
                </>
              )}
            </div>
          )}

          {canManage && status === 'draft' && notOver && (
            <p className="text-sm text-gray-500">{t('This month isn’t over yet — the salary can be finalised from {date}.', { date: fDateTime(overAt) })}</p>
          )}

          {status === 'none' && (
            <div className="card px-4 py-10 text-center text-sm text-gray-500">
              <Calculator className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              {t('Salary for this month has not been worked out yet.')}
              {cl && <p className="mt-1 text-xs text-gray-400">{t('{n} staff in the attendance this month.', { n: cl.staffCount })}</p>}
            </div>
          )}

          {run && totals && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label={t('Net pay')} value={rs(totals.netPay)} tone="text-green-700" sub={t('Bank {b} · Cash {c}', { b: rs(totals.bank), c: rs(totals.cash) })} />
                <Tile label={t('Gross pay')} value={rs(totals.gross)} sub={t('{n} staff', { n: totals.people })} />
                <Tile label={t('Deductions')} value={rs(totals.totalDeductions)} tone="text-red-600" sub={`PF ${rs(totals.pfEmployee)} · ESI ${rs(totals.esiEmployee)} · PT ${rs(totals.pt)}`} />
                <Tile label={t('Total cost to temple')} value={rs(totals.employerCost)} sub={t('incl. employer PF {pf} + ESI {esi}', { pf: rs(totals.pfEmployer), esi: rs(totals.esiEmployer) })} />
              </div>

              {/* Files — the register any time, the rest once final */}
              <div className="card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">{t('Payslips and files')}</p>
                  <button onClick={() => payslips(run.lines)} className="btn-secondary flex items-center gap-1.5 px-3 text-sm"><Printer className="h-4 w-4" />{t('All payslips')}</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {FILES.filter((f) => f.draft || status !== 'draft').map(({ kind, label, icon: Icon }) => (
                    <button key={kind} onClick={() => download(kind)} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <Icon className="h-4 w-4 shrink-0 text-primary-600" />{t(label)}
                    </button>
                  ))}
                </div>
                {status === 'draft' && <p className="mt-2 text-xs text-gray-400">{t('Bank, PF and ESI files are available once the salary is finalised.')}</p>}
                {status === 'paid' && (
                  <p className="mt-2 text-xs text-gray-500">
                    {t('Paid on {date}', { date: fDate(run.paidOn) })}{run.paymentRef && ` · ${run.paymentRef}`}
                    {run.expenses?.length > 0 && <> · {t('Expenses')}: {run.expenses.map((e) => <Link key={e._id} to={`/expenses/${e._id}`} className="ml-1 font-mono text-primary-600 underline">{e.expenseNumber}</Link>)}</>}
                  </p>
                )}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name or code')} className="input pl-9" />
              </div>

              {isMobile ? (
                <div className="space-y-2.5">
                  {lines.map((l) => (
                    <button key={l.staff} onClick={() => setOpenLine(l)} className="card flex w-full items-center gap-3 p-3.5 text-left active:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[15px] font-medium text-gray-900">
                          {l.name}{l.warnings?.length > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {t('{paid}/{days} days', { paid: fDays(l.paidDays), days: l.daysInMonth })} · {t('Gross')} {rs(l.gross)} · {t('Deductions')} {rs(l.totalDeductions)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold text-green-700">{rs(l.netPay)}</p>
                        <p className="text-[11px] text-gray-400">{l.paymentMode === 'cash' ? t('Cash') : t('Bank')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        {['Staff', 'Paid days', 'Gross', 'PF', 'ESI', 'PT', 'Advance', 'Other', 'Net pay', 'Mode'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h === 'PF' || h === 'ESI' || h === 'PT' ? h : t(h)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => (
                        <tr key={l.staff} onClick={() => setOpenLine(l)} className="cursor-pointer hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <p className="flex items-center gap-1.5 font-medium text-gray-900">{l.name}{l.warnings?.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title={l.warnings.map((w) => t(WARNINGS[w] || w)).join('\n')} />}</p>
                            <p className="text-xs text-gray-400">{l.staffCode}{l.designation && ` · ${l.designation}`}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{fDays(l.paidDays)}/{l.daysInMonth}</td>
                          <td className="px-3 py-2 text-right">{rs(l.gross)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.pfEmployee ? rs(l.pfEmployee) : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.esiEmployee ? rs(l.esiEmployee) : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.pt ? rs(l.pt) : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.advanceRecovery ? rs(l.advanceRecovery) : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{l.otherDeduction || l.otherEarning ? `${l.otherEarning ? `+${rs(l.otherEarning)}` : ''}${l.otherDeduction ? ` −${rs(l.otherDeduction)}` : ''}` : '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{rs(l.netPay)}</td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500">{l.paymentMode === 'cash' ? t('Cash') : t('Bank')}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-3 py-2">{t('Total')}</td><td />
                        <td className="px-3 py-2 text-right">{rs(totals.gross)}</td>
                        <td className="px-3 py-2 text-right">{rs(totals.pfEmployee)}</td>
                        <td className="px-3 py-2 text-right">{rs(totals.esiEmployee)}</td>
                        <td className="px-3 py-2 text-right">{rs(totals.pt)}</td>
                        <td className="px-3 py-2 text-right">{rs(totals.advanceRecovery)}</td>
                        <td className="px-3 py-2 text-right">{totals.otherDeduction ? `−${rs(totals.otherDeduction)}` : ''}</td>
                        <td className="px-3 py-2 text-right text-green-700">{rs(totals.netPay)}</td><td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-400">
                {t('Salary = monthly salary ÷ days in month × paid days. PF is on basic salary (up to ₹15,000), ESI on gross pay for salaries up to ₹21,000, Professional Tax by the state slabs.')}
              </p>
            </>
          )}
        </>
      )}

      {openLine && view && (
        <LineSheet key={`${openLine.staff}-${status}`} line={(run?.lines || []).find((l) => l.staff === openLine.staff) || openLine} view={view}
          canEdit={canManage && status === 'draft'} onClose={() => setOpenLine(null)} onPayslip={payslips} />
      )}
      {paying && <PaidSheet month={month} onClose={() => setPaying(false)} onDone={(res) => { after()(res); setPaying(false); }} />}
      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm === 'finalize' ? fin : confirm === 'reopen' ? reo : del).mutate()}
        loading={fin.isPending || reo.isPending || del.isPending}
        title={confirm === 'finalize' ? 'Finalise salary' : confirm === 'reopen' ? 'Reopen salary' : 'Delete draft'}
        message={`${t(confirm === 'finalize'
          ? 'The salary will be locked. Bank, PF and ESI files and payslips can then be downloaded.'
          : confirm === 'reopen' ? 'The salary can be changed again. Files already downloaded will be out of date.' : 'The draft and any amounts typed in by hand will be removed.')}${
          confirm === 'finalize' && openIssues
            ? ` ${t('Some days still have a missing punch (paid as a full day) or a double shift without a decision (no reward) — see the list above.')}`
            : ''}`}
        confirmLabel={confirm === 'finalize' ? (openIssues ? 'Finalise anyway' : 'Finalise') : confirm === 'reopen' ? 'Reopen' : 'Delete'}
        confirmClass={confirm === 'delete' ? 'btn-danger' : 'btn-primary'}
      />
    </div>
  );
}
