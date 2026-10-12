import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, MessageCircle, MessageSquare, Printer, Receipt, RefreshCw, Save, Search, Settings2, TriangleAlert } from 'lucide-react';
import StickyActionBar from '../../ui/StickyActionBar.jsx';
import { FormField } from '../../ui/FormField.jsx';
import { recountBookingSeats, updateBookingSettings } from '../../../api/booking.api.js';
import { getSettings } from '../../../api/settings.api.js';
import { connectToQzTray, getPrinters } from '../../../utils/thermalPrint.js';
import { printBookingSlip } from '../../../utils/bookingReceipt.js';
import { publicUrl } from '../../../utils/platform.js';
import { localDateStr } from '../../../utils/formatters.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { useT } from '../../../i18n/index.jsx';
import { SwitchRow, batchTime, errText, financialYear, hallNamesOf, useRefreshBookings } from './setupUi.jsx';

// The exact text the trust must get approved as a WhatsApp template (Meta), and the
// MSG91 variables — must match server/src/services/booking/notify.js.
const WA_TEMPLATE_TEXT = 'Namaste {{1}}, your {{2}} at Shri Mangal Grah Mandir, Amalner is booked for {{3}}. Receipt {{4}}: {{5}}';
const WA_VARS = [
  ['{{1}}', /*t*/ 'devotee\'s name'],
  ['{{2}}', /*t*/ 'seva name'],
  ['{{3}}', /*t*/ 'date, batch and hall'],
  ['{{4}}', /*t*/ 'receipt number'],
  ['{{5}}', /*t*/ 'link to the receipt'],
];
const SMS_TEXT = 'Namaste ##name##, your ##seva## at Shri Mangal Grah Mandir, Amalner is booked for ##when##. Receipt ##receipt##: ##link##';
const SMS_VARS = [
  ['##name##', WA_VARS[0][1]],
  ['##seva##', WA_VARS[1][1]],
  ['##when##', WA_VARS[2][1]],
  ['##receipt##', WA_VARS[3][1]],
  ['##link##', WA_VARS[4][1]],
];

// thermalPrint's QZ Tray connection never settles when QZ Tray isn't running — don't let a button hang.
const QZ_TIMEOUT = 15000;
const withTimeout = (promise, message) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), QZ_TIMEOUT)),
]);

const toForm = (s) => ({
  receiptPrefix: s.receiptPrefix || 'ABH',
  capacityUnit: s.capacityUnit || 'bookings',
  maxAdvanceDays: s.maxAdvanceDays ?? 90,
  printerName: s.printerName || '',
  paperWidth: String(s.paperWidth || 80),
  receiptFooter: s.receiptFooter || '',
  whatsappAuto: Boolean(s.whatsappAuto),
  whatsappTemplate: s.whatsappTemplate || '',
  smsAuto: Boolean(s.smsAuto),
  smsTemplateId: s.smsTemplateId || '',
});

const Section = ({ icon: Icon, title, intro, children }) => (
  <section className="card space-y-4 p-4 sm:p-6">
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
        <Icon className="h-4 w-4 text-primary-600" />{title}
      </h2>
      {intro && <p className="mt-0.5 text-sm text-gray-500">{intro}</p>}
    </div>
    {children}
  </section>
);

/**
 * Seat counts: put them back in line with the bookings (also done every night). For when a
 * batch shows "full" but has free seats, e.g. after the server stopped in the middle of booking.
 */
function SeatRecount() {
  const t = useT();
  const refresh = useRefreshBookings();
  const mut = useMutation({
    mutationFn: recountBookingSeats,
    onSuccess: (res) => {
      const n = res.data.data.fixed.length;
      toast.success(n ? t('Seat counts corrected for {n} batches', { n }) : t('Seat counts were already right'));
      refresh();
    },
    onError: (err) => toast.error(errText(t, err)),
  });
  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-sm font-medium text-gray-800">{t('Seat counts')}</p>
        <p className="text-xs text-gray-500">{t('If a batch shows full but has free seats, recount the seats from the bookings. This also happens every night.')}</p>
      </div>
      <button type="button" onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-secondary shrink-0">
        <RefreshCw className={`h-4 w-4 ${mut.isPending ? 'animate-spin' : ''}`} />{mut.isPending ? t('Recounting…') : t('Recount seats')}
      </button>
    </div>
  );
}

