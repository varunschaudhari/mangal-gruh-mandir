import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Package, User, CalendarDays, IndianRupee, AlertTriangle, Info } from 'lucide-react';
import { getAssetTransaction, returnAsset } from '../../api/assetTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const Field = ({ label, required, error, hint, children }) => {
  const t = useT();
  return (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {t(label)} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{t(hint)}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);
};

const ReturnAsset = () => {
  const t = useT();
  const { txnId: id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [suggestedFine, setSuggestedFine] = useState(0);
  const [lateDays, setLateDays] = useState(0);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      conditionAtReturn: 'good',
      fineApplied: false,
      fineWaived: false,
      fineAmount: 0,
      actualReturnDate: localDateStr(),
    },
  });

  const fineApplied   = watch('fineApplied');
  const fineWaived    = watch('fineWaived');
  const returnDate    = watch('actualReturnDate');
  const conditionVal  = watch('conditionAtReturn');

  const { data: txnRes, isLoading } = useQuery({
    queryKey: ['asset-transaction', id],
    queryFn: () => getAssetTransaction(id),
  });

  const txn = txnRes?.data?.data;

  useEffect(() => {
    if (!txn || !returnDate) return;
    const expected  = new Date(txn.expectedReturnDate);
    const actual    = new Date(returnDate);
    const days      = Math.max(0, Math.ceil((actual - expected) / (1000 * 60 * 60 * 24)));
    const fine      = days * (txn.asset?.finePerDay || 0);
    setLateDays(days);
    setSuggestedFine(fine);
    if (fine > 0 && !fineWaived) {
      setValue('fineApplied', true);
      setValue('fineAmount', fine);
    } else if (fine === 0) {
      setValue('fineApplied', false);
      setValue('fineAmount', 0);
    }
  }, [txn, returnDate]);

  const mutation = useMutation({
    mutationFn: (data) => returnAsset(id, data),
    onSuccess: () => {
      toast.success(t('Asset returned successfully'));
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      navigate('/assets/borrows');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
  });

  if (isLoading) return <PageLoader />;
  if (!txn) return <div className="text-gray-500 p-4">{t('Transaction not found')}</div>;

  if (!['checked_out', 'overdue'].includes(txn.status)) {
    const STATUS_LABELS = { approved: 'Approved', returned: 'Already Returned', cancelled: 'Cancelled' };
    return (
      <div className="max-w-md mt-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="text-base font-semibold text-gray-800">{t('Cannot return this asset')}</p>
          <p className="text-sm text-gray-500">
            <span className="font-medium">{txn.asset?.name}</span> {t('is currently')}{' '}
            <span className="font-medium">{STATUS_LABELS[txn.status] || txn.status}</span>{t('. Only checked-out assets can be returned.')}
          </p>
          <button onClick={() => navigate(`/assets/borrows/${id}`)} className="btn-primary">
            {t('View Transaction Details')}
          </button>
        </div>
      </div>
    );
  }

  const isOverdue = lateDays > 0;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Return Asset"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Borrow Requests', to: '/assets/borrows' }, { label: 'Return' }]}
      />

      {/* Summary card */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-gray-800">{txn.asset?.name}</span>
          <span className="text-gray-500">× {txn.quantityBorrowed}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-gray-400" />
          <span className="text-gray-700">{txn.borrower?.name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <span className="text-gray-600">{t('Due:')} </span>
          <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
            {new Date(txn.expectedReturnDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          {isOverdue && <span className="text-red-600 text-xs flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{lateDays} {t('day(s) late')}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b bg-blue-50">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            <p className="text-sm font-semibold text-gray-800">{t('Return Details')}</p>
          </div>
          <div className="p-5 bg-white space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Actual Return Date')} required>
                <input type="date" max={localDateStr()} {...register('actualReturnDate')} className="input" />
              </Field>
              <Field label={t('Condition at Return')} required>
                <select {...register('conditionAtReturn')} className="input">
                  <option value="good">{t('Good')}</option>
                  <option value="fair">{t('Fair')}</option>
                  <option value="damaged">{t('Damaged')}</option>
                </select>
              </Field>
            </div>

            {conditionVal === 'damaged' && (
              <Field label={t('Damage Notes')} required={conditionVal === 'damaged'} error={errors.damageNotes?.message}>
                <textarea
                  {...register('damageNotes', { required: conditionVal === 'damaged' && 'Please describe the damage' })}
                  className="input" rows={3} placeholder={t('Describe what is damaged...')}
                />
              </Field>
            )}

            {/* Fine section */}
            {txn.asset?.finePerDay > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <IndianRupee className="h-4 w-4" />
                  {t('Fine Calculation')}
                </div>

                {lateDays > 0 ? (
                  <div className="text-xs text-amber-700 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    {lateDays} {t('late day(s) × ₹')}{txn.asset.finePerDay}/day = ₹{suggestedFine} {t('suggested fine')}
                  </div>
                ) : (
                  <p className="text-xs text-green-700">{t('Returned on time — no late fine applicable')}</p>
                )}

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...register('fineApplied')} onChange={(e) => {
                      setValue('fineApplied', e.target.checked);
                      if (e.target.checked) { setValue('fineWaived', false); setValue('fineAmount', suggestedFine); }
                      else setValue('fineAmount', 0);
                    }} className="h-4 w-4 rounded text-red-600" />
                    <span className="font-medium text-gray-700">{t('Apply Fine')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...register('fineWaived')} onChange={(e) => {
                      setValue('fineWaived', e.target.checked);
                      if (e.target.checked) { setValue('fineApplied', false); setValue('fineAmount', 0); }
                    }} className="h-4 w-4 rounded text-gray-600" />
                    <span className="font-medium text-gray-700">{t('Waive Fine')}</span>
                  </label>
                </div>

                {fineApplied && (
                  <Field label={t('Fine Amount (₹)')} error={errors.fineAmount?.message}>
                    <div className="relative max-w-[160px]">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                      <input
                        type="number" min="0" step="0.5"
                        {...register('fineAmount', { min: 0, valueAsNumber: true })}
                        className="input pl-9"
                      />
                    </div>
                  </Field>
                )}

                {fineWaived && (
                  <Field label={t('Waiver Reason')}>
                    <input {...register('fineWaivedReason')} className="input" placeholder={t('Optional reason for waiver')} />
                  </Field>
                )}
              </div>
            )}

          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary px-6">
            {mutation.isPending ? t('Saving…') : t('Confirm Return')}
          </button>
          <button type="button" onClick={() => navigate('/assets/borrows')} className="btn-secondary">{t('Cancel')}</button>
        </div>
      </form>
    </div>
  );
};

export default ReturnAsset;
