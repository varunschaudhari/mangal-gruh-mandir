/**
 * Migration: sync roles to canonical seed definition
 *
 * - Upserts all system roles (creates new ones, updates existing permissions)
 * - Deletes any non-system custom roles created via the UI
 * - Safe to re-run
 *
 * Run with:  npm run migrate:roles
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { rolesSeed } from '../seeds/roles.seed.js';

const DEFAULT_USERS = [
  // Mahaprasad
  { name: 'Prasad Counter',  email: 'prasad@mandir.com',     password: 'Prasad@1234',     role: 'mahaprasad_counter' },
  { name: 'Coupon Scanner',  email: 'scanner@mandir.com',    password: 'Scanner@1234',    role: 'mahaprasad_redeem'  },
  // Operations
  { name: 'Store Manager',   email: 'store@mandir.com',      password: 'Store@1234',      role: 'store_manager'      },
  { name: 'Staff User',      email: 'staff@mandir.com',      password: 'Staff@1234',      role: 'staff'              },
  // Finance
  { name: 'Accountant',      email: 'accountant@mandir.com', password: 'Account@1234',    role: 'accountant'         },
  { name: 'Cashier',         email: 'cashier@mandir.com',    password: 'Cashier@1234',    role: 'cashier'            },
  // Front desk
  { name: 'Donation Desk',   email: 'donation@mandir.com',   password: 'Donation@1234',   role: 'donation_desk'      },
  // Read-only
  { name: 'Viewer',          email: 'viewer@mandir.com',     password: 'Viewer@1234',     role: 'viewer'             },
];

const migrate = async () => {
  await connectDB();
  console.log('\n[syncRoles] starting\n');

  // 1. Upsert every system role from seed
  for (const r of rolesSeed) {
    const result = await Role.findOneAndUpdate(
      { slug: r.slug },
      { $set: r },
      { upsert: true, new: true },
    );
    console.log(`  UPSERT  "${r.slug}" — ${result.permissions.length} permissions`);
  }

  // 2. Delete non-system custom roles (ones created via UI, not seeded)
  const systemSlugs = rolesSeed.map((r) => r.slug);
  const customRoles = await Role.find({ slug: { $nin: systemSlugs }, isSystem: { $ne: true } }).lean();

  if (customRoles.length === 0) {
    console.log('\n  No custom roles to remove');
  } else {
    for (const role of customRoles) {
      // Reassign any users with this role to 'viewer' before deleting
      const affected = await User.countDocuments({ role: role.slug });
      if (affected > 0) {
        await User.updateMany({ role: role.slug }, { $set: { role: 'viewer' } });
        console.log(`  REASSIGN  ${affected} user(s) from "${role.slug}" → "viewer"`);
      }
      await Role.deleteOne({ _id: role._id });
      console.log(`  DELETED   custom role "${role.slug}" (${role.name})`);
    }
  }

  // 3. Create default users if they don't exist
  console.log('\n  Creating default users...');
  for (const u of DEFAULT_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`  SKIP    "${u.email}" — already exists`);
    } else {
      await User.create({ ...u, isActive: true });
      console.log(`  CREATED "${u.email}" (${u.name}) — role: ${u.role}  pwd: ${u.password}`);
    }
  }

  console.log('\n[syncRoles] done\n');
  console.log('System roles active:');
  rolesSeed.forEach((r) => console.log(`  - ${r.slug.padEnd(20)} ${r.name}`));
  console.log('\nDefault users:');
  DEFAULT_USERS.forEach((u) => console.log(`  - ${u.email.padEnd(28)} ${u.name.padEnd(18)} (${u.role})`));

  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[syncRoles] failed:', err);
  process.exit(1);
});
