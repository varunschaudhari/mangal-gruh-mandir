import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Info, Lock, Phone } from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Spinner from '../ui/Spinner.jsx';
import { updateBooking } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import haptics from '../../utils/haptics.js';
import { useLanguage, useT, rich } from '../../i18n/index.jsx';
import { DevoteeMore, MessageLanguage } from './counter/DevoteeFields.jsx';
import SankalpPanel from './counter/SankalpPanel.jsx';
import { PaymentModes, PaymentRefInput } from './counter/PaymentPicker.jsx';
import { addFamilyNames, cleanPhoneInput, serverText } from './counter/counterUtils.js';
import { editFormValues, editPatch, paymentLock, validateEdit } from './bookingFixUtils.js';
import { MODE_LABEL, rupees } from './registerUtils.js';

const QUICK_REASONS = ['Spelling mistake', 'Devotee asked', 'Wrong details entered'];
const ERROR_ORDER = ['phone', 'name', 'address', 'email', 'people', 'payment'];
const FIELD_ID = { phone: 'eb-phone', name: 'eb-name', address: 'bk-address', email: 'bk-email', people: 'bk-people', payment: 'bk-payref' };

const Label = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
    {children}{required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);
const Err = ({ children }) => (children ? <p className="mt-1 text-xs font-medium text-red-600">{children}</p> : null);
const errCls = 'border-red-400 focus:border-red-500 focus:ring-red-500';

/**
 * Fixes the details of a confirmed booking (spelling, mobile, people, sankalp, address, notes and —
 * for whoever took it, while the shift is open — how it was paid). Only changed fields are sent;
 * the receipt number and amount never change. Mount it only while open: the form starts from `booking`.
 */
