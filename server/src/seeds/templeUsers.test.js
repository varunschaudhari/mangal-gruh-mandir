import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE } from './templeUsers.js';
import { rolesSeed } from './roles.seed.js';

test('every temple login has a built-in role and its own e-mail', () => {
  const slugs = new Set(rolesSeed.map((r) => r.slug));
  for (const p of PEOPLE) assert.ok(slugs.has(p.role), `${p.name}: role ${p.role}`);
  const emails = PEOPLE.map((p) => p.email);
  assert.equal(new Set(emails).size, emails.length);
  for (const e of emails) assert.equal(e, e.toLowerCase());
});

test('hall managers see bookings and scan slips, nothing more', () => {
  const role = rolesSeed.find((r) => r.slug === 'hall_manager');
  assert.deepEqual([...role.permissions].sort(), ['bookings:checkin', 'bookings:read']);
});
