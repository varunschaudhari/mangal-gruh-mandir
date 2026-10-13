import { useQuery } from '@tanstack/react-query';
import { getTemple } from '../api/settings.api.js';

// The temple's name and contact details, as entered in Settings → Temple: shown in the app's
// header and on receipts, slips and labels instead of a name written into the code.
//
// Print helpers are plain functions, so the last known value is kept here (and on the device,
// for the next start and for offline use). useTemple() — used by the app's header — fetches it.

const KEY = 'mgm-temple';
const DEFAULT = {
  name: 'Mangal Grah Mandir', nameMr: 'श्री मंगळग्रह मंदिर, अमळनेर',
  address: '', phone: '', email: '', website: '', trustReg: '', pan: '', reg80G: '',
};

let current = DEFAULT;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.name) current = { ...DEFAULT, ...saved };
} catch { /* private mode or bad JSON */ }

/** { name, nameMr, address, phone, email, website, trustReg, pan, reg80G } — the last value fetched. */
export const temple = () => current;

/** The name, safe to put in printed HTML. */
export const templeHtml = () => current.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function remember(next) {
  if (!next?.name) return current;
  current = { ...DEFAULT, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  return current;
}

/** Fetches the temple details (once per session; refetched after Settings are saved). */
export function useTemple() {
  const { data } = useQuery({
    queryKey: ['temple'],
    queryFn: () => getTemple().then((r) => remember(r.data.data)),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  return data || current;
}
