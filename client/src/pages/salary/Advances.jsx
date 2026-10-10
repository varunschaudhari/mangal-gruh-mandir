import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, HandCoins } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { addAdvance, deleteAdvance, getAdvances } from '../../api/salary.api.js';
import { getStaffList } from '../../api/attendance.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fDate, localDateStr } from '../../utils/formatters.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

// Salary advances: money given ahead of salary and recovered from coming salaries.

const rs = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const MODES = [['cash', 'Cash'], ['bank', 'Bank transfer'], ['upi', 'UPI']];

function AddAdvanceSheet({ onClose }) {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['attendance', 'staff', 'active'], queryFn: () => getStaffList({ active: true }) });
  const staff = data?.data?.data || [];
  const [form, setForm] = useState({ staff: '', date: localDateStr(), amount: '', installment: '', mode: 'cash', note: '', recordExpense: true });
  const mut = useMutation({
    mutationFn: () => addAdvance({ ...form, amount: Number(form.amount), installment: Number(form.installment) || 0 }),
    onSuccess: () => {
      toast.success(t('Advance recorded'));
      qc.invalidateQueries({ queryKey: ['salary'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });
  const months = form.amount && form.installment > 0 ? Math.ceil(Number(form.amount) / Number(form.installment)) : 1;
  return (
    <Sheet open onClose={onClose} title={t('Give an advance')} size="md"
      footer={<button onClick={() => mut.mutate()} disabled={mut.isPending || !form.staff || !(Number(form.amount) > 0)} className="btn-primary w-full sm:w-auto">{t('Save')}</button>}>
      <div className="space-y-4">
        <div>
          <label className="label">{t('Staff')}</label>
          <SearchableSelect value={form.staff} onChange={(v) => setForm({ ...form, staff: v })} placeholder={t('Choose a person')}
            options={staff.map((s) => ({ value: s._id, label: s.name, sub: s.designation || s.staffCode }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">{t('Date')}</label><input type="date" className="input" value={form.date} max={localDateStr()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><label className="label">{t('Amount (₹)')}</label><input type="number" min={1} inputMode="numeric" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        </div>
        <div>
          <label className="label">{t('Recover per month (₹)')}</label>
          <input type="number" min={0} inputMode="numeric" className="input" value={form.installment} onChange={(e) => setForm({ ...form, installment: e.target.value })} placeholder={t('Empty = all from next salary')} />
          <p className="mt-1 text-xs text-gray-400">{months > 1 ? t('Recovered over about {n} months.', { n: months }) : t('Recovered from the next salary.')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map(([k, label]) => (
            <button type="button" key={k} onClick={() => setForm({ ...form, mode: k })}
              className={`rounded-full border px-3 py-1.5 text-sm ${form.mode === k ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{t(label)}</button>
          ))}
        </div>
        <input className="input" placeholder={t('Note (optional)')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.recordExpense} onChange={(e) => setForm({ ...form, recordExpense: e.target.checked })} className="h-4 w-4 rounded" />
          {t('Record in Expenses (money paid out today)')}
        </label>
      </div>
    </Sheet>
  );
}

export default function Advances() {
  const t = useT();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can('salary:manage');
  const [view, setView] = useState('open');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['salary', 'advances'], queryFn: () => getAdvances() });
  const all = data?.data?.data || [];
  const list = useMemo(() => [...all].reverse().filter((a) => view === 'all' || a.outstanding > 0), [all, view]);
  const outstanding = all.reduce((s, a) => s + a.outstanding, 0);

  const del = useMutation({
    mutationFn: () => deleteAdvance(removing._id),
    onSuccess: () => { toast.success(t('Advance deleted')); setRemoving(null); qc.invalidateQueries({ queryKey: ['salary'] }); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Salary Advances" breadcrumbs={[{ label: 'Salary' }, { label: 'Salary Advances' }]}
        actions={canManage && <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5"><Plus className="h-4 w-4" />{t('Give an advance')}</button>} />

      <div className="card flex items-center justify-between px-4 py-3">
        <span className="text-sm text-gray-600">{t('Still to recover')}</span>
        <span className="text-xl font-bold text-amber-700">{rs(outstanding)}</span>
      </div>

      <div className="flex gap-1.5">
        {[['open', 'Being recovered'], ['all', 'All']].map(([k, label]) => (
          <button key={k} onClick={() => { haptics.select(); setView(k); }}
            className={`rounded-full border px-3.5 py-2 text-sm font-medium ${view === k ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{t(label)}</button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : list.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500"><HandCoins className="mx-auto mb-2 h-8 w-8 text-gray-300" />{t('No advances.')}</div>
      ) : (
        <ul className="space-y-2.5">
          {list.map((a) => (
            <li key={a._id} className="card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-gray-900">{a.staff?.name}</p>
                  <p className="text-xs text-gray-500">{fDate(a.date)} · {rs(a.amount)} · {a.installment ? t('{n} per month', { n: rs(a.installment) }) : t('all at once')}{a.note && ` · ${a.note}`}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${a.outstanding ? 'text-amber-700' : 'text-green-700'}`}>{a.outstanding ? rs(a.outstanding) : t('Recovered')}</p>
                  {a.outstanding > 0 && <p className="text-[11px] text-gray-400">{t('left of {n}', { n: rs(a.amount) })}</p>}
                </div>
              </div>
              {(a.history.length > 0 || (canManage && a.recovered === 0)) && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  <span>{a.history.map((h) => `${fDate(`${h.month}-01`, 'MMM yy')}: ${rs(h.amount)}`).join(' · ')}</span>
                  {canManage && a.recovered === 0 && (
                    <button onClick={() => setRemoving(a)} className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" aria-label={t('Delete')}><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400">{t('Advances are taken back automatically when salary is worked out; the amount can be changed for a month on the salary screen.')}</p>

      {adding && <AddAdvanceSheet onClose={() => setAdding(false)} />}
      <ConfirmModal open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={() => del.mutate()} loading={del.isPending}
        title="Delete advance" message={t('Delete this advance? Its expense entry is voided too.')} />
    </div>
  );
}
