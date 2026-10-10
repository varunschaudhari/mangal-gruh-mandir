/**
 * Migration: attendance module permissions
 *
 * - admin gets attendance:read / write / manage / approve and salary:read / manage
 * - accountant gets salary:read
 * - creates the "Attendance Supervisor" role (roster + fixing attendance) and the "Employee" role
 * - staff added in the attendance module before it moved to Users get a user each
   (matched by phone number if they already are a user, otherwise a new login is made)
 *
 * Safe to run multiple times — uses $addToSet so it never removes
 * custom permissions that admins may have added via the UI.
 *
 * Run with:  npm run migrate:attendance
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import crypto from 'crypto';
import Role from '../models/Role.js';
import Staff from '../models/Staff.js';
import User from '../models/User.js';
import { rolesSeed } from '../seeds/roles.seed.js';

const PATCHES = [
  { slug: 'admin', add: ['attendance:read', 'attendance:write', 'attendance:manage', 'attendance:approve', 'salary:read', 'salary:manage'] },
  { slug: 'accountant', add: ['salary:read'] },
  // super_admin — already has '*', no change needed
];
const NEW_ROLES = ['attendance_supervisor', 'employee'];

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const migrate = async () => {
  await connectDB();
  console.log('\n[Migration] addAttendancePermissions — starting\n');

  for (const { slug, add } of PATCHES) {
    const role = await Role.findOne({ slug });
    if (!role) {
      console.log(`  SKIP  "${slug}" — role not found in DB`);
      continue;
    }
    const toAdd = add.filter((p) => !role.permissions.includes(p));
    if (toAdd.length === 0) {
      console.log(`  OK    "${slug}" — already has all attendance permissions`);
      continue;
    }
    await Role.updateOne({ slug }, { $addToSet: { permissions: { $each: toAdd } } });
    console.log(`  PATCHED "${slug}" — added: ${toAdd.join(', ')}`);
  }

  for (const slug of NEW_ROLES) {
    const seed = rolesSeed.find((r) => r.slug === slug);
    const res = await Role.updateOne({ slug }, { $setOnInsert: seed }, { upsert: true });
    console.log(res.upsertedCount ? `  CREATED "${slug}"` : `  OK    "${slug}" — already exists`);
  }

  // Staff without a user (made before people were managed in Users) → link or create a user
  const orphans = await Staff.find({ $or: [{ user: null }, { user: { $exists: false } }] });
  if (orphans.length) console.log(`\n  ${orphans.length} staff without a user:`);
  for (const s of orphans) {
    const phone = last10(s.phone);
    let user = phone.length === 10 ? (await User.find({ phone: { $regex: `${phone}$` } }).limit(2)) : [];
    user = user.length === 1 ? user[0] : null;   // only when the phone number points to one person
    let how = 'linked to existing user';
    if (!user || await Staff.exists({ user: user._id })) {
      const email = `${s.staffCode.toLowerCase()}@staff.mandir`;
      user = await User.findOne({ email }) || await User.create({
        name: s.name, email, phone: s.phone || '', role: 'employee', isActive: s.isActive,
        password: crypto.randomBytes(12).toString('base64url'),
      });
      how = `new login ${email} (set a real email and password in Users)`;
    }
    s.user = user._id;
    s.onPayroll = true;
    await s.save();
    console.log(`  ${s.staffCode} ${s.name} → ${how}`);
  }

  console.log('\n[Migration] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[Migration] failed:', err);
  process.exit(1);
});
