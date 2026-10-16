import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, MessageCircle, MessageSquare, Bell, Armchair,
  Save, Eye, EyeOff, CheckCircle2, Send, FileCheck2, Utensils, Printer, Fingerprint,
} from 'lucide-react';
import { getSettings, updateSettings, testWhatsApp } from '../../api/settings.api.js';
import { connectToQzTray, getPrinters } from '../../utils/thermalPrint.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import AttendanceSettingsPanel from '../attendance/AttendanceSettingsPanel.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/index.jsx';

// ── Reusable primitives ───────────────────────────────────────────────────────

const Field = ({ label, hint, error, children }) => {
  const t = useT();
  return (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t(label)}</label>
    {children}
    {hint  && !error && <p className="mt-1 text-xs text-gray-400">{t(hint)}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
  );
};

const Toggle = ({ label, description, checked, onChange }) => {
  const t = useT();
  return (
  <label className="flex items-center justify-between gap-4 cursor-pointer">
    <div>
      <p className="text-sm font-medium text-gray-700">{t(label)}</p>
      {description && <p className="text-xs text-gray-400 mt-0.5">{t(description)}</p>}
    </div>
    <div className="shrink-0">
      <input type="checkbox" checked={!!checked} onChange={onChange} className="sr-only" />
      <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}>
        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </div>
  </label>
  );
};

const SecretInput = ({ reg, name, placeholder, hint }) => {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          {...reg(name)}
          type={show ? 'text' : 'password'}
          className="input pr-10 font-mono text-sm"
          placeholder={placeholder}
          autoComplete="off"
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{t(hint)}</p>}
    </div>
  );
};

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'temple',     label: 'Temple',     icon: Building2,     accent: 'orange'  },
  { id: 'whatsapp',   label: 'WhatsApp',   icon: MessageCircle, accent: 'green'   },
  { id: 'sms',        label: 'SMS',        icon: MessageSquare, accent: 'blue'    },
  { id: 'alerts',     label: 'Alerts',     icon: Bell,          accent: 'amber'   },
  { id: 'tax80g',     label: '80G',        icon: FileCheck2,    accent: 'emerald' },
  { id: 'assets',     label: 'Assets',     icon: Armchair,      accent: 'purple'  },
  { id: 'mahaprasad', label: 'Mahaprasad', icon: Utensils,      accent: 'orange'  },
  // Has its own data and save button (AttendanceSettingsPanel)
  { id: 'attendance', label: 'Attendance', icon: Fingerprint,   accent: 'orange', permission: 'attendance:manage' },
];

const TAB_FIELDS = {
  temple:     ['templeName', 'templeNameMr', 'trustLegalName', 'templeAddress', 'templePhone', 'templeEmail', 'templeWebsite', 'trustRegNumber'],
  whatsapp:   ['waEnabled', 'waPhoneNumberId', 'waAccessToken', 'waTemplates', 'waLanguages'],
  sms:        ['smsEnabled', 'msg91AuthKey', 'msg91TemplateId'],
  alerts:     ['alertOnOutOfStock', 'alertOnLowStock', 'alertOnReorder'],
  tax80g:     ['trustPAN', 'reg80GNumber', 'reg80GFrom', 'reg80GTo'],
  assets:     ['assetMaxBorrowDays'],
  mahaprasad: ['mahaprasadDayPricing', 'mahaprasadDailyCap', 'mahaprasadCouponValidityDays', 'mahaprasadPrinterName'],
};

