import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { getPayrollSettings, updatePayrollSettings } from '../../api/salary.api.js';
import { useT } from '../../i18n/index.jsx';

// PF, ESI, Professional Tax and bank-file settings.

function Num({ label, hint, value, onChange, step = 1, suffix }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <input type="number" min={0} step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="input w-32" inputMode="decimal" />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 rounded" />
    </label>
  );
}

export default function SalarySettings() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['salary', 'settings'], queryFn: getPayrollSettings });
  const [s, setS] = useState(null);
  useEffect(() => { if (data?.data?.data && !s) setS(structuredClone(data.data.data)); }, [data, s]);

  const mut = useMutation({
    mutationFn: () => updatePayrollSettings({ pf: s.pf, esi: s.esi, pt: s.pt, bank: s.bank }),
    onSuccess: (res) => { setS(structuredClone(res.data.data)); qc.invalidateQueries({ queryKey: ['salary'] }); toast.success(t('Salary settings saved')); },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  if (isLoading || !s) return <PageLoader />;
  const set = (group, key, value) => setS({ ...s, [group]: { ...s[group], [key]: value } });
  const setSlab = (i, patch) => set('pt', 'slabs', s.pt.slabs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Salary Settings" breadcrumbs={[{ label: 'Salary' }, { label: 'Salary Settings' }]} />

      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t('Provident Fund (PF)')}</h2>
          <input type="checkbox" checked={s.pf.enabled} onChange={(e) => set('pf', 'enabled', e.target.checked)} className="h-5 w-5 rounded" aria-label={t('PF on')} />
        </div>
        <p className="text-sm text-gray-500">{t('PF is worked out on the earned basic salary of people marked "PF applicable".')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num label={t('Employee share')} value={s.pf.employeeRate} onChange={(v) => set('pf', 'employeeRate', v)} step={0.01} suffix="%" />
          <Num label={t('Employer share')} value={s.pf.employerRate} onChange={(v) => set('pf', 'employerRate', v)} step={0.01} suffix="%" />
          <Num label={t('of which pension (EPS)')} value={s.pf.epsRate} onChange={(v) => set('pf', 'epsRate', v)} step={0.01} suffix="%" />
          <Num label={t('Wage ceiling (₹)')} value={s.pf.wageCeiling} onChange={(v) => set('pf', 'wageCeiling', v)} />
        </div>
        <Toggle label={t('PF only on basic up to the wage ceiling')} checked={s.pf.capAtCeiling} onChange={(v) => set('pf', 'capAtCeiling', v)} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('PF establishment code')}</span>
          <input value={s.pf.establishmentCode} onChange={(e) => set('pf', 'establishmentCode', e.target.value)} className="input max-w-xs font-mono uppercase" />
        </label>
      </section>

      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t('ESI')}</h2>
          <input type="checkbox" checked={s.esi.enabled} onChange={(e) => set('esi', 'enabled', e.target.checked)} className="h-5 w-5 rounded" aria-label={t('ESI on')} />
        </div>
        <p className="text-sm text-gray-500">{t('ESI is on gross pay for people marked "ESI applicable" whose monthly salary is within the limit. Amounts are rounded up to the next rupee.')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num label={t('Employee share')} value={s.esi.employeeRate} onChange={(v) => set('esi', 'employeeRate', v)} step={0.01} suffix="%" />
          <Num label={t('Employer share')} value={s.esi.employerRate} onChange={(v) => set('esi', 'employerRate', v)} step={0.01} suffix="%" />
          <Num label={t('Salary limit (₹)')} value={s.esi.wageCeiling} onChange={(v) => set('esi', 'wageCeiling', v)} />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('ESI employer code')}</span>
          <input value={s.esi.employerCode} onChange={(e) => set('esi', 'employerCode', e.target.value)} className="input max-w-xs font-mono" />
        </label>
      </section>

      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t('Professional Tax')}</h2>
          <input type="checkbox" checked={s.pt.enabled} onChange={(e) => set('pt', 'enabled', e.target.checked)} className="h-5 w-5 rounded" aria-label={t('PT on')} />
        </div>
        <p className="text-sm text-gray-500">{t('Monthly gross above the amount → that tax. The highest matching row applies. Set up for {state}.', { state: s.pt.state || 'Maharashtra' })}</p>
        <div className="space-y-2">
          <div className="hidden grid-cols-[7rem_1fr_1fr_1fr_2.5rem] gap-2 text-xs font-semibold text-gray-500 sm:grid">
            <span>{t('For')}</span><span>{t('Gross above (₹)')}</span><span>{t('Tax (₹)')}</span><span>{t('In February (₹)')}</span><span />
          </div>
          {s.pt.slabs.map((slab, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-100 p-2 sm:grid-cols-[7rem_1fr_1fr_1fr_2.5rem] sm:border-0 sm:p-0">
              <select value={slab.gender} onChange={(e) => setSlab(i, { gender: e.target.value })} className="input">
                <option value="male">{t('Men')}</option>
                <option value="female">{t('Women')}</option>
              </select>
              <input type="number" min={0} value={slab.above} onChange={(e) => setSlab(i, { above: e.target.value })} className="input" aria-label={t('Gross above (₹)')} />
              <input type="number" min={0} value={slab.amount} onChange={(e) => setSlab(i, { amount: e.target.value })} className="input" aria-label={t('Tax (₹)')} />
              <input type="number" min={0} value={slab.februaryAmount ?? ''} onChange={(e) => setSlab(i, { februaryAmount: e.target.value })} className="input" placeholder={t('same')} aria-label={t('In February (₹)')} />
              <button type="button" onClick={() => set('pt', 'slabs', s.pt.slabs.filter((_, j) => j !== i))} className="btn-ghost p-2 text-gray-400 hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set('pt', 'slabs', [...s.pt.slabs, { gender: 'male', above: 0, amount: 0 }])} className="btn-secondary flex items-center gap-1.5">
            <Plus className="h-4 w-4" />{t('Add row')}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800">{t('Bank transfer file')}</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Narration')}</span>
          <input value={s.bank.narration} onChange={(e) => set('bank', 'narration', e.target.value)} className="input max-w-sm" />
          <span className="mt-1 block text-xs text-gray-400">{t('{month} becomes the month, e.g. "Salary Oct 2026".')}</span>
        </label>
        <p className="text-xs text-gray-400">{t('The bank sheet has the standard columns (name, account number, IFSC, amount, narration). Tell us your bank to match its exact upload format.')}</p>
      </section>

      <StickyActionBar>
        <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary flex items-center justify-center gap-2">
          <Save className="h-4 w-4" />{mut.isPending ? t('Saving...') : t('Save')}
        </button>
      </StickyActionBar>
    </div>
  );
}
