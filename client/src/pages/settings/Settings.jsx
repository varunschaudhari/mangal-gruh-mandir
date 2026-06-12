import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, MessageCircle, MessageSquare, Bell, Armchair,
  Save, Eye, EyeOff, CheckCircle2, Send, FileCheck2, Utensils, Printer,
} from 'lucide-react';
import { getSettings, updateSettings, testWhatsApp } from '../../api/settings.api.js';
import { connectToQzTray, getPrinters } from '../../utils/thermalPrint.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

// ── Reusable primitives ───────────────────────────────────────────────────────

const Field = ({ label, hint, error, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
    {children}
    {hint  && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const Toggle = ({ label, description, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 cursor-pointer">
    <div>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
    </div>
    <div className="shrink-0">
      <input type="checkbox" checked={!!checked} onChange={onChange} className="sr-only" />
      <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}>
        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </div>
  </label>
);

const SecretInput = ({ reg, name, placeholder, hint }) => {
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
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
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
];

const TAB_FIELDS = {
  temple:     ['templeName', 'templeAddress', 'templePhone', 'templeEmail', 'templeWebsite'],
  whatsapp:   ['waEnabled', 'waPhoneNumberId', 'waAccessToken', 'waTemplateName'],
  sms:        ['smsEnabled', 'msg91AuthKey', 'msg91TemplateId'],
  alerts:     ['alertOnOutOfStock', 'alertOnLowStock', 'alertOnReorder'],
  tax80g:     ['trustPAN', 'reg80GNumber', 'reg80GFrom', 'reg80GTo'],
  assets:     ['assetMaxBorrowDays'],
  mahaprasad: ['mahaprasadDayPricing', 'mahaprasadDailyCap', 'mahaprasadCouponValidityDays', 'mahaprasadPrinterName'],
};

// ── Save footer (per tab) ─────────────────────────────────────────────────────

function SaveFooter({ onSave, isPending, savedTabId, tabId }) {
  const justSaved = savedTabId === tabId;
  return (
    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 mt-6">
      <button type="button" onClick={onSave} disabled={isPending}
        className="btn-primary flex items-center gap-2 disabled:opacity-50">
        <Save className="h-4 w-4" />
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {justSaved && !isPending && (
        <span className="flex items-center gap-1.5 text-xs text-green-600 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4" /> Saved
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const Settings = () => {
  const qc = useQueryClient();
  const { register, reset, watch, setValue, getValues } = useForm();

  const [activeTab,       setActiveTab]       = useState('temple');
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
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSavedTabId(activeTab);
      setTimeout(() => setSavedTabId(null), 3000);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
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
      toast.error('QZ Tray not reachable. Is it installed and running?');
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
          {TABS.map(({ id, label, icon: Icon }) => {
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
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-2xl space-y-5">

        {/* Temple */}
        {activeTab === 'temple' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Temple Name">
                <input {...register('templeName')} className="input" placeholder="Mangal Grah Mandir" />
              </Field>
              <Field label="Phone">
                <input {...register('templePhone')} className="input" type="tel" placeholder="+91 XXXXX XXXXX" />
              </Field>
            </div>
            <Field label="Address">
              <input {...register('templeAddress')} className="input" placeholder="Village, District, State" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email">
                <input {...register('templeEmail')} className="input" type="email" placeholder="temple@example.com" />
              </Field>
              <Field label="Website">
                <input {...register('templeWebsite')} className="input" placeholder="www.example.com" />
              </Field>
            </div>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="temple" />
          </>
        )}

        {/* WhatsApp */}
        {activeTab === 'whatsapp' && (
          <>
            <Toggle
              label="Enable WhatsApp Alerts"
              description="Send WhatsApp messages when stock drops below threshold"
              checked={waEnabled}
              onChange={(e) => setValue('waEnabled', e.target.checked, { shouldDirty: true })}
            />
            {waEnabled && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Field label="Phone Number ID" hint="Meta Developer Console → WhatsApp → API Setup">
                  <input {...register('waPhoneNumberId')} className="input font-mono text-sm" placeholder="1100536663150619" />
                </Field>
                <Field label="Access Token" hint="Paste new value to update — use permanent System User token">
                  <SecretInput reg={register} name="waAccessToken" placeholder="EAAxxxxxxxx…" hint="Masked for security — paste to update" />
                </Field>
                <Field label="Template Name" hint="Must match your approved template in Meta Business Manager">
                  <input {...register('waTemplateName')} className="input" placeholder="stock_alert" />
                </Field>
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">Quick setup:</p>
                  <p>1. developers.facebook.com → Create App → Add WhatsApp</p>
                  <p>2. Create a message template named <span className="font-mono font-bold">stock_alert</span></p>
                  <p>3. Generate a permanent System User token (never expires)</p>
                  <p>4. Enable WhatsApp on individual users in User Management</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/30 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Test Connection</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Sends a <span className="font-mono">hello_world</span> template to verify your credentials.
                    The recipient must be in your Meta test phone list.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => { setTestPhone(e.target.value); setTestResult(null); }}
                      placeholder="919876543210  (no + or spaces)"
                      className="input flex-1 text-sm font-mono"
                    />
                    <button
                      type="button"
                      disabled={testLoading || !testPhone}
                      onClick={async () => {
                        setTestLoading(true); setTestResult(null);
                        try {
                          await testWhatsApp(testPhone);
                          setTestResult({ ok: true, msg: 'Message sent! Check WhatsApp on ' + testPhone });
                        } catch (err) {
                          setTestResult({ ok: false, msg: err.response?.data?.message || 'Failed to send' });
                        } finally {
                          setTestLoading(false);
                        }
                      }}
                      className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50">
                      <Send className="h-4 w-4" />
                      {testLoading ? 'Sending…' : 'Send Test'}
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
              label="Enable SMS Alerts"
              description="Send SMS when stock drops below threshold"
              checked={smsEnabled}
              onChange={(e) => setValue('smsEnabled', e.target.checked, { shouldDirty: true })}
            />
            {smsEnabled && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <Field label="MSG91 Auth Key" hint="msg91.com → API → Auth Key">
                  <SecretInput reg={register} name="msg91AuthKey" placeholder="xxxxxx…" hint="Masked for security — paste to update" />
                </Field>
                <Field label="Template ID" hint="MSG91 → Campaigns → Flow → Your template ID">
                  <input {...register('msg91TemplateId')} className="input font-mono text-sm" placeholder="6xxxxxxxxxxxxxxxxx" />
                </Field>
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                  <p className="font-semibold">Quick setup:</p>
                  <p>1. Sign up at msg91.com → Create a Flow template</p>
                  <p>2. Add variables: product, department, quantity, unit, status</p>
                  <p>3. Copy Auth Key and Template ID above</p>
                  <p>4. Enable SMS on individual users in User Management</p>
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
                label="Out of Stock"
                description="Alert when quantity reaches 0"
                checked={watch('alertOnOutOfStock')}
                onChange={(e) => setValue('alertOnOutOfStock', e.target.checked, { shouldDirty: true })}
              />
              <div className="pt-4">
                <Toggle
                  label="Low Stock"
                  description="Alert when quantity drops at or below minimum stock level"
                  checked={watch('alertOnLowStock')}
                  onChange={(e) => setValue('alertOnLowStock', e.target.checked, { shouldDirty: true })}
                />
              </div>
              <div className="pt-4">
                <Toggle
                  label="Reorder Soon"
                  description="Alert when quantity drops at or below reorder point"
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
              <Field label="Trust PAN" hint="PAN of the registered trust / temple">
                <input {...register('trustPAN')} className="input uppercase font-mono" placeholder="AAAAB1234C" />
              </Field>
              <Field label="80G Registration No." hint="e.g. 80G/2023/0012345">
                <input {...register('reg80GNumber')} className="input font-mono text-sm" placeholder="80G/YYYY/XXXXXXX" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Valid From" hint="Registration validity start date">
                <input {...register('reg80GFrom')} type="date" className="input" />
              </Field>
              <Field label="Valid To" hint="Registration validity end date">
                <input {...register('reg80GTo')} type="date" className="input" />
              </Field>
            </div>
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              These details appear on the 80G tax exemption receipt. To issue 80G receipts, mark donations
              as "80G Eligible" when recording them and ensure the donor's PAN is captured.
            </p>
            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="tax80g" />
          </>
        )}

        {/* Assets */}
        {activeTab === 'assets' && (
          <>
            <Field label="Maximum Borrow Duration (days)" hint="Staff cannot borrow assets for longer than this many days">
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
              label="Price per Plate by Day (₹)"
              hint="Each paid coupon uses the price for its day of issue — changing this does not affect already-issued coupons">
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
              <Field label="Daily Cap" hint="Max coupons per day (0 = no limit)">
                <input
                  type="number"
                  {...register('mahaprasadDailyCap', { min: 0, valueAsNumber: true })}
                  className="input w-32"
                  min={0} step={1} placeholder="0"
                />
              </Field>
              <Field label="Coupon Validity (days)" hint="Days redeemable after issue (0 = no expiry)">
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
              label="Thermal Printer Name"
              hint='Windows printer name exactly as shown in "Printers & scanners" — required for one-click receipt printing via QZ Tray'>
              <div className="flex gap-2">
                {detectedPrinters.length > 0 ? (
                  <select
                    value={watch('mahaprasadPrinterName') || ''}
                    onChange={(e) => setValue('mahaprasadPrinterName', e.target.value, { shouldDirty: true })}
                    className="input flex-1 text-sm">
                    <option value="">Select printer…</option>
                    {detectedPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input
                    {...register('mahaprasadPrinterName')}
                    className="input flex-1 text-sm"
                    placeholder="e.g. Epson TM-T20III"
                  />
                )}
                <button type="button" onClick={handleDetectPrinters} disabled={detectLoading}
                  className="shrink-0 btn btn-ghost border text-sm flex items-center gap-1.5 disabled:opacity-50">
                  <Printer className="h-4 w-4" />
                  {detectLoading ? 'Detecting…' : 'Detect'}
                </button>
              </div>
            </Field>

            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
              <p className="font-semibold">One-click thermal printing setup:</p>
              <p>1. Download and install <span className="font-semibold">QZ Tray</span> from <span className="font-mono">qz.io</span> on the counter PC</p>
              <p>2. Start QZ Tray — it runs in the system tray</p>
              <p>3. Click <span className="font-semibold">Detect</span> above to auto-fill the printer name</p>
              <p>4. Save Settings — the counter will now print receipts automatically on issue</p>
            </div>

            <SaveFooter onSave={saveTab} isPending={mutation.isPending} savedTabId={savedTabId} tabId="mahaprasad" />
          </>
        )}

      </div>
    </div>
  );
};

export default Settings;