// The WhatsApp messages the app sends (besides the booking receipt, set in Bookings → Setup), with
// the wording to submit to Meta as a Utility template. The server sends the {{…}} values in this order.
// Those with textMr also go in Marathi: the same template name with a Marathi language added.
const WA_TEMPLATES = [
  { key: 'stockAlert', label: 'Stock alerts', to: 'To staff with WhatsApp alerts on (Users)', example: 'stock_alert',
    text: 'Stock alert from Shri Mangal Grah Mandir store: {{1}} in {{2}} is down to {{3}} {{4}} ({{5}}). Please arrange a refill.' },
  { key: 'paymentApproval', label: 'Payment waiting for approval', to: 'To payment approvers', example: 'payment_approval_request',
    text: 'Shri Mangal Grah Mandir office: supplier payment {{1}} to {{2}} for ₹{{3}}, submitted by {{4}}, is waiting for your approval. Please review it in the app.' },
  { key: 'paymentStatus', label: 'Payment approved or rejected', to: 'To the person who submitted it', example: 'payment_status_update',
    text: 'Shri Mangal Grah Mandir office: supplier payment {{1}} for ₹{{2}} has been {{3}} by {{4}}. Please see the app for details.' },
  { key: 'overdueSummary', label: 'Overdue supplier invoices (daily)', to: 'To payment approvers', example: 'payment_overdue_summary',
    text: 'Shri Mangal Grah Mandir office: {{1}} supplier(s) have {{2}} overdue invoice(s) totalling ₹{{3}}. The oldest is {{4}} day(s) overdue. Please review payments in the app.' },
  { key: 'assetReminder', label: 'Asset return reminders', to: 'To borrowers', example: 'asset_reminder',
    text: 'Namaste {{1}}, this is about {{2}} (quantity {{3}}) from Shri Mangal Grah Mandir, to be returned on {{4}}: {{5}}. Thank you.' },
  { key: 'donationThanks', label: 'Donation thank-you', to: 'To donors', example: 'donation_thankyou',
    text: 'Dear {{1}}, thank you for your generous donation of ₹{{2}} towards {{3}} on {{4}}. Receipt no. {{5}}. 🙏 Jai Jai Mangal Grah Mandir!',
    textMr: 'प्रिय {{1}}, आपण दिलेल्या ₹{{2}} च्या उदार देणगीबद्दल ({{3}}, दिनांक {{4}}) मनःपूर्वक धन्यवाद. पावती क्र. {{5}}. 🙏 जय जय मंगळग्रह मंदिर!' },
  { key: 'mahaprasadCoupons', label: 'Mahaprasad coupons', to: 'To devotees', example: 'mahaprasad_coupon_qr',
    text: 'Namaste! Your Mahaprasad coupon(s) at Shri Mangal Grah Mandir, Amalner for {{1}}: {{2}} ({{3}}). Your coupon QR: {{4}} Please show it at the Mahaprasad hall.',
    textMr: 'नमस्कार! श्री मंगळग्रह मंदिर, अमळनेर येथे {{1}} साठी आपले महाप्रसाद कूपन: {{2}} ({{3}}). आपल्या कूपनचा QR: {{4}} कृपया तो महाप्रसाद सभागृहात दाखवा.' },
];

// ── Save footer (per tab) ─────────────────────────────────────────────────────

