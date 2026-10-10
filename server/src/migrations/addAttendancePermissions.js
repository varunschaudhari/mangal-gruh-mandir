/**
 * Migration: attendance module permissions
 *
 * - admin gets attendance:read / write / manage / approve and salary:read / manage
 * - accountant gets salary:read
 * - creates the "Attendance Supervisor" role (roster + fixing attendance)
 *
 * Safe to run multiple times — uses $addToSet so it never removes
 * custom permissions that admins may have added via the UI.
 *
 * Run with:  npm run migrate:attendance
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import { rolesSeed } from '../seeds/roles.seed.js';

const PATCHES = [
  { slug: 'admin', add: ['attendance:read', 'attendance:write', 'attendance:manage', 'attendance:approve', 'salary:read', 'salary:manage'] },
  { slug: 'accountant', add: ['salary:read'] },
  // super_admin — already has '*', no change needed
];
const NEW_ROLES = ['attendance_supervisor'];

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

  console.log('\n[Migration] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[Migration] failed:', err);
  process.exit(1);
});
