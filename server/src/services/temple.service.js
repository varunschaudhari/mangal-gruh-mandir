import Settings from '../models/Settings.js';

// The temple's name and contact details, as entered in Settings → Temple. Reports, receipts,
// Excel files and WhatsApp messages use these instead of a name written into the code.
//
// Kept in memory so PDF and Excel builders can read it without a database call: loaded at
// start-up and reloaded whenever Settings are saved (the server runs as one process).

const DEFAULT_NAME = 'Mangal Grah Mandir';

const DEFAULT_NAME_MR = 'श्री मंगळग्रह मंदिर, अमळनेर';

let current = { name: DEFAULT_NAME, nameMr: DEFAULT_NAME_MR, address: '', phone: '', email: '', website: '', trustReg: '', pan: '', reg80G: '' };

/** Reload from Settings — pass the saved record to skip the read. */
export async function refreshTemple(settings) {
  const s = settings || await Settings.getOrCreate();
  current = {
    name: s.templeName?.trim() || DEFAULT_NAME,
    nameMr: s.templeNameMr?.trim() ?? DEFAULT_NAME_MR,
    address: s.templeAddress?.trim() || '',
    phone: s.templePhone?.trim() || '',
    email: s.templeEmail?.trim() || '',
    website: s.templeWebsite?.trim() || '',
    // Printed on receipts and vouchers (Settings → Temple and → 80G)
    trustReg: s.trustRegNumber?.trim() || '',
    pan: s.trustPAN?.trim() || '',
    reg80G: s.reg80GNumber?.trim() || '',
  };
  return current;
}

/** { name, nameMr, address, phone, email, website, trustReg, pan, reg80G } */
export const temple = () => current;