function CopyBox({ text, children }) {
  const t = useT();
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success(t('Copied!')); } catch { toast.error(t('Failed')); }
  };
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words font-mono text-[13px] leading-relaxed text-gray-800">{text}</p>
        <button type="button" onClick={copy} className="btn-ghost -m-1 h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8" aria-label={t('Copy')} title={t('Copy')}>
          <Copy className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

const VarList = ({ vars }) => {
  const t = useT();
  return (
    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
      {vars.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono font-semibold text-gray-700">{k}</dt>
          <dd className="text-gray-500">{t(v)}</dd>
        </div>
      ))}
    </dl>
  );
};

export default function SettingsTab({ setup, canManage }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const { can, user } = usePermissions();
  const { settings, sevaTypes, batches } = setup;

  // Main Settings: is WhatsApp / SMS set up, which printer Mahaprasad uses
  const { data: mainData } = useQuery({
    queryKey: ['settings'], queryFn: getSettings, staleTime: 5 * 60 * 1000, enabled: can('masters:read'),
  });
  const main = mainData?.data?.data;

  const values = useMemo(() => toForm(settings), [settings]);
  const { register, handleSubmit, control, watch, reset, setValue, getValues, formState: { errors, isDirty } } = useForm({
    values, resetOptions: { keepDirtyValues: true },
  });
  const [prefix, whatsappAuto, smsAuto, capacityUnit] = watch(['receiptPrefix', 'whatsappAuto', 'smsAuto', 'capacityUnit']);
  const [printers, setPrinters] = useState(null);
  const [finding, setFinding] = useState(false);
  const [printing, setPrinting] = useState(false);

  const mut = useMutation({
    mutationFn: (v) => updateBookingSettings(v),
    onSuccess: (res) => {
      toast.success(t('Booking settings saved'));
      reset(toForm(res.data.data));
      refresh();
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const payload = (v) => ({
    receiptPrefix: v.receiptPrefix.trim().toUpperCase(),
    capacityUnit: v.capacityUnit,
    maxAdvanceDays: Number(v.maxAdvanceDays),
    printerName: v.printerName.trim(),
    paperWidth: Number(v.paperWidth),
    receiptFooter: v.receiptFooter.trim(),
    whatsappAuto: Boolean(v.whatsappAuto),
    whatsappTemplate: v.whatsappTemplate.trim(),
    smsAuto: Boolean(v.smsAuto),
    smsTemplateId: v.smsTemplateId.trim(),
  });

  const findPrinters = async () => {
    setFinding(true);
    try {
      const found = await withTimeout(connectToQzTray().then(getPrinters), 'qz');
      const list = (Array.isArray(found) ? found : [found]).filter(Boolean);
      setPrinters(list);
      if (!list.length) toast.error(t('No printers found'));
    } catch {
      toast.error(t('QZ Tray is not running on this computer. Start QZ Tray and try again.'));
    } finally {
      setFinding(false);
    }
  };

  // A made-up booking printed with the settings on screen (saved or not)
  const printTest = async () => {
    const v = payload(getValues());
    const seva = sevaTypes.find((s) => s.isActive && s.schedule === 'batch') || sevaTypes[0];
    const batch = [...batches].filter((b) => b.isActive).sort((a, b) => a.start.localeCompare(b.start))[0];
    const fake = {
      receiptNo: `${v.receiptPrefix || 'ABH'}/${financialYear()}/00001`,
      sevaName: seva?.name || 'Abhishek',
      schedule: 'batch',
      amount: seva?.price || 810,
      dateKey: localDateStr(),
      batchLabel: batch ? batchTime(batch) : '7:00 AM – 8:15 AM',
      hall: batch?.hall || 'H1',
      serialNo: 7,
      devotee: { name: 'Test Devotee / चाचणी भक्त', phone: '9876543210', gotra: 'Kashyap', familyNames: ['Asha', 'Rohan'] },
      peopleCount: 3,
      paymentMode: 'cash',
      paidAt: new Date().toISOString(),
      status: 'confirmed',
      receiptUrl: publicUrl('/r/test'),
      createdBy: { name: user?.name || 'Office' },
    };
    setPrinting(true);
    try {
      const how = await withTimeout(printBookingSlip(fake, {
        ...v,
        printerName: v.printerName || main?.mahaprasadPrinterName || '',
        templeName: main?.templeName,
        hallNames: hallNamesOf(setup.halls),
      }), t('The printer did not answer. Check that QZ Tray is running on this computer and the printer name is right.'));
      toast.success(how === 'thermal' ? t('Test slip sent to the printer') : t('Test slip opened for printing'));
    } catch (err) {
      toast.error(err?.message || t('Could not print the test slip'));
    } finally {
      setPrinting(false);
    }
  };

  const fy = financialYear();
  const prefixOk = /^[A-Za-z]{1,8}$/.test(prefix || '');

  return (
    <form onSubmit={handleSubmit((v) => mut.mutate(payload(v)))} className="max-w-3xl space-y-5" noValidate>
      <fieldset disabled={!canManage} className="space-y-5">
        {/* ── Receipts ── */}
        <Section icon={Receipt} title={t('Receipt numbers')}>
          <FormField
            label={t('Receipt prefix')} error={errors.receiptPrefix?.message}
            hint={t('1 to 8 letters. Changing it only affects new receipts — old receipts keep their numbers.')}
          >
            <input
              {...register('receiptPrefix', { validate: (v) => /^[A-Za-z]{1,8}$/.test(v.trim()) || t('Use 1 to 8 letters (A–Z), no numbers or spaces') })}
              maxLength={8} className="input w-40 font-mono uppercase" autoCapitalize="characters" autoComplete="off"
            />
          </FormField>
          {prefixOk && (
            <p className="text-sm text-gray-600">
              {t('Receipts will be numbered like')} <span className="font-mono font-semibold text-gray-900">{prefix.toUpperCase()}/{fy}/00001</span>
              <span className="block text-xs text-gray-400">{t('The middle part is the financial year; numbering starts again every April.')}</span>
            </p>
          )}
        </Section>

        {/* ── Booking rules ── */}
        <Section icon={Settings2} title={t('Booking rules')}>
          <fieldset>
            <legend className="label">{t('What do the seats in a batch count?')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: 'bookings', title: t('Bookings'), hint: t('Each booking takes one seat, however many family members come.') },
                { v: 'people', title: t('People'), hint: t('Each person takes one seat — a family of 4 uses 4 seats.') },
              ].map((o) => (
                <label key={o.v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${capacityUnit === o.v ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-gray-200'}`}>
                  <input type="radio" value={o.v} className="mt-0.5 h-5 w-5 shrink-0" {...register('capacityUnit')} />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">{o.title}</span>
                    <span className="block text-xs text-gray-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">{t('The same applies to the daily limit of fixed-time sevas.')}</p>
          </fieldset>

          <FormField
            label={t('Book up to how many days ahead')} error={errors.maxAdvanceDays?.message}
            hint={t('The counter cannot book a date further away than this. 90 days is about 3 months.')}
          >
            <input
              type="number" inputMode="numeric" min={1} max={730} step={1} className="input w-32"
              {...register('maxAdvanceDays', { validate: (v) => (Number.isInteger(Number(v)) && v >= 1 && v <= 730) || t('Enter a number from 1 to 730') })}
            />
          </FormField>
        </Section>

        {/* ── Counter slip ── */}
        <Section icon={Printer} title={t('Counter slip printer')} intro={t('The small receipt printed at the booking counter for the devotee.')}>
          <FormField
            label={t('Printer name')}
            hint={main?.mahaprasadPrinterName
              ? t('Leave blank to use the Mahaprasad printer ({name}).', { name: main.mahaprasadPrinterName })
              : t('Leave blank to use the Mahaprasad printer.')}
          >
            <div className="flex gap-2">
              <input {...register('printerName')} className="input min-w-0 flex-1" autoComplete="off" placeholder={t('e.g. {example}', { example: 'POS-80' })} />
              <button type="button" onClick={findPrinters} disabled={finding} className="btn-secondary shrink-0 px-3">
                <Search className="h-4 w-4" /><span className="max-sm:sr-only">{finding ? t('Looking…') : t('Find printers')}</span>
              </button>
            </div>
          </FormField>
          {printers?.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {printers.map((p) => (
                <button key={p} type="button" onClick={() => setValue('printerName', p, { shouldDirty: true })} className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-left text-sm text-gray-700 hover:border-primary-400 sm:min-h-[32px]">
                  {p}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">{t('The printer is reached through QZ Tray on the counter computer. In the desktop app, the printer chosen in the app\'s own settings is used.')}</p>

          <fieldset>
            <legend className="label">{t('Paper width')}</legend>
            <div className="flex gap-2">
              {['80', '58'].map((w) => (
                <label key={w} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/60">
                  <input type="radio" value={w} className="h-5 w-5" {...register('paperWidth')} />{w} mm
                </label>
              ))}
            </div>
          </fieldset>

          <FormField label={t('Note at the bottom of the slip')} hint={t('Printed on every slip and receipt, e.g. arrival time or refund rules.')}>
            <textarea {...register('receiptFooter')} rows={2} maxLength={300} className="input" />
          </FormField>
        </Section>

        {/* ── Receipt on the phone ── */}
        <Section icon={MessageCircle} title={t('Receipt on the devotee\'s phone')} intro={t('Every booking can send the devotee a message with a link to their receipt.')}>
          <Controller
            name="whatsappAuto" control={control}
            render={({ field }) => (
              <SwitchRow label={t('Send on WhatsApp automatically')} checked={field.value} onChange={field.onChange} disabled={!canManage} />
            )}
          />
          {main && !main.waEnabled && whatsappAuto && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t('WhatsApp is not set up yet, so nothing is sent.')}{' '}
                {can('masters:write') && <Link to="/settings?tab=whatsapp" className="font-medium underline">{t('Set up WhatsApp in Settings')}</Link>}
              </span>
            </p>
          )}
          {whatsappAuto && (
            <div className="space-y-3">
              <FormField label={t('Template name')} error={errors.whatsappTemplate?.message} hint={t('The name of the approved template in Meta WhatsApp Manager')}>
                <input
                  {...register('whatsappTemplate', { validate: (v, all) => !all.whatsappAuto || Boolean(v.trim()) || t('{label} is required', { label: t('Template name') }) })}
                  className="input font-mono" autoComplete="off" autoCapitalize="none"
                />
              </FormField>
              <div>
                <p className="mb-1.5 text-sm text-gray-600">{t('Ask Meta to approve a template with exactly this text (category: Utility, language: English — not English US):')}</p>
                <CopyBox text={WA_TEMPLATE_TEXT}><VarList vars={WA_VARS} /></CopyBox>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <Controller
              name="smsAuto" control={control}
              render={({ field }) => (
                <SwitchRow label={t('Send by SMS automatically')} hint={t('Through MSG91. Costs a little per message.')} checked={field.value} onChange={field.onChange} disabled={!canManage} />
              )}
            />
          </div>
          {main && !main.smsEnabled && smsAuto && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t('SMS is not set up yet, so nothing is sent.')}{' '}
                {can('masters:write') && <Link to="/settings?tab=sms" className="font-medium underline">{t('Set up SMS in Settings')}</Link>}
              </span>
            </p>
          )}
          {smsAuto && (
            <div className="space-y-3">
              <FormField label={t('MSG91 template ID')} error={errors.smsTemplateId?.message} hint={t('The ID of the DLT-approved template in MSG91')}>
                <input
                  {...register('smsTemplateId', { validate: (v, all) => !all.smsAuto || Boolean(v.trim()) || t('{label} is required', { label: t('MSG91 template ID') }) })}
                  className="input font-mono" autoComplete="off" autoCapitalize="none"
                />
              </FormField>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm text-gray-600">
                  <MessageSquare className="h-4 w-4 shrink-0 text-gray-400" />
                  {t('Create the template in MSG91 with these variables, for example:')}
                </p>
                <CopyBox text={SMS_TEXT}><VarList vars={SMS_VARS} /></CopyBox>
              </div>
            </div>
          )}
        </Section>
      </fieldset>

      {/* Outside the read-only fieldset: anyone may print a test slip */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-medium text-gray-800">{t('Print a test slip')}</p>
          <p className="text-xs text-gray-500">{t('Prints a made-up booking with the printer, paper width and note above — even before you save.')}</p>
        </div>
        <button type="button" onClick={printTest} disabled={printing} className="btn-secondary shrink-0">
          <Printer className="h-4 w-4" />{printing ? t('Printing…') : t('Print test slip')}
        </button>
      </div>

      {canManage && <SeatRecount />}

      {canManage && (
        <StickyActionBar>
          {isDirty && (
            <button type="button" onClick={() => reset(values)} disabled={mut.isPending} className="btn-secondary">{t('Undo changes')}</button>
          )}
          <button type="submit" disabled={mut.isPending || !isDirty} className="btn-primary">
            <Save className="h-4 w-4" />{mut.isPending ? t('Saving...') : t('Save')}
          </button>
        </StickyActionBar>
      )}
    </form>
  );
}
