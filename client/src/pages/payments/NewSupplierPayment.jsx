import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, AlertTriangle, CreditCard, BookTemplate, ChevronDown, X, Save, CheckCircle2 } from 'lucide-react';
import { getSuppliers, getSupplier } from '../../api/supplier.api.js';
import { createPayment, getSupplierAdvances } from '../../api/supplierPayment.api.js';
import { getPendingEntries } from '../../api/purchaseEntry.api.js';
import { getTemplates, createTemplate, markTemplateUsed } from '../../api/paymentTemplate.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const fmt    = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n)  => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PM_OPTIONS = [
  { value: 'cash',   label: 'Cash' },
  { value: 'upi',    label: 'UPI / Online' },
  { value: 'neft',   label: 'NEFT' },
  { value: 'rtgs',   label: 'RTGS' },
  { value: 'cheque', label: 'Cheque' },
];
const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };
const STATUS_LABELS = { pending_approval: 'Pending', approved: 'Approved' };

export default function NewSupplierPayment() {
  const t              = useT();
  const navigate       = useNavigate();
  const qc             = useQueryClient();
  const [searchParams] = useSearchParams();
  const preSupplier    = searchParams.get('supplier');
  // Below lg the app bar has the back arrow; rendering the link only on desktop keeps the
  // desktop DOM (and its space-y spacing) exactly as before.
  const isDesktop      = useMediaQuery('(min-width: 1024px)');

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { duplicates: [...] }

  // Advance reconciliation
  const [advanceApplied, setAdvanceApplied] = useState(0);

  // Template states
  const [showTemplateModal,     setShowTemplateModal]     = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName,          setTemplateName]          = useState('');
  const [savingTemplate,        setSavingTemplate]        = useState(false);
  const [createdPaymentId,      setCreatedPaymentId]      = useState(null);

  const { register, handleSubmit, control, watch, setValue, getValues, formState: { errors } } = useForm({
    defaultValues: {
      supplier:              preSupplier || '',
      paymentDate:           localDateStr(),
      paymentMode:           'cash',
      referenceNumber:       '',
      selectedBankAccountId: '',
      notes:                 '',
      invoices:              [],
    },
  });

  const { fields: invFields, append: appendInv, remove: removeInv, replace: replaceInv } = useFieldArray({ control, name: 'invoices' });

  const supplierId            = watch('supplier');
  const invoiceItems          = watch('invoices');
  const paymentMode           = watch('paymentMode');
  const selectedBankAccountId = watch('selectedBankAccountId');

  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ limit: 200, type: 'vendor' }),
  });
  const suppliers = supRes?.data?.data || [];

  const { data: selSupRes } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn:  () => getSupplier(supplierId),
    enabled:  !!supplierId,
  });
  const selectedSupplier = selSupRes?.data?.data;
  const bankAccounts     = selectedSupplier?.bankAccounts || [];

  const { data: invRes } = useQuery({
    queryKey: ['supplier-invoices', supplierId],
    queryFn:  () => getPendingEntries(supplierId),
    enabled:  !!supplierId,
  });
  const unpaidInvoices = invRes?.data?.data || [];

  const { data: templatesRes } = useQuery({
    queryKey: ['payment-templates'],
    queryFn:  () => getTemplates(),
    staleTime: 2 * 60 * 1000,
  });
  const templates = templatesRes?.data?.data || [];

  const { data: advancesRes } = useQuery({
    queryKey: ['supplier-advances', supplierId],
    queryFn:  () => getSupplierAdvances(supplierId),
    enabled:  !!supplierId,
    staleTime: 60 * 1000,
  });
  const advancesData     = advancesRes?.data?.data;
  const availableAdvance = advancesData?.availableBalance || 0;

  useEffect(() => {
    replaceInv([]);
    setAdvanceApplied(0);
    const defaultAcc = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
    setValue('selectedBankAccountId', defaultAcc?._id || '');
  }, [supplierId, bankAccounts.length]);

  const invoiceTotal = invoiceItems.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const cashRequired = Math.max(0, invoiceTotal - advanceApplied);

  const addInvoice = (inv) => {
    appendInv({
      purchaseEntryId: inv._id || '',
      invoiceNumber:   inv.invoiceNumber || '',
      invoiceDate:     inv.invoiceDate ? localDateStr(inv.invoiceDate) : '',
      invoiceTotal:    inv.invoiceTotal,
      paidAmount:      inv.remaining,
    });
  };

  const addAdvance = () => {
    appendInv({ invoiceNumber: '', invoiceDate: localDateStr(), invoiceTotal: 0, paidAmount: 0 });
  };

  useEffect(() => {
    if (invFields.length > 0) setValue('totalAmount', String(cashRequired));
  }, [cashRequired, invFields.length]);

  const doSubmit = (data, force = false) => {
    mutation.mutate({
      supplier:              data.supplier,
      invoices:              data.invoices.length > 0 ? data.invoices : [],
      totalAmount:           Number(data.totalAmount),
      advanceApplied:        advanceApplied > 0 ? advanceApplied : undefined,
      paymentDate:           data.paymentDate,
      paymentMode:           data.paymentMode,
      referenceNumber:       data.referenceNumber || undefined,
      selectedBankAccountId: data.selectedBankAccountId || undefined,
      notes:                 data.notes || undefined,
      force:                 force || undefined,
    });
  };

  const mutation = useMutation({
    mutationFn: (data) => createPayment(data),
    onSuccess: (res) => {
      toast.success(t('Payment submitted for approval'));
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      setDuplicateWarning(null);
      const newId = res.data.data._id;
      setCreatedPaymentId(newId);
      setShowSaveTemplateModal(true);
    },
    onError: (e) => {
      if (e.response?.status === 409 && e.response?.data?.data?.duplicates) {
        setDuplicateWarning(e.response.data.data);
      } else {
        toast.error(e.response?.data?.message || t('Failed to submit'));
      }
    },
  });

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) { toast.error(t('Enter a template name')); return; }
    setSavingTemplate(true);
    try {
      await createTemplate({
        name:                  templateName.trim(),
        supplier:              watch('supplier'),
        paymentMode:           watch('paymentMode'),
        selectedBankAccountId: watch('selectedBankAccountId') || undefined,
        notes:                 watch('notes') || undefined,
      });
      toast.success(t('Template saved'));
      qc.invalidateQueries({ queryKey: ['payment-templates'] });
      setShowSaveTemplateModal(false);
      setTemplateName('');
      navigate(`/payments/${createdPaymentId}`);
    } catch { toast.error(t('Failed to save template')); }
    finally   { setSavingTemplate(false); }
  };

  const loadTemplate = async (tpl) => {
    try { await markTemplateUsed(tpl._id); } catch { /* non-blocking */ }
    setValue('supplier', tpl.supplier._id || tpl.supplier);
    setValue('paymentMode', tpl.paymentMode || 'cash');
    if (tpl.selectedBankAccountId) setValue('selectedBankAccountId', tpl.selectedBankAccountId);
    if (tpl.notes) setValue('notes', tpl.notes);
    setShowTemplateModal(false);
    toast.success(t('Template "{name}" loaded', { name: tpl.name }));
  };

  const needsRef  = ['upi', 'neft', 'rtgs', 'cheque'].includes(paymentMode);
  const selectedAcc = bankAccounts.find((a) => a._id === selectedBankAccountId);

  if (showSaveTemplateModal) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="card p-6 sm:p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-800">{t('Payment Submitted!')}</h2>
          <p className="text-sm text-gray-500">{t('Save this payment config as a template for quick reuse?')}</p>
          <div className="max-w-xs mx-auto space-y-3">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t('Template name (e.g. Monthly Electricity)')}
              className="input w-full"
              autoFocus
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button onClick={handleSaveTemplate} disabled={savingTemplate}
                className="btn-primary flex items-center gap-1.5 text-sm">
                <Save className="h-4 w-4" />
                {savingTemplate ? t('Saving…') : t('Save Template')}
              </button>
              <button onClick={() => { setShowSaveTemplateModal(false); navigate(`/payments/${createdPaymentId}`); }}
                className="btn-secondary text-sm">
                {t('Skip')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {isDesktop && (
        <button onClick={() => navigate('/payments')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('Payments')}
        </button>
      )}

      <PageHeader
        title="Record Payment"
        subtitle="Submit a payment for trustee approval"
        breadcrumbs={[{ label: 'Payments', to: '/payments' }, { label: 'New' }]}
        actions={
          templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              <BookTemplate className="h-4 w-4" />
              {t('From Template')}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )
        }
      />

      {/* Duplicate warning banner */}
      {duplicateWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">{t('Possible duplicate payment detected')}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {t(duplicateWarning.duplicates.length > 1
                  ? '{n} existing payments already cover one or more of the same invoice numbers.'
                  : '{n} existing payment already covers one or more of the same invoice numbers.',
                { n: duplicateWarning.duplicates.length })}
              </p>
            </div>
            <button onClick={() => setDuplicateWarning(null)} className="-m-2 p-2 text-amber-400 hover:text-amber-600" aria-label={t('Dismiss')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white overflow-hidden">
            {duplicateWarning.duplicates.map((d, i) => (
              <div key={i} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-0">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-gray-700">{d.paymentNumber}</span>
                  <span className="ml-2 text-gray-400">{t('by {name}', { name: d.createdBy || t('Unknown') })}</span>
                  <span className="ml-2 text-amber-600 break-words">· {t('Invoices: {list}', { list: d.matchedInvoices.join(', ') })}</span>
                </div>
                <div className="shrink-0 sm:ml-3 sm:text-right">
                  <span className="font-semibold text-gray-700">{fmtAmt(d.totalAmount)}</span>
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${d.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {t(STATUS_LABELS[d.status]) || d.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => doSubmit(getValues(), true)}
              disabled={mutation.isPending}
              className="btn btn-ghost border text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
              {t('Submit Anyway')}
            </button>
            <button type="button" onClick={() => setDuplicateWarning(null)}
              className="px-3 py-2 sm:p-0 text-xs text-gray-400 hover:text-gray-600">
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => doSubmit(d))} className="space-y-4">

        {/* Supplier + Date */}
        <div className="card p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('Payment Details')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Supplier')} *</label>
              <Controller
                name="supplier"
                control={control}
                rules={{ required: t('Supplier is required') }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
                    placeholder={t('Select supplier…')}
                    error={errors.supplier?.message}
                  />
                )}
              />
              {errors.supplier && <p className="mt-1 text-xs text-red-500">{errors.supplier.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Payment Date')} *</label>
              <input {...register('paymentDate', { required: true })} type="date" className="input" />
            </div>
          </div>

          {/* Bank account selector */}
          {supplierId && bankAccounts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Pay To Bank Account')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bankAccounts.map((acc) => {
                  const isSelected = selectedBankAccountId === acc._id;
                  return (
                    <label key={acc._id}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-primary-400 bg-orange-50' : 'border-gray-100 hover:border-gray-300'}`}>
                      <input type="radio" value={acc._id} {...register('selectedBankAccountId')}
                        className="mt-0.5 h-4 w-4 text-primary-600" />
                      <div className="min-w-0 break-words">
                        <p className="text-sm font-semibold text-gray-800">
                          {acc.label || acc.bankName || t('Account')}
                          {acc.isDefault && <span className="ml-1.5 text-xs text-primary-600">{t('(Default)')}</span>}
                        </p>
                        {acc.bankName && acc.label && <p className="text-xs text-gray-500">{acc.bankName}</p>}
                        {acc.accountNumber && <p className="text-xs font-mono text-gray-500">{t('A/C: {number}', { number: acc.accountNumber })}</p>}
                        {acc.ifscCode && <p className="text-xs font-mono text-gray-400">{t('IFSC:')} {acc.ifscCode}</p>}
                        {acc.upiId && <p className="text-xs font-mono text-gray-400">{t('UPI:')} {acc.upiId}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {supplierId && bankAccounts.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-2.5">
              <CreditCard className="h-4 w-4 shrink-0" />
              {t('No bank accounts on file for this supplier. Add them in the supplier profile.')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Payment Mode')} *</label>
              <select {...register('paymentMode')} className="input">
                {PM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
              </select>
            </div>
            {needsRef && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {paymentMode === 'cheque' ? t('Cheque No.') : t('Reference / UTR No.')} *
                </label>
                <input {...register('referenceNumber', { required: needsRef ? t('Reference number is required') : false })}
                  className="input font-mono" placeholder={t('Transaction / cheque number')} />
                {errors.referenceNumber && <p className="mt-1 text-xs text-red-500">{errors.referenceNumber.message}</p>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Notes')}</label>
            <textarea {...register('notes')} rows={2} className="input" placeholder={t('Optional notes')} />
          </div>
        </div>

        {/* Invoice allocation */}
        {supplierId && (
          <div className="card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700">{t('Invoice Allocation')}</h3>
              <button type="button" onClick={addAdvance}
                className="btn-secondary text-xs flex items-center gap-1 px-3 sm:px-4">
                <Plus className="h-3.5 w-3.5" /> {t('Advance / No Invoice')}
              </button>
            </div>

            {unpaidInvoices.length > 0 && (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('Unpaid Invoices — Click to add')}
                </div>
                <div className="divide-y divide-gray-50">
                  {unpaidInvoices.map((inv, i) => {
                    const alreadyAdded = invFields.some((f) => f.purchaseEntryId && f.purchaseEntryId === (inv._id?.toString?.() || inv._id));
                    return (
                      <div key={i}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 ${alreadyAdded ? 'opacity-40' : 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer'}`}
                        onClick={() => !alreadyAdded && addInvoice(inv)}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{inv.entryNumber || inv.invoiceNumber || t('No Invoice No.')}</p>
                          <p className="text-xs text-gray-400">
                            {inv.invoiceNumber && inv.entryNumber && <span className="font-mono">{t('Inv: {number}', { number: inv.invoiceNumber })} · </span>}
                            {fmt(inv.invoiceDate)}{inv.isOverdue ? ` · ${t('Overdue')}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-gray-800">{fmtAmt(inv.invoiceTotal)}</p>
                          <p className="text-xs text-red-600">{t('Remaining: {amount}', { amount: fmtAmt(inv.remaining) })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {invFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Payment Allocation')}</p>
                {invFields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <input type="hidden" {...register(`invoices.${idx}.purchaseEntryId`)} />
                    {/* Phones: 2×2 fields with the remove button on a header row */}
                    <div className="col-span-2 -mt-1 flex items-center justify-between sm:hidden">
                      <span className="text-xs font-semibold text-gray-500">#{idx + 1}</span>
                      <button type="button" onClick={() => removeInv(idx)}
                        className="-mr-1 p-2 rounded hover:bg-red-50 text-red-400" aria-label={t('Remove invoice')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">{t('Invoice No.')}</label>
                      <input {...register(`invoices.${idx}.invoiceNumber`)} className="input text-sm font-mono" placeholder={t('INV-001')} />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">{t('Invoice Date')}</label>
                      <input {...register(`invoices.${idx}.invoiceDate`)} type="date" className="input text-sm" />
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">{t('Invoice Total (₹)')}</label>
                      <input {...register(`invoices.${idx}.invoiceTotal`, { valueAsNumber: true })} type="number" inputMode="decimal" step="0.01" min={0} className="input text-sm" />
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">{t('Paying Now (₹)')} *</label>
                      <input {...register(`invoices.${idx}.paidAmount`, { required: true, valueAsNumber: true, min: 0.01 })}
                        type="number" inputMode="decimal" step="0.01" min={0.01} className="input text-sm font-semibold" />
                    </div>
                    <div className="hidden sm:flex col-span-1 justify-end">
                      <button type="button" onClick={() => removeInv(idx)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400" aria-label={t('Remove invoice')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {invFields.length === 0 && unpaidInvoices.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('No unpaid invoices found. Use "Advance / No Invoice" for advance payments.')}
              </div>
            )}
          </div>
        )}

        {/* Advance reconciliation */}
        {supplierId && availableAdvance > 0 && invFields.length > 0 && (
          <div className="card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">{t('Apply Advance Credit')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('Available balance from prior advance payments:')}
                  <span className="ml-1 font-semibold text-green-700">{fmtAmt(availableAdvance)}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('Advance to apply (₹)')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={Math.min(availableAdvance, invoiceTotal)}
                  value={advanceApplied || ''}
                  onChange={(e) => {
                    const v = Math.min(
                      Math.max(0, Number(e.target.value) || 0),
                      Math.min(availableAdvance, invoiceTotal),
                    );
                    setAdvanceApplied(v);
                  }}
                  className="input font-semibold text-green-700"
                  placeholder="0.00"
                />
              </div>
              {advanceApplied > 0 && (
                <button
                  type="button"
                  onClick={() => setAdvanceApplied(0)}
                  className="mt-5 px-2 py-2 sm:p-0 text-xs text-gray-400 hover:text-gray-600"
                >
                  {t('Clear')}
                </button>
              )}
            </div>
            {advanceApplied > 0 && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm">
                <div className="flex-1">
                  <span className="text-gray-500">{t('Invoice total:')}</span>
                  <span className="ml-2 font-semibold text-gray-800">{fmtAmt(invoiceTotal)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('Advance applied:')}</span>
                  <span className="ml-2 font-semibold text-green-700">−{fmtAmt(advanceApplied)}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('Cash required:')}</span>
                  <span className="ml-2 font-bold text-gray-900">{fmtAmt(cashRequired)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Total amount */}
        <div className="card p-4 sm:p-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {advanceApplied > 0 ? t('Cash to Pay (₹)') : t('Total Payment Amount (₹)')} *
            </label>
            <input
              {...register('totalAmount', {
                required: t('Amount is required'),
                valueAsNumber: true,
                min: { value: 0, message: t('Cannot be negative') },
              })}
              type="number" inputMode="decimal" step="0.01" min={0}
              className="input text-lg font-semibold max-w-xs"
              readOnly={invFields.length > 0}
              placeholder="0.00"
            />
            {errors.totalAmount && <p className="mt-1 text-xs text-red-500">{errors.totalAmount.message}</p>}
            {invFields.length > 0 && advanceApplied > 0 && (
              <p className="mt-1 text-xs text-green-600 font-medium">
                {t('{invoice} invoice − {advance} advance = {cash} cash', {
                  invoice: fmtAmt(invoiceTotal), advance: fmtAmt(advanceApplied), cash: fmtAmt(cashRequired),
                })}
              </p>
            )}
            {invFields.length > 0 && advanceApplied === 0 && (
              <p className="mt-1 text-xs text-gray-400">{t('Auto-calculated from invoice allocation: {amount}', { amount: fmtAmt(invoiceTotal) })}</p>
            )}
          </div>
        </div>

        {/* Pinned to the bottom on phones (Submit on the right); unchanged left-aligned row from sm up */}
        <StickyActionBar className="flex-row-reverse sm:flex-row sm:items-center sm:!justify-start sm:gap-3">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? t('Submitting…') : t('Submit for Approval')}
          </button>
          <button type="button" onClick={() => navigate('/payments')} className="btn-secondary max-sm:!flex-none max-sm:px-5">{t('Cancel')}</button>
        </StickyActionBar>
      </form>

      {/* Template picker modal */}
      <Modal open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title={t('Load from Template')} size="md">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('No templates saved yet.')}</p>
          ) : templates.map((tpl) => (
            <button
              key={tpl._id}
              type="button"
              onClick={() => loadTemplate(tpl)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-primary-300 hover:bg-orange-50 transition-all text-left">
              <div>
                <p className="text-sm font-semibold text-gray-800">{tpl.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tpl.supplier?.name} · {t(PM_LABELS[tpl.paymentMode]) || tpl.paymentMode}
                  {tpl.usageCount > 0 && ` · ${t('Used {n}×', { n: tpl.usageCount })}`}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-300 rotate-[-90deg]" />
            </button>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t flex justify-between items-center">
          {/* Client-side link: a full page load is slow inside the mobile apps */}
          <Link to="/payments/templates" className="py-2 text-xs text-primary-600 hover:underline">{t('Manage templates →')}</Link>
          <button onClick={() => setShowTemplateModal(false)} className="btn-secondary text-sm">{t('Close')}</button>
        </div>
      </Modal>
    </div>
  );
}
