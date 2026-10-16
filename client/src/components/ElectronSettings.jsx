import { useState, useEffect, useRef } from 'react';
import { Settings, X, Check, Wifi, WifiOff, ChevronDown, AlertCircle, Printer, Loader2, Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { printTestPage } from '../utils/thermalPrint.js';
import { useT } from '../i18n/index.jsx';

// Keywords that suggest a thermal/POS printer
const THERMAL_KEYWORDS = ['thermal', 'xprinter', 'xp-', 'epson tm', 'rp-', 'pos-', 'pos ', 'receipt', '58mm', '80mm', 'btp-', 'srp-'];
function findBestThermalPrinter(printers) {
  return (
    printers.find(p => THERMAL_KEYWORDS.some(k => p.name.toLowerCase().includes(k))) ??
    printers.find(p => p.isDefault) ??
    null
  );
}

export default function ElectronSettings() {
  const t = useT();
  const [open, setOpen]         = useState(false);
  const [settings, setSettings] = useState({ apiUrl: '', printerName: '' });
  const [printers, setPrinters] = useState([]);
  const [online, setOnline]     = useState(null);   // null=checking  true/false
  const [lastChecked, setLastChecked] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [printerErr, setPrinterErr] = useState('');
  const [testPrinting, setTestPrinting] = useState(false);
  const savedApiUrl = useRef('');
  // Desktop app updates (see electron/main.js → Auto-update)
  const [appVersion, setAppVersion] = useState('');
  const [update, setUpdate]         = useState(null);   // { state: 'downloading' | 'ready', version }
  const [updateLater, setUpdateLater] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Load settings + subscribe to heartbeat
  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const loaded = s || { apiUrl: '', printerName: '' };
      setSettings(loaded);
      savedApiUrl.current = loaded.apiUrl;
      if (!loaded.apiUrl) setOpen(true);
    });

    // Heartbeat from main process (every 60 s)
    const unsub = window.electronAPI.onOnlineStatus(({ online: on, ts }) => {
      setOnline(on);
      setLastChecked(ts);
    });
    return unsub;
  }, []);

  // Version, and a newer version downloading / ready to install
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateStatus) return undefined; // installed before auto-update existed
    api.getAppVersion().then(setAppVersion).catch(() => {});
    api.getUpdateStatus().then((s) => s && setUpdate(s)).catch(() => {});
    return api.onUpdateStatus(setUpdate);
  }, []);

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    try {
      const r = await window.electronAPI.checkForUpdates();
      if (r.state === 'current') toast.success(t('The desktop app is up to date'));
      else if (r.state === 'downloading') { setUpdate(r); toast(t('Downloading version {version}…', { version: r.version })); }
      else if (r.state === 'ready') setUpdate(r);
      else if (r.state === 'error') toast.error(t('Could not check for updates — check the internet connection'));
    } finally {
      setCheckingUpdate(false);
    }
  }

  // Reload printers & run health check whenever panel opens
  useEffect(() => {
    if (!open) return;
    window.electronAPI.getPrinters().then((list) => {
      setPrinters(list);
      // Auto-select a thermal printer if nothing is chosen yet
      setSettings((s) => {
        if (!s.printerName && list.length > 0) {
          const best = findBestThermalPrinter(list);
          if (best) return { ...s, printerName: best.name };
        }
        return s;
      });
    }).catch(() => setPrinters([]));
    runCheck();
  }, [open]);

  async function runCheck() {
    setOnline(null);
    // Test the URL currently in the field, falling back to the saved one.
    const res = await window.electronAPI.checkOnline(settings.apiUrl?.trim() || undefined);
    setOnline(res.online);
    setLastChecked(Date.now());
  }

  async function handleSave() {
    setPrinterErr('');

    if (!settings.apiUrl.trim()) {
      toast.error(t('Server URL is required'));
      return;
    }

    // Validate printer name against live list (if printers could be fetched)
    if (printers.length > 0 && settings.printerName && !printers.some((p) => p.name === settings.printerName)) {
      setPrinterErr('Printer not found in Windows — pick one from the list or leave blank.');
      return;
    }

    setSaving(true);
    try {
      const saved = await window.electronAPI.saveSettings(settings);
      // Older desktop versions answer { ok: true } only; newer ones refuse a non-https address
      if (saved && saved.ok === false) {
        toast.error(t('The server address must start with https://'));
        return;
      }
      toast.success(t('Settings saved'));
      setOpen(false);

      // Navigate to new URL if it changed
      if (settings.apiUrl !== savedApiUrl.current) {
        savedApiUrl.current = settings.apiUrl;
        window.electronAPI.navigateTo(settings.apiUrl);
      }
    } catch {
      toast.error(t('Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    if (!settings.printerName) {
      toast.error(t('Select a printer first'));
      return;
    }
    setTestPrinting(true);
    try {
      // Check printer status before sending bytes
      if (window.electronAPI?.checkPrinterStatus) {
        const { ok, status } = await window.electronAPI.checkPrinterStatus(settings.printerName);
        if (!ok && status === 'NOT_FOUND') {
          toast.error(t('Printer "{name}" not found in Windows', { name: settings.printerName }));
          return;
        }
        if (!ok) {
          toast(t('Printer status: {status} — attempting print anyway', { status }), { icon: '⚠️' });
        }
      }
      await printTestPage(settings.printerName);
      toast.success(t('Test page sent to printer'));
    } catch (err) {
      toast.error(err.message || t('Test print failed'));
    } finally {
      setTestPrinting(false);
    }
  }

  const checkedAgo = lastChecked
    ? Math.round((Date.now() - lastChecked) / 1000)
    : null;

  return (
    <>
      {/* Floating gear + online dot */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center shadow-lg transition-colors"
        title={t('App Settings')}
      >
        <Settings className="h-5 w-5" />
      </button>
      <span
        className={`fixed bottom-4 right-14 z-50 w-2.5 h-2.5 rounded-full border-2 border-white shadow transition-colors ${
          online === true ? 'bg-green-500' : online === false ? 'bg-red-500' : 'bg-gray-400 animate-pulse'
        }`}
        title={
          online === true  ? (checkedAgo != null ? t('Server reachable (checked {n}s ago)', { n: checkedAgo }) : t('Server reachable')) :
          online === false ? t('Server unreachable') : t('Checking…')
        }
      />

      {/* A new version is downloaded: restart now, or it installs when the app is next closed */}
      {update?.state === 'ready' && !updateLater && (
        <div role="status" className="fixed bottom-4 left-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-green-200 bg-white px-4 py-3 shadow-lg">
          <Download className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{t('Desktop app {version} is ready', { version: update.version })}</p>
            <p className="text-xs text-gray-500">{t('Restart to update, or it installs when you close the app.')}</p>
          </div>
          <button type="button" onClick={() => window.electronAPI.installUpdate()}
            className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
            {t('Restart now')}
          </button>
          <button type="button" onClick={() => setUpdateLater(true)} className="shrink-0 text-xs text-gray-400 hover:text-gray-600">
            {t('Later')}
          </button>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-500" /> {t('App Settings')}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Server URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('Server URL')} <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.apiUrl}
                    onChange={(e) => setSettings((s) => ({ ...s, apiUrl: e.target.value.trim() }))}
                    placeholder="https://mandir.aumora.io"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <button
                    onClick={runCheck}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 shrink-0"
                    title={t('Test connection')}
                  >
                    {online === true  ? <Wifi className="h-4 w-4 text-green-500" />
                    : online === false ? <WifiOff className="h-4 w-4 text-red-500" />
                    :                   <Wifi className="h-4 w-4 text-gray-400 animate-pulse" />}
                    {t('Test')}
                  </button>
                </div>
                {online === true && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="h-3 w-3" /> {t('Server reachable')}
                    {checkedAgo != null && <span className="text-gray-400 ml-1">({checkedAgo}{t('s ago)')}</span>}
                  </p>
                )}
                {online === false && (
                  <p className="text-xs text-red-500 mt-1">
                    {/^http:\/\//i.test(settings.apiUrl || '') && !/\/\/(localhost|127\.0\.0\.1)\b/i.test(settings.apiUrl)
                      ? t('The server address must start with https://')
                      : t('Cannot reach server — check the URL and internet connection')}
                  </p>
                )}
              </div>

              {/* Printer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('Thermal Printer')}</label>
                {printers.length > 0 ? (
                  <div className="relative">
                    <select
                      value={settings.printerName}
                      onChange={(e) => { setSettings((s) => ({ ...s, printerName: e.target.value })); setPrinterErr(''); }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      <option value="">{t('— select printer —')}</option>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}{p.isDefault ? t(' (default)') : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={settings.printerName}
                    onChange={(e) => { setSettings((s) => ({ ...s, printerName: e.target.value })); setPrinterErr(''); }}
                    placeholder={t('Exact Windows printer name')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                )}
                {printerErr && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {printerErr}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">Must match exactly what appears in Windows → Printers &amp; Scanners</p>
                {settings.printerName && (
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    disabled={testPrinting}
                    className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {testPrinting
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Printing…')}</>
                      : <><Printer className="h-3.5 w-3.5" /> {t('Test Print')}</>}
                  </button>
                )}
              </div>
            </div>

            {/* Version and updates */}
            {appVersion && (
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
                <span>
                  {t('Desktop app version {version}', { version: appVersion })}
                  {update?.state === 'downloading' && <span className="ml-1 text-blue-600">· {t('downloading {version}…', { version: update.version })}</span>}
                  {update?.state === 'ready' && <span className="ml-1 text-green-600">· {t('{version} ready — restart to install', { version: update.version })}</span>}
                </span>
                {update?.state === 'ready' ? (
                  <button type="button" onClick={() => window.electronAPI.installUpdate()}
                    className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 font-semibold text-white hover:bg-green-700">{t('Restart now')}</button>
                ) : (
                  <button type="button" onClick={handleCheckUpdate} disabled={checkingUpdate}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} /> {t('Check for updates')}
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                {t('Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-60 transition-colors"
              >
                {saving ? t('Saving…') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
