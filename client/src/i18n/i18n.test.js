import { describe, it, expect } from 'vitest';
import { translate } from './index.jsx';
import common from './mr/common.js';
import mahaprasad from './mr/mahaprasad.js';
import stock from './mr/stock.js';
import dashboard from './mr/dashboard.js';
import attendance from './mr/attendance.js';
import salary from './mr/salary.js';
import booking from './mr/booking.js';
import bookingRegister from './mr/bookingRegister.js';
import bookingSetup from './mr/bookingSetup.js';
import bookingFix from './mr/bookingFix.js';
import bookingShift from './mr/bookingShift.js';
import { navConfig, QUICK_ACTIONS, MOBILE_TABS } from '../components/Layout/navConfig.js';

describe('translate', () => {
  it('returns Marathi when there is an entry', () => {
    expect(translate('mr', 'Save')).toBe('जतन करा');
  });

  it('falls back to the English text', () => {
    expect(translate('mr', 'Some text nobody translated')).toBe('Some text nobody translated');
    expect(translate('en', 'Save')).toBe('Save');
  });

  it('fills in placeholders in both languages', () => {
    expect(translate('en', 'Show more ({n} remaining)', { n: 4 })).toBe('Show more (4 remaining)');
    expect(translate('mr', 'Show more ({n} remaining)', { n: 4 })).toBe('आणखी दाखवा (4 बाकी)');
  });

  it('lets one English word carry two meanings with a |context', () => {
    expect(translate('en', 'Paid|coupon')).toBe('Paid');
    expect(translate('mr', 'Paid|coupon')).toBe('सशुल्क'); // coupon type
    expect(translate('mr', 'Paid')).toBe('भरलेले');        // payment status
    expect(translate('en', 'Unknown thing|ctx')).toBe('Unknown thing');
  });

  it('keeps Void distinct from Cancel', () => {
    expect(translate('mr', 'Void')).not.toBe(translate('mr', 'Cancel'));
  });

  it('passes non-text values through untouched', () => {
    expect(translate('mr', undefined)).toBeUndefined();
    expect(translate('mr', 42)).toBe(42);
  });
});

describe('Marathi dictionaries', () => {
  const all = [common, mahaprasad, stock, dashboard, attendance, salary, booking, bookingRegister, bookingSetup, bookingFix, bookingShift];

  it('translate every menu, tab and quick-action label', () => {
    const labels = [
      ...navConfig.flatMap((g) => [g.label, ...(g.children || []).map((c) => c.label)]),
      ...QUICK_ACTIONS.map((a) => a.label),
      ...Object.values(MOBILE_TABS).map((t) => t.label),
    ];
    const missing = [...new Set(labels)].filter((l) => translate('mr', l) === l);
    expect(missing).toEqual([]);
  });

  it('keep the same {placeholders} as the English text', () => {
    for (const dict of all) {
      for (const [en, mr] of Object.entries(dict)) {
        const names = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
        expect(names(mr), en).toBe(names(en));
      }
    }
  });

  it('do not define the same key twice across areas', () => {
    const seen = new Map();
    for (const [i, dict] of all.entries()) {
      for (const key of Object.keys(dict)) {
        if (seen.has(key) && seen.get(key) !== i) throw new Error(`"${key}" is in two dictionaries`);
        seen.set(key, i);
      }
    }
  });
});
