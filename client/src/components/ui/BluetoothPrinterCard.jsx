import { useState } from 'react';
import { Bluetooth, Check, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  bluetoothSupported, pairedDevices, printBluetoothTest, saveBluetoothPrinter, useBluetoothPrinter,
} from '../../utils/bluetoothPrinter.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

const PAPER = [80, 58];

/**
 * More → Bluetooth printer (Android app): pick the receipt printer paired with this phone and
 * the paper width, print a test page. Booking slips, cash handover slips and Mahaprasad coupons
 * then print to it with one tap.
 */
export default function BluetoothPrinterCard() {
  const t = useT();
  const printer = useBluetoothPrinter();
  const [devices, setDevices] = useState(null);   // the list while choosing
  const [paper, setPaper] = useState(printer?.paperWidth || 80);
  const [busy, setBusy] = useState('');           // 'list' | 'test'

  if (!bluetoothSupported()) return null;

  const fail = (err) => { haptics.error(); toast.error(t(err?.message || 'Printer not reachable')); };

  const choose = async () => {
    setBusy('list');
    try {
      const list = await pairedDevices();
      if (!list.length) toast.error(t('No paired devices — pair the printer in the phone’s Bluetooth settings first'));
      setDevices(list);
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  const pick = (device) => {
    saveBluetoothPrinter({ ...device, paperWidth: paper });
    setDevices(null);
    haptics.success();
    toast.success(t('{name} chosen — slips and coupons print to it', { name: device.name }));
  };

  const setPaperWidth = (w) => {
    setPaper(w);
    if (printer) saveBluetoothPrinter({ ...printer, paperWidth: w });
  };

  const test = async () => {
    setBusy('test');
    try {
      await printBluetoothTest(printer);
      haptics.success();
      toast.success(t('Test page sent to {name}', { name: printer.name }));
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <Bluetooth className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{t('Bluetooth printer')}</p>
          <p className="truncate text-xs text-gray-500">
            {printer ? `${printer.name} · ${printer.paperWidth || 80} mm` : t('Not chosen — slips are shared as PDF')}
          </p>
        </div>
      </div>

      {devices ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="mb-2 text-xs text-gray-500">{t('Paired with this phone — tap the printer:')}</p>
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.address}>
                <button type="button" onClick={() => pick(d)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm active:bg-gray-50">
                  <Printer className={`h-4 w-4 shrink-0 ${d.printer ? 'text-primary-600' : 'text-gray-300'}`} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {printer?.address === d.address && <Check className="h-4 w-4 text-green-600" />}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setDevices(null)} className="mt-2 min-h-11 text-sm text-gray-500">{t('Cancel')}</button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{t('Paper')}</span>
            <span className="inline-flex rounded-full bg-gray-100 p-0.5" role="radiogroup" aria-label={t('Paper')}>
              {PAPER.map((w) => (
                <button key={w} type="button" role="radio" aria-checked={paper === w} onClick={() => setPaperWidth(w)}
                  className={`min-h-[32px] rounded-full px-3 text-xs font-semibold ${paper === w ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-200' : 'text-gray-500'}`}>
                  {w} mm
                </button>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={choose} disabled={Boolean(busy)} className="btn-secondary min-h-11 flex-1 text-sm">
              {busy === 'list' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
              {printer ? t('Change printer') : t('Choose printer')}
            </button>
            {printer && (
              <button type="button" onClick={test} disabled={Boolean(busy)} className="btn-primary min-h-11 flex-1 text-sm">
                {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} {t('Print test page')}
              </button>
            )}
          </div>
          {printer ? (
            <button type="button" onClick={() => saveBluetoothPrinter(null)} className="min-h-11 text-xs text-red-600">{t('Stop using this printer')}</button>
          ) : (
            <p className="text-xs text-gray-500">{t('Pair the printer first in the phone’s Bluetooth settings (PIN is usually 0000 or 1234), then choose it here.')}</p>
          )}
        </div>
      )}
    </section>
  );
}
