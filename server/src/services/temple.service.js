import Settings from '../models/Settings.js';

// The temple's name and contact details, as entered in Settings → Temple. Reports, receipts,
// Excel files and WhatsApp messages use these instead of a name written into the code.
//
// Kept in memory so PDF and Excel builders can read it without a database call: loaded at
// start-up and reloaded whenever Settings are saved (the server runs as one process).

const DEFAULT_NAME = 'Mangal Grah Mandir';

let current = { name: DEFAULT_NAME, address: '', phone: '', email: '' };

/** Reload from Settings — pass the saved record to skip the read. */
export async function refreshTemple(settings) {
  const s = settings || await Settings.getOrCreate();
  current = {
    name: s.templeName?.trim() || DEFAULT_NAME,
    address: s.templeAddress?.trim() || '',
    phone: s.templePhone?.trim() || '',
    email: s.templeEmail?.trim() || '',
  };
  return current;
}

/** { name, address, phone, email } */
export const temple = () => current;
