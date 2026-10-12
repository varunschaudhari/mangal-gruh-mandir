import { describe, it, expect, beforeEach } from 'vitest';
import { addRecent, getRecent } from './recentNav.js';

// Tests run in Node: a minimal in-memory localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  clear: () => store.clear(),
};

describe('recently used (More page)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the newest first, once each, at most six', () => {
    for (const p of ['/a', '/b', '/c', '/a', '/d', '/e', '/f', '/g']) addRecent('u1', p);
    expect(getRecent('u1')).toEqual(['/g', '/f', '/e', '/d', '/a', '/c']);
  });

  it('is kept per user', () => {
    addRecent('u1', '/bookings/day');
    expect(getRecent('u2')).toEqual([]);
  });

  it('survives bad stored data', () => {
    localStorage.setItem('mgm-recent-more:u1', '{not json');
    expect(getRecent('u1')).toEqual([]);
    localStorage.setItem('mgm-recent-more:u1', JSON.stringify(['/x', 5, null]));
    expect(getRecent('u1')).toEqual(['/x']);
  });
});
