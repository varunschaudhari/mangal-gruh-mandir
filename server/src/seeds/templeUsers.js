/**
 * The temple's staff logins (the list agreed on 17 Oct 2026). Run it after the go-live clean-up
 * (npm run golive), which removes every login except the super admins.
 *
 *   docker compose exec server npm run users:temple                what it would do (changes nothing)
 *   docker compose exec server npm run users:temple -- --confirm   create / update the logins
 *
 * A new login gets a random password, shown only then; the person must choose their own at first
 * sign-in. A login whose e-mail already exists keeps its password; its name and role are set as
 * listed. People who had a login before keep the same login ID. Change anyone later in Admin → Users.
 */
import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { rolesSeed } from './roles.seed.js';

export const PEOPLE = [
  // Trust — read-only
  { name: 'Anand Mahale', email: 'viewer@mandir.com', role: 'viewer' },
  { name: 'Digamber Mahale', email: 'trustee2@mandir.com', role: 'viewer' },
  { name: 'Suresh Baviskar', email: 'trustee1@mandir.com', role: 'viewer' },
  // Accounts
  { name: 'Harsh', email: 'harsh@mandir.com', role: 'accountant' },
  // Pooja booking counter
  { name: 'Sanjay Sonwane', email: 'sanjay@mandir.com', role: 'booking_counter' },
  // Halls: achari scan the slips; managers also see the bookings and the day / sankalp sheet
  { name: 'Hall Achari 1', email: 'hall.achari1@mandir.com', role: 'hall_checkin' },
  { name: 'Hall Achari 2', email: 'hall.achari2@mandir.com', role: 'hall_checkin' },
  { name: 'Hall Manager 1', email: 'hall.manager1@mandir.com', role: 'hall_manager' },
  { name: 'Hall Manager 2', email: 'hall.manager2@mandir.com', role: 'hall_manager' },
  // Purchase managers
  { name: 'Bhushan Patil', email: 'kitchen@mandir.com', role: 'store_manager' },
  { name: 'Manohar Tayade', email: 'manager@mandir.com', role: 'store_manager' },
];

async function main() {
  const confirm = process.argv.includes('--confirm');
  await connectDB();

  // The roles these logins need, as defined in roles.seed.js (built-in roles, kept up to date)
  for (const slug of new Set(PEOPLE.map((p) => p.role))) {
    const def = rolesSeed.find((r) => r.slug === slug);
    if (!def) throw new Error(`Role "${slug}" is missing from roles.seed.js`);
    if (confirm) await Role.updateOne({ slug }, { $set: def }, { upsert: true });
  }

  console.log(confirm ? '\nLogins (write the new passwords down — they are shown only now):\n' : '\nPreview — nothing is changed (add --confirm):\n');
  for (const p of PEOPLE) {
    const label = `${p.name} (${rolesSeed.find((r) => r.slug === p.role).name})`;
    const existing = await User.findOne({ email: p.email });
    if (existing) {
      const change = [existing.name !== p.name && `name "${existing.name}" → "${p.name}"`, existing.role !== p.role && `role ${existing.role} → ${p.role}`]
        .filter(Boolean).join(', ');
      if (confirm && change) await User.updateOne({ _id: existing._id }, { $set: { name: p.name, role: p.role, isActive: true } });
      console.log(`  ${p.email.padEnd(28)} ${label} — ${change ? (confirm ? `updated: ${change}` : `would update: ${change}`) : 'already as listed'}`);
      continue;
    }
    if (!confirm) {
      console.log(`  ${p.email.padEnd(28)} ${label} — would be created`);
      continue;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    await User.create({ name: p.name, email: p.email, password, role: p.role, departments: [], isActive: true, mustChangePassword: true });
    console.log(`  ${p.email.padEnd(28)} ${password}   ${label}`);
  }
  if (confirm) console.log('\nEach new person is asked to choose their own password at first sign-in.\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .catch((err) => { console.error('[users:temple] failed:', err.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
