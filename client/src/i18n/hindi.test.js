import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { translate } from './index.jsx';
import hi from './hi/devotee.js';
import common from './mr/common.js';
import mahaprasad from './mr/mahaprasad.js';
import mahaprasadOnline from './mr/mahaprasadOnline.js';
import booking from './mr/booking.js';
import bookingSetup from './mr/bookingSetup.js';
import bookingCheckIn from './mr/bookingCheckIn.js';
import dashboard from './mr/dashboard.js';

// The screens devotees see — the only ones with Hindi
const DEVOTEE_SCREENS = [
  '../pages/mahaprasad/MahaprasadScreen.jsx', '../pages/bookings/HallScreen.jsx', '../pages/mahaprasad/PublicCoupons.jsx',
  '../pages/mahaprasad/PersonsCount.jsx', '../pages/mahaprasad/OnlinePrasad.jsx', '../pages/bookings/PublicReceipt.jsx', '../utils/halls.js',
];
const mr = { ...common, ...mahaprasad, ...mahaprasadOnline, ...booking, ...bookingSetup, ...bookingCheckIn, ...dashboard };
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();

describe('Hindi (devotee screens)', () => {
  it('translates and falls back to English', () => {
    expect(translate('hi', 'Mahaprasad coupon')).toBe('महाप्रसाद कूपन');
    expect(translate('hi', 'Only {n} left for this day', { n: 5 })).toBe('इस दिन के लिए केवल 5 शेष');
    expect(translate('hi', 'Purchase Register')).toBe('Purchase Register');   // a staff screen: English
  });

  it('keeps every {placeholder} of the English', () => {
    for (const [en, text] of Object.entries(hi)) expect(placeholders(text), en).toEqual(placeholders(en.split('|')[0]));
  });

  it('has every text the devotee screens show in Marathi', () => {
    const missing = [];
    for (const file of DEVOTEE_SCREENS) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|`([^`$\n]*)`/g)) {
        const text = (m[1] ?? m[2]).replace(/\\'/g, "'");
        if (text in mr && !(text in hi)) missing.push(`${file}: ${text}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
