import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, MessageCircle, MessageSquare, Bell,
  Armchair, Save, Eye, EyeOff, CheckCircle2, Send, FileCheck2,
} from 'lucide-react';
import { getSettings, updateSettings, testWhatsApp } from '../../api/settings.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const Section = ({ icon: Icon, title, subtitle, color, bg, children }) => (
  <div className="rounded-xl border border-gray-100 overflow-hidden">
    <div className={`flex items-center gap-3 px-5 py-4 border-b ${bg}`}>
      <Icon className={`h-5 w-5 ${color}`} />
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="p-5 bg-white space-y-4">{children}</div>
  </div>
);

const Field = ({ label, hint, error, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
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
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
};

const Settings = () => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm();
  const [testPhone,   setTestPhone]   = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult,  setTestResult]  = useState(null); // { ok, msg }

  const waEnabled  = watch('waEnabled');
  const smsEnabled = watch('smsEnabled');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.data?.data) reset(data.data.data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Configure temple info, notifications and system preferences"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Settings' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        {/* ── Temple Information ── */}
        <Section icon={Building2} title="Temple Information" subtitle="Shown on receipts, reports and printouts" color="text-orange-600" bg="bg-orange-50">
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
        </Section>

        {/* ── WhatsApp ── */}
        <Section icon={MessageCircle} title="WhatsApp Notifications" subtitle="Meta Cloud API — free up to 1,000 conversations/month" color="text-green-600" bg="bg-green-50">
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

              {/* ── Test WhatsApp ── */}
              <div className="rounded-lg border border-green-200 bg-white p-4">
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
                    className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-50"
                  >
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
        </Section>

        {/* ── SMS ── */}
        <Section icon={MessageSquare} title="SMS Notifications" subtitle="MSG91 — reliable Indian SMS gateway" color="text-blue-600" bg="bg-blue-50">
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
        </Section>

        {/* ── Alert Triggers ── */}
        <Section icon={Bell} title="Alert Triggers" subtitle="Which stock levels send notifications" color="text-amber-600" bg="bg-amber-50">
          <div className="space-y-3 divide-y divide-gray-100">
            <Toggle
              label="Out of Stock"
              description="Alert when quantity reaches 0"
              checked={watch('alertOnOutOfStock')}
              onChange={(e) => setValue('alertOnOutOfStock', e.target.checked, { shouldDirty: true })}
            />
            <div className="pt-3">
              <Toggle
                label="Low Stock"
                description="Alert when quantity drops at or below minimum stock level"
                checked={watch('alertOnLowStock')}
                onChange={(e) => setValue('alertOnLowStock', e.target.checked, { shouldDirty: true })}
              />
            </div>
            <div className="pt-3">
              <Toggle
                label="Reorder Soon"
                description="Alert when quantity drops at or below reorder point"
                checked={watch('alertOnReorder')}
                onChange={(e) => setValue('alertOnReorder', e.target.checked, { shouldDirty: true })}
              />
            </div>
          </div>
        </Section>

        {/* ── 80G / Tax Exemption ── */}
        <Section icon={FileCheck2} title="80G Tax Exemption" subtitle="Section 80G registration details — printed on 80G donation receipts" color="text-emerald-600" bg="bg-emerald-50">
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
            These details appear on the 80G tax exemption receipt. To issue 80G receipts, mark donations as "80G Eligible" when recording them and ensure the donor's PAN is captured.
          </p>
        </Section>

        {/* ── Asset Settings ── */}
        <Section icon={Armchair} title="Asset Settings" subtitle="Configuration for the asset borrowing module" color="text-purple-600" bg="bg-purple-50">
          <Field label="Maximum Borrow Duration (days)" hint="Staff cannot borrow assets for longer than this many days">
            <input
              type="number"
              {...register('assetMaxBorrowDays', { min: 1, max: 30, valueAsNumber: true })}
              className="input w-28"
              min={1} max={30}
            />
          </Field>
        </Section>

        {/* ── Save button ── */}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
            <Save className="h-4 w-4" />
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
          {!isDirty && !mutation.isPending && (
            <span className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-4 w-4" /> All changes saved
            </span>
          )}
        </div>

      </form>
    </div>
  );
};

export default Settings;
