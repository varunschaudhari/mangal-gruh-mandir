/**
 * Migration: add mahaprasad permissions to existing roles
 *
 * Safe to run multiple times — uses $addToSet so it never removes
 * custom permissions that admins may have added via the UI.
 *
 * Run with:  npm run migrate:mahaprasad
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';

const PATCHES = [
  {
    slug: 'admin',
    add:  ['mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem'],
  },
  {
    slug: 'store_manager',
    add:  ['mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem'],
  },
  {
    slug: 'staff',
    add:  ['mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem'],
  },
  // viewer — read-only, no issue/redeem
  {
    slug: 'viewer',
    add:  ['mahaprasad:read'],
  },
  // super_admin — already has '*', no change needed
];

const migrate = async () => {
  await connectDB();
  console.log('\n[Migration] addMahaprasadPermissions — starting\n');

  for (const { slug, add } of PATCHES) {
    const role = await Role.findOne({ slug });

    if (!role) {
      console.log(`  SKIP  "${slug}" — role not found in DB`);
      continue;
    }

    const already = add.filter((p) => role.permissions.includes(p));
    const toAdd   = add.filter((p) => !role.permissions.includes(p));

    if (toAdd.length === 0) {
      console.log(`  OK    "${slug}" — already has all mahaprasad permissions`);
      continue;
    }

    await Role.updateOne(
      { slug },
      { $addToSet: { permissions: { $each: toAdd } } }
    );

    console.log(`  PATCHED "${slug}"`);
    if (already.length) console.log(`          already had: ${already.join(', ')}`);
    console.log(`          added:       ${toAdd.join(', ')}`);
  }

  console.log('\n[Migration] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[Migration] failed:', err);
  process.exit(1);
});