function SaveFooter({ onSave, isPending, savedTabId, tabId }) {
  const t = useT();
  const justSaved = savedTabId === tabId;
  return (
    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 mt-6">
      <button type="button" onClick={onSave} disabled={isPending}
        className="btn-primary flex items-center gap-2 disabled:opacity-50">
        <Save className="h-4 w-4" />
        {isPending ? t('Saving…') : t('Save')}
      </button>
      {justSaved && !isPending && (
        <span className="flex items-center gap-1.5 text-xs text-green-600 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4" /> {t('Saved')}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const Settings = () => {
  const t = useT();
  const qc = useQueryClient();
  const { register, reset, watch, setValue, getValues } = useForm();

  const { can } = usePermissions();
  const [searchParams] = useSearchParams();
  const tabs = TABS.filter((tab) => !tab.permission || can(tab.permission));
  const [activeTab,       setActiveTab]       = useState(() => (tabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'temple'));
  const [savedTabId,      setSavedTabId]      = useState(null);
  const [testPhone,       setTestPhone]       = useState('');
  const [testLoading,     setTestLoading]     = useState(false);
  const [testResult,      setTestResult]      = useState(null);
  const [detectLoading,   setDetectLoading]   = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState([]);

  const waEnabled  = watch('waEnabled');
  const smsEnabled = watch('smsEnabled');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  getSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.data?.data) reset(data.data.data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (_, variables) => {
      toast.success(t('Settings saved'));
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['temple'] });   // name in the header and on receipts
      setSavedTabId(activeTab);
      setTimeout(() => setSavedTabId(null), 3000);
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed to save')),
  });

  const saveTab = () => {
    const all  = getValues();
    const keys = TAB_FIELDS[activeTab] || [];
    const partial = {};
    keys.forEach((k) => { if (all[k] !== undefined) partial[k] = all[k]; });
    mutation.mutate(partial);
  };

  const handleDetectPrinters = async () => {
    setDetectLoading(true);
    setDetectedPrinters([]);
    try {
      await connectToQzTray();
      const printers = await getPrinters();
      const list = Array.isArray(printers) ? printers : [printers];
      setDetectedPrinters(list);
      if (list.length === 1) setValue('mahaprasadPrinterName', list[0], { shouldDirty: true });
    } catch {
      toast.error(t('QZ Tray not reachable. Is it installed and running?'));
    } finally {
      setDetectLoading(false);
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure temple info, notifications and system preferences"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Settings' }]}
      />

      {/* ── Tab bar ── */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 -mb-px ${
                  active
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <Icon className="h-4 w-4 shrink-0" />
                {t(label)}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'attendance' && <AttendanceSettingsPanel />}

      {/* ── Tab content ── */}
      <div className="max-w-2xl space-y-5">

        {/* Temple */}
        {activeTab === 'temple' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Temple Name')}>
                <input {...register('templeName')} className="input" placeholder={t('Mangal Grah Mandir')} />
              </Field>
              <Field label={t('Name in Marathi')}>
                <input {...register('templeNameMr')} className="input" lang="mr" placeholder="श्री मंगळग्रह मंदिर, अमळनेर" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Phone')}>
                <input {...register('templePhone')} className="input" type="tel" placeholder={t('+91 XXXXX XXXXX')} />
              </Field>
              <Field label={t('Trust registration no.')}>
                <input {...register('trustRegNumber')} className="input font-mono text-sm" placeholder="F-1234/Jalgaon" />
              </Field>
            </div>
            <Field label={t("Trust's legal name")} hint={t('As on the trust’s PAN card. Receipts say “Managed by …” and are signed for the trust.')}>
              <input {...register('trustLegalName')} className="input" placeholder="Mangalgrah Seva Sanstha, Amalner" />
            </Field>
            <Field label={t('Address')}>
              <input {...register('templeAddress')} className="input" placeholder={t('Village, District, State')} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Email')}>
                <input {...register('templeEmail')} className="input" type="email" placeholder="temple@example.com" />
              </Field>
              <Field label={t('Website')}>
                <input {...register('templeWebsite')} className="input" placeholder="www.example.com" />
              </Field>
            </div>
            <p className="text-xs text-gray-500">{t('These details, the logo and the PAN / 80G numbers are printed at the top of receipts, vouchers and payslips.')}</p>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="temple" />
          </>
        )}

        {/* WhatsApp */}
        {activeTab === 'whatsapp' && (
          <>
            <Toggle
              label={t('Enable WhatsApp messages')}
              description={t('Booking receipts, donation thank-yous, coupons and staff alerts. Each message also needs its approved template.')}
              checked={waEnabled}
              onChange={(e) => setValue('waEnabled', e.target.checked, { shouldDirty: true })}
            />
            {waEnabled && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Field label={t('Phone Number ID')} hint={t('Meta Developer Console → WhatsApp → API Setup')}>
                  <input {...register('waPhoneNumberId')} className="input font-mono text-sm" placeholder="1100536663150619" />
                </Field>
                <Field label={t('Access Token')} hint={t('Paste new value to update — use permanent System User token')}>
                  <SecretInput reg={register} name="waAccessToken" placeholder={t('EAAxxxxxxxx…')} hint={t('Masked for security — paste to update')} />
                </Field>
                <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{t('Message templates')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('The name of each approved template in WhatsApp Manager. Leave a name empty to not send that message. The booking receipt’s template is in Bookings → Setup.')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('Donation and Mahaprasad messages can also go in Marathi: add Marathi to the same template in WhatsApp Manager. If the chosen language isn’t approved yet, the other one is sent.')}</p>
                  </div>
                  {WA_TEMPLATES.map(({ key, label, to, example, text, textMr }) => (
                    <div key={key} className="border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_15rem] gap-1.5 sm:gap-3 sm:items-center">
                        <label htmlFor={`wa-${key}`} className="text-sm text-gray-700">
                          {t(label)}
                          <span className="block text-xs text-gray-400">{t(to)}</span>
                        </label>
                        <input id={`wa-${key}`} {...register(`waTemplates.${key}`)} className="input font-mono text-sm"
                          placeholder={example} autoComplete="off" autoCapitalize="none" spellCheck={false} />
                      </div>
                      {textMr && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_15rem] gap-1.5 sm:gap-3 sm:items-center">
                          <label htmlFor={`wa-lang-${key}`} className="text-xs text-gray-500">{t('Send in')}</label>
                          <select id={`wa-lang-${key}`} {...register(`waLanguages.${key}`)} className="input text-sm">
                            <option value="mr">मराठी (Marathi)</option>
                            <option value="en">English</option>
                          </select>
                        </div>
                      )}
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-green-700">{t('Wording to submit to Meta')}</summary>
                        {textMr && <p className="mt-2 text-xs font-semibold text-gray-500">English</p>}
                        <p className="mt-1 rounded-lg bg-gray-50 p-2.5 font-mono text-xs leading-relaxed text-gray-700 break-words select-all">{text}</p>
                        {textMr && (
                          <>
                            <p className="mt-2 text-xs font-semibold text-gray-500">मराठी (Marathi) · {t('same name, language Marathi')}</p>
                            <p lang="mr" className="mt-1 rounded-lg bg-gray-50 p-2.5 font-mono text-xs leading-relaxed text-gray-700 break-words select-all">{textMr}</p>
                          </>
                        )}
                      </details>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">{t('Quick setup:')}</p>
                  <p>{t('1. Meta Business Suite → WhatsApp Manager: add the temple’s number')}</p>
                  <p>{t('2. Create each template above (category Utility, language English, plus Marathi where shown) and wait for approval')}</p>
                  <p>{t('3. Generate a permanent System User token (never expires)')}</p>
                  <p>{t('4. For stock and payment alerts, turn on WhatsApp for each person in Users')}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/30 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">{t('Test Connection')}</p>
                  <p className="text-xs text-gray-400 mb-3">
                    {t('Checks the Phone Number ID and token with Meta and shows the number and its display name. Save them first. With Meta’s test number, also enter your mobile to get its sample message.')}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => { setTestPhone(e.target.value); setTestResult(null); }}
                      placeholder={t('Your mobile (optional)')}
                      className="input flex-1 text-sm font-mono"
                    />
                    <button
                      type="button"
                      disabled={testLoading}
                      onClick={async () => {
                        setTestLoading(true); setTestResult(null);
                        try {
                          const { data } = await testWhatsApp(testPhone);
                          setTestResult({ ok: true, msg: data?.message || t('Connected') });
                        } catch (err) {
                          setTestResult({ ok: false, msg: err.response?.data?.message || 'Failed to send' });
                        } finally {
                          setTestLoading(false);
                        }
                      }}
                      className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50">
                      <Send className="h-4 w-4" />
                      {testLoading ? t('Checking…') : t('Check connection')}
                    </button>
                  </div>
                  {testResult && (
                    <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                    </div>
                  )}
                </div>
              </div>
            )}
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="whatsapp" />
          </>
        )}

        {/* SMS */}
        {activeTab === 'sms' && (
          <>
            <Toggle
              label={t('Enable SMS Alerts')}
              description={t('Send SMS when stock drops below threshold')}
              checked={smsEnabled}
              onChange={(e) => setValue('smsEnabled', e.target.checked, { shouldDirty: true })}
            />
            {smsEnabled && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Field label={t('MSG91 Auth Key')} hint="msg91.com → API → Auth Key">
                  <SecretInput reg={register} name="msg91AuthKey" placeholder={t('xxxxxx…')} hint={t('Masked for security — paste to update')} />
                </Field>
                <Field label={t('Template ID')} hint={t('MSG91 → Campaigns → Flow → Your template ID')}>
                  <input {...register('msg91TemplateId')} className="input font-mono text-sm" placeholder={t('6xxxxxxxxxxxxxxxxx')} />
                </Field>
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">{t('Quick setup:')}</p>
                  <p>1. Sign up at msg91.com → Create a Flow template</p>
                  <p>{t('2. Add variables: product, department, quantity, unit, status')}</p>
                  <p>{t('3. Copy Auth Key and Template ID above')}</p>
                  <p>{t('4. Enable SMS on individual users in User Management')}</p>
                </div>
              </div>
            )}
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="sms" />
          </>
        )}

        {/* Alerts */}
        {activeTab === 'alerts' && (
          <>
            <div className="space-y-4 divide-y divide-gray-100">
              <Toggle
                label={t('Out of Stock')}
                description={t('Alert when quantity reaches 0')}
                checked={watch('alertOnOutOfStock')}
                onChange={(e) => setValue('alertOnOutOfStock', e.target.checked, { shouldDirty: true })}
              />
              <div className="pt-4">
                <Toggle
                  label={t('Low Stock')}
                  description={t('Alert when quantity drops at or below minimum stock level')}
                  checked={watch('alertOnLowStock')}
                  onChange={(e) => setValue('alertOnLowStock', e.target.checked, { shouldDirty: true })}
                />
              </div>
              <div className="pt-4">
                <Toggle
                  label={t('Reorder Soon')}
                  description={t('Alert when quantity drops at or below reorder point')}
                  checked={watch('alertOnReorder')}
                  onChange={(e) => setValue('alertOnReorder', e.target.checked, { shouldDirty: true })}
                />
              </div>
            </div>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="alerts" />
          </>
        )}

        {/* 80G */}
        {activeTab === 'tax80g' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Trust PAN')} hint={t('PAN of the registered trust / temple')}>
                <input {...register('trustPAN')} className="input uppercase font-mono" placeholder={t('AAAAB1234C')} />
              </Field>
              <Field label={t('80G Registration No.')} hint="e.g. 80G/2023/0012345">
                <input {...register('reg80GNumber')} className="input font-mono text-sm" placeholder={t('80G/YYYY/XXXXXXX')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Valid From')} hint={t('Registration validity start date')}>
                <input {...register('reg80GFrom')} type="date" className="input" />
              </Field>
              <Field label={t('Valid To')} hint={t('Registration validity end date')}>
                <input {...register('reg80GTo')} type="date" className="input" />
              </Field>
            </div>
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              {t('These details appear on the 80G tax exemption receipt. To issue 80G receipts, mark donations as "80G Eligible" when recording them and ensure the donor\'s PAN is captured.')}
            </p>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="tax80g" />
          </>
        )}

        {/* Assets */}
        {activeTab === 'assets' && (
          <>
            <Field label={t('Maximum Borrow Duration (days)')} hint={t('Staff cannot borrow assets for longer than this many days')}>
              <input
                type="number"
                {...register('assetMaxBorrowDays', { min: 1, max: 30, valueAsNumber: true })}
                className="input w-28"
                min={1} max={30}
              />
            </Field>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="assets" />
          </>
        )}

        {/* Mahaprasad */}
        {activeTab === 'mahaprasad' && (
          <>
            {/* Day-wise pricing */}
            <Field
              label={t('Price per Plate by Day (₹)')}
              hint={t('Each paid coupon uses the price for its day of issue — changing this does not affect already-issued coupons')}>
              <div className="grid grid-cols-7 gap-2 mt-1">
                {[
                  ['Mon', 'monday'],
                  ['Tue', 'tuesday'],
                  ['Wed', 'wednesday'],
                  ['Thu', 'thursday'],
                  ['Fri', 'friday'],
                  ['Sat', 'saturday'],
                  ['Sun', 'sunday'],
                ].map(([lbl, key]) => (
                  <div key={key} className="text-center">
                    <p className="text-xs font-semibold text-gray-500 mb-1">{lbl}</p>
                    <input
                      type="number"
                      {...register(`mahaprasadDayPricing.${key}`, { min: 0, valueAsNumber: true })}
                      className="input text-center px-1 text-sm"
                      min={0} step={1} placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('Daily Cap')} hint={t('Max coupons per day (0 = no limit)')}>
                <input
                  type="number"
                  {...register('mahaprasadDailyCap', { min: 0, valueAsNumber: true })}
                  className="input w-32"
                  min={0} step={1} placeholder="0"
                />
              </Field>
              <Field label={t('Coupon Validity (days)')} hint={t('Days redeemable after issue (0 = no expiry)')}>
                <input
                  type="number"
                  {...register('mahaprasadCouponValidityDays', { min: 0, valueAsNumber: true })}
                  className="input w-32"
                  min={0} step={1} placeholder="1"
                />
              </Field>
            </div>

            {/* Thermal Printer */}
            <Field
              label={t('Thermal Printer Name')}
              hint={t('Windows printer name exactly as shown in "Printers & scanners" — required for one-click receipt printing via QZ Tray')}>
              <div className="flex gap-2">
                {detectedPrinters.length > 0 ? (
                  <select
                    value={watch('mahaprasadPrinterName') || ''}
                    onChange={(e) => setValue('mahaprasadPrinterName', e.target.value, { shouldDirty: true })}
                    className="input flex-1 text-sm">
                    <option value="">{t('Select printer…')}</option>
                    {detectedPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input
                    {...register('mahaprasadPrinterName')}
                    className="input flex-1 text-sm"
                    placeholder={t('e.g. Epson TM-T20III')}
                  />
                )}
                <button type="button" onClick={handleDetectPrinters} disabled={detectLoading}
                  className="shrink-0 btn btn-ghost border text-sm flex items-center gap-1.5 disabled:opacity-50">
                  <Printer className="h-4 w-4" />
                  {detectLoading ? t('Detecting…') : t('Detect')}
                </button>
              </div>
            </Field>

            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
              <p className="font-semibold">{t('One-click thermal printing setup:')}</p>
              <p>{t('1. Download and install')} <span className="font-semibold">{t('QZ Tray')}</span> {t('from')} <span className="font-mono">{t('qz.io')}</span> {t('on the counter PC')}</p>
              <p>{t('2. Start QZ Tray — it runs in the system tray')}</p>
              <p>{t('3. Click')} <span className="font-semibold">{t('Detect')}</span> {t('above to auto-fill the printer name')}</p>
              <p>{t('4. Save Settings — the counter will now print receipts automatically on issue')}</p>
            </div>

            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="mahaprasad" />
          </>
        )}

      </div>
    </div>
  );
};

export default Settings;