export default function EditBookingSheet({ booking: b, seva, sevaTypes = [], settings = {}, onClose, onSaved }) {
  const t = useT();
  const { lang } = useLanguage();
  const { can, user } = usePermissions();
  const qc = useQueryClient();

  const [initial] = useState(() => editFormValues(b));
  const [form, setForm] = useState(initial);
  const [familyDraft, setFamilyDraft] = useState('');
  const [sankalpOpen, setSankalpOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});

  const lock = paymentLock(b, { userId: user?._id || user?.id, canVoid: can('bookings:void') });
  const d = form.devotee;

  const clearError = useCallback((key) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);
  const setField = useCallback((key, value) => {
    setForm((f) => ({ ...f, devotee: { ...f.devotee, [key]: value } }));
    clearError(key === 'pincode' ? 'address' : key);
  }, [clearError]);
  const setPeopleCount = useCallback((n) => { setForm((f) => ({ ...f, peopleCount: n })); clearError('people'); }, [clearError]);
  const setPay = (patch) => setForm((f) => ({ ...f, ...patch }));

  const mut = useMutation({
    mutationFn: (body) => updateBooking(b._id, body),
    onSuccess: (res) => { haptics.success(); onSaved(res); },
    onError: (err) => {
      haptics.error();
      const res = err?.response;
      toast.error(serverText(t, res?.data?.message, { sevaTypes, lang }) || t('Failed'), { id: 'booking-edit', duration: 6000 });
      // Someone else changed it, or the seats moved: show the latest booking behind this sheet.
      if (res?.status === 409) qc.invalidateQueries({ queryKey: ['booking', b._id] });
    },
  });

  const errorText = (key) => (errors[key] ? serverText(t, errors[key], { sevaTypes, lang }) : undefined);

  const save = () => {
    if (mut.isPending) return;
    // A family name typed but not yet added with Enter still counts.
    let next = form;
    if (familyDraft.trim()) {
      next = { ...form, devotee: { ...form.devotee, familyNames: addFamilyNames(form.devotee.familyNames, familyDraft) } };
      setForm(next);
      setFamilyDraft('');
    }
    const errs = validateEdit(next, { seva, initial });
    const first = ERROR_ORDER.find((k) => errs[k]);
    if (first) {
      setErrors(errs);
      haptics.warning();
      toast.error(serverText(t, errs[first], { sevaTypes, lang }), { id: 'booking-edit' });
      const el = document.getElementById(FIELD_ID[first]);
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      el?.focus?.({ preventScroll: true });
      return;
    }
    setErrors({});
    const body = editPatch(initial, next, { canPay: !lock });
    if (!Object.keys(body).length) {
      toast(t('Nothing changed'));
      onClose();
      return;
    }
    if (reason.trim()) body.reason = reason.trim();
    mut.mutate(body);
  };

  const footer = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
      <button type="button" onClick={save} disabled={mut.isPending} className="btn-primary">
        {mut.isPending ? <Spinner size="sm" /> : <Check className="h-4 w-4" />} {mut.isPending ? t('Saving…') : t('Save changes')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={t('Edit booking details')} size="lg" footer={footer} full>
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {rich(t('Receipt {receipt} and the amount {amount} stay the same.'), {
              receipt: <strong className="font-mono">{b.receiptNo}</strong>,
              amount: <strong>{rupees(b.amount)}</strong>,
            })}
          </span>
        </p>

        {/* Mobile number + name */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="eb-phone" required>{t('Mobile number')}</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="eb-phone" type="tel" inputMode="numeric" autoComplete="off"
                value={d.phone} onChange={(e) => setField('phone', cleanPhoneInput(e.target.value))}
                placeholder="98XXXXXXXX" aria-invalid={Boolean(errors.phone)}
                className={`input h-11 pl-9 text-base font-semibold tabular-nums ${errors.phone ? errCls : ''}`}
              />
            </div>
            {errors.phone ? <Err>{errorText('phone')}</Err>
              : d.phone !== initial.devotee.phone && <p className="mt-1 text-xs text-gray-500">{t('After saving, use Resend to send the receipt to the new number.')}</p>}
          </div>
          <div>
            <Label htmlFor="eb-name" required>{t('Devotee name')}</Label>
            <input
              id="eb-name" value={d.name} onChange={(e) => setField('name', e.target.value)}
              autoComplete="off" autoCapitalize="words" maxLength={120} placeholder={t('Full name')}
              aria-invalid={Boolean(errors.name)}
              className={`input h-11 text-base font-semibold ${errors.name ? errCls : ''}`}
            />
            <Err>{errorText('name')}</Err>
            {settings.whatsappAuto && (
              <MessageLanguage value={d.language || settings.whatsappLanguage || 'mr'} onChange={(v) => setField('language', v)} />
            )}
          </div>
        </div>

        {/* Address, email, people — the same fields as the counter */}
        <DevoteeMore
          seva={seva} devotee={d} setField={setField}
          peopleCount={form.peopleCount} setPeopleCount={setPeopleCount}
          errors={{ address: errorText('address'), email: errorText('email'), people: errorText('people') }}
        />

        <SankalpPanel
          open={sankalpOpen} onToggle={() => setSankalpOpen((v) => !v)}
          devotee={d} setField={setField}
          familyDraft={familyDraft} onFamilyDraft={setFamilyDraft}
          notes={form.notes} onNotes={(v) => setForm((f) => ({ ...f, notes: v }))}
        />

        {/* Payment: only whoever took it (or someone who can void), until the shift is closed */}
        <div>
          <Label>{t('Payment')}</Label>
          {lock ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
              <p className="font-medium text-gray-800">
                {t(MODE_LABEL[b.paymentMode] || b.paymentMode || '—')}{b.paymentRef ? ` · ${b.paymentRef}` : ''}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-500">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t(lock)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <PaymentModes compact mode={form.paymentMode} onMode={(m) => { haptics.select(); setPay({ paymentMode: m }); }} />
              <PaymentRefInput mode={form.paymentMode} value={form.paymentRef} onChange={(v) => setPay({ paymentRef: v })} className="h-11" error={errorText('payment')} />
            </div>
          )}
        </div>

        {/* Why — kept in the booking's history */}
        <div>
          <Label htmlFor="eb-reason">{t('Reason for the change')} <span className="font-normal normal-case tracking-normal text-gray-400">{t('(optional)')}</span></Label>
          <input id="eb-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(t(r))}
                className={`min-h-[36px] rounded-full border px-3 text-xs max-sm:min-h-[40px] ${reason === t(r) ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t(r)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
