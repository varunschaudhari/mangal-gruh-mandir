import { describe, it, expect } from 'vitest';
import {
  getMobileTabs, resolveActiveTab, isTaskRoute, QUICK_ACTIONS, MOBILE_TABS,
} from './navConfig.js';
import { ROLE_PERMISSIONS } from '../../utils/permissions.js';

// Same rule as hooks/usePermissions.js
const canFor = (role) => (...required) => {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || required.every((p) => perms.includes(p));
};

const tabsFor = (role) => {
  const can = canFor(role);
  const quick = QUICK_ACTIONS.filter((a) => can(a.permission));
  return getMobileTabs(role, can, quick.length ? 2 : 3);
};

describe('getMobileTabs', () => {
  it('gives admins Stock and Payments next to the + button', () => {
    expect(tabsFor('admin').map((t) => t.key)).toEqual(['stock', 'payments']);
    expect(tabsFor('super_admin').map((t) => t.key)).toEqual(['stock', 'payments']);
  });

  it('gives the booking counter its bookings and the day sheet', () => {
    expect(tabsFor('booking_counter').map((t) => t.key)).toEqual(['bookings', 'daySheet']);
    const can = canFor('booking_counter');
    expect(QUICK_ACTIONS.filter((a) => can(a.permission)).map((a) => a.label)).toEqual(['New Booking']);
  });

  it('gives the redeem counter only the scanner', () => {
    expect(tabsFor('mahaprasad_redeem').map((t) => t.key)).toEqual(['scan']);
  });

  it('never shows a tab the role is not allowed to open', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const can = canFor(role);
      for (const tab of tabsFor(role)) {
        expect(can(tab.permission), `${role} → ${tab.key}`).toBe(true);
      }
    }
  });

  it('falls back to permission order for custom roles', () => {
    const can = (p) => p === 'donations:read';
    expect(getMobileTabs('temple_custom_role', can, 3).map((t) => t.key)).toEqual(['donations']);
  });

  it('has a route for every tab', () => {
    for (const tab of Object.values(MOBILE_TABS)) expect(tab.to).toMatch(/^\//);
  });
});

describe('quick actions', () => {
  it('only offers what the role can do', () => {
    const can = canFor('mahaprasad_redeem');
    expect(QUICK_ACTIONS.filter((a) => can(a.permission)).map((a) => a.label)).toEqual(['Scan Coupon']);
  });

  it('gives viewers none (no + button)', () => {
    const can = canFor('viewer');
    expect(QUICK_ACTIONS.filter((a) => can(a.permission))).toHaveLength(0);
  });
});

describe('resolveActiveTab', () => {
  const tabs = [
    { key: 'scan', ...MOBILE_TABS.scan },
    { key: 'coupons', ...MOBILE_TABS.coupons },
    { key: 'stock', ...MOBILE_TABS.stock },
  ];

  it('picks the most specific tab', () => {
    expect(resolveActiveTab('/mahaprasad/redeem', tabs)).toBe('scan');
    expect(resolveActiveTab('/mahaprasad/history', tabs)).toBe('coupons');
    expect(resolveActiveTab('/mahaprasad', tabs)).toBe('coupons');
  });

  it('lights a tab for its related screens', () => {
    expect(resolveActiveTab('/transactions/stock-out', tabs)).toBe('stock');
    expect(resolveActiveTab('/inventory/ledger', tabs)).toBe('stock');
  });

  it('uses Home for the dashboard and More for everything else', () => {
    expect(resolveActiveTab('/dashboard', tabs)).toBe('home');
    expect(resolveActiveTab('/masters/products', tabs)).toBe('more');
    expect(resolveActiveTab('/mahaprasadx', tabs)).toBe('more');
  });
});

describe('isTaskRoute (full-screen forms hide the tab bar)', () => {
  it.each([
    ['/purchases/new', true],
    ['/purchases/abc123/edit', true],
    ['/assets/borrows/abc/return', true],
    ['/transactions/stock-out', true],
    ['/change-password', true],
    ['/transactions/history', false],
    ['/purchases', false],
    ['/dashboard', false],
  ])('%s → %s', (path, expected) => {
    expect(isTaskRoute(path)).toBe(expected);
  });
});
