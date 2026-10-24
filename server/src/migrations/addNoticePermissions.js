/**
 * Migration: notice board — gives the Admin role notices:manage (post, edit and remove notices).
 * Other roles get it from Admin → Roles when wanted. Super Admin already has everything ('*').
 *
 * Safe to run multiple times — uses $addToSet, never removes permissions.
 *
 * Run with:  npm run migrate:notices
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';

const PATCHES = [
  { slug: 'admin', add: ['notices:manage'] },
];

const migrate = async () => {
  await connectDB();
  console.log('\n[Migration] addNoticePermissions — starting\n');

  for (const { slug, add } of PATCHES) {
    const role = await Role.findOne({ slug });
    if (!role) {
      console.log(`  SKIP  "${slug}" — role not found in DB`);
      continue;
    }
    const toAdd = add.filter((p) => !role.permissions.includes(p));
    if (!toAdd.length) {
      console.log(`  OK    "${slug}" — already has ${add.join(', ')}`);
      continue;
    }
    await Role.updateOne({ slug }, { $addToSet: { permissions: { $each: toAdd } } });
    console.log(`  PATCHED "${slug}" — added ${toAdd.join(', ')}`);
  }

  console.log('\n[Migration] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[Migration] failed:', err);
  process.exit(1);
});
