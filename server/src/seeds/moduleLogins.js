/**
 * Logins for the salary, attendance and pooja-booking modules — one per job, for trying each
 * person's view (and for showing the app). Makes sure their roles exist, then creates the logins
 * with a random password that is shown once; each person must choose a new password at first
 * sign-in. A login whose e-mail already exists is left as it is, so it is safe to run again.
 *
 *   npm run users:modules                            e-mails on the super admin's domain
 *   npm run users:modules -- --domain=example.org    e-mails on another domain
 *
 * Rename the people or change their e-mail afterwards in Admin → Users.
 */

import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { rolesSeed } from './roles.seed.js';

const LOGINS = [
  { local: 'salary', name: 'Salary Clerk', role: 'payroll', can: 'Salary: work out and pay salary, advances, bank sheet, PF/ESI files' },
  { local: 'attendance', name: 'Attendance Manager', role: 'attendance_manager', can: 'Attendance: roster, corrections, shifts, machine, leave approval' },
  { local: 'booking', name: 'Booking Counter', role: 'booking_counter', can: 'Pooja booking counter: book and print receipts' },
  { local: 'hall', name: 'Hall Check-in', role: 'hall_checkin', can: 'Scan booking slips at the hall entrance' },
  { local: 'booking.manager', name: 'Booking Manager', role: 'booking_manager', can: 'Voids, booking setup, verify counter cash' },
];

async function main() {
  await connectDB();
  const arg = process.argv.find((a) => a.startsWith('--domain='));
  const admin = await User.findOne({ role: 'super_admin' }).sort({ createdAt: 1 }).select('email').lean();
  const domain = (arg ? arg.split('=')[1] : admin?.email?.split('@')[1]) || 'mandir.local';

  // The roles these logins need, as defined in roles.seed.js (built-in roles, kept up to date)
  for (const slug of new Set(LOGINS.map((l) => l.role))) {
    const def = rolesSeed.find((r) => r.slug === slug);
    if (!def) throw new Error(`Role "${slug}" is missing from roles.seed.js`);
    await Role.updateOne({ slug }, { $set: def }, { upsert: true });
  }

  console.log('\nLogins (write the passwords down — they are shown only now):\n');
  for (const l of LOGINS) {
    const email = `${l.local}@${domain}`;
    if (await User.exists({ email })) {
      console.log(`  ${email.padEnd(32)} already exists — left as it is`);
      continue;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    await User.create({ name: l.name, email, password, role: l.role, departments: [], isActive: true, mustChangePassword: true });
    console.log(`  ${email.padEnd(32)} ${password}   ${l.can}`);
  }
  console.log('\nEach person is asked to choose a new password at first sign-in.\n');
}

main()
  .catch((err) => { console.error('[users:modules] failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
