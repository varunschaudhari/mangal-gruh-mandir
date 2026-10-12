import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Browser } from '@capacitor/browser';
import { printBookingSlip, printBookingReceipt, whatsappShareUrl } from '../../../utils/bookingReceipt.js';
import { isNative } from '../../../utils/platform.js';
import { useT } from '../../../i18n/index.jsx';
import { toKey } from './counterUtils.js';

// ── Counter preferences (this device) ─────────────────────────────────────────
const PREFS_KEY = 'mgm-booking-counter';
const DEFAULT_PREFS = { autoPrint: false, keep: true, sankalpOpen: false };

const readPrefs = () => {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
};

/** [prefs, setPref(name, value)] — remembered in localStorage. */
export function useCounterPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = useCallback((name, value) => {
    setPrefs((p) => {
      const next = { ...p, [name]: value };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);
  return [prefs, setPref];
}

// ── Bookings made in this session (for reprints) ──────────────────────────────
const SESSION_KEY = 'mgm-booking-session';
const readSession = () => {
  try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Last 5 bookings made at this counter since the tab was opened. */
export function useSessionBookings() {
  const [list, setList] = useState(readSession);
  const add = useCallback((booking) => {
    setList((prev) => {
      const next = [booking, ...prev.filter((b) => b._id !== booking._id)].slice(0, 5);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [list, add];
}

// ── Today's date, rolling over at midnight ────────────────────────────────────
export function useToday() {
  const [today, setToday] = useState(() => toKey());
  useEffect(() => {
    const id = setInterval(() => setToday((d) => (d === toKey() ? d : toKey())), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

// ── Receipt actions (slip, A4, WhatsApp) with friendly errors ─────────────────
export function useReceiptActions(settings) {
  const t = useT();

  const printSlip = useCallback(async (booking) => {
    try {
      const how = await printBookingSlip(booking, settings);
      if (how === 'thermal') toast.success(t('Slip printed · {receipt}', { receipt: booking.receiptNo }), { id: 'booking-slip' });
      return true;
    } catch (err) {
      const reason = err?.message ? t(err.message) : t('Printer not reachable');
      toast.error(t('Slip not printed — {reason}. The booking is saved.', { reason }), { id: 'booking-slip', duration: 7000 });
      return false;
    }
  }, [settings, t]);

  const printA4 = useCallback(async (booking) => {
    try {
      await printBookingReceipt(booking, settings);
    } catch (err) {
      toast.error(t('Could not open the receipt — {reason}', { reason: err?.message || t('Error') }));
    }
  }, [settings, t]);

  const sendWhatsApp = useCallback((booking) => {
    const url = whatsappShareUrl(booking, settings);
    if (isNative) Browser.open({ url }).catch(() => toast.error(t('Could not open WhatsApp')));
    else window.open(url, '_blank', 'noopener');
  }, [settings, t]);

  return { printSlip, printA4, sendWhatsApp };
}
