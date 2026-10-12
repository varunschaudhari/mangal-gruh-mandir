/**
 * Migration: sync the built-in roles to their definitions in seeds/roles.seed.js
 *
 *   npm run migrate:roles                                   upsert built-in roles (safe on live)
 *   npm run migrate:roles -- --remove-custom-roles          also delete roles made in the UI
 *                                                           (their users move to "viewer")
 *   npm run migrate:roles -- --demo-users                   also create one login per role with a
 *                                                           RANDOM password, printed once — test
 *                                                           copies only; refused when NODE_ENV=production
 *
 * Note: built-in roles get exactly the permissions in the seed file — permissions added to a
 * built-in role in the UI are replaced. Custom roles are only listed unless asked to remove them.
 */

import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { rolesSeed } from '../seeds/roles.seed.js';

const REMOVE_CUSTOM = process.argv.includes('--remove-custom-roles');
const DEMO_USERS = process.argv.includes('--demo-users');

// Logins for trying each role on a test copy. Never with fixed passwords: a known password on a
// live server is an open door.
const DEMO_LOGINS = [
  { name: 'Prasad Counter',  email: 'prasad@mandir.com',     role: 'mahaprasad_counter' },
  { name: 'Coupon Scanner',  email: 'scanner@mandir.com',    role: 'mahaprasad_redeem'  },
  { name: 'Store Manager',   email: 'store@mandir.com',      role: 'store_manager'      },
  { name: 'Staff User',      email: 'staff@mandir.com',      role: 'staff'              },
  { name: 'Accountant',      email: 'accountant@mandir.com', role: 'accountant'         },
  { name: 'Cashier',         email: 'cashier@mandir.com',    role: 'cashier'            },
  { name: 'Donation Desk',   email: 'donation@mandir.com',   role: 'donation_desk'      },
  { name: 'Viewer',          email: 'viewer@mandir.com',     role: 'viewer'             },
];

const migrate = async () => {
  if (DEMO_USERS && process.env.NODE_ENV === 'production') {
    throw new Error('--demo-users is for test copies only (NODE_ENV is production)');
  }
  await connectDB();
  console.log('\n[syncRoles] starting\n');

  // 1. Upsert every built-in role from the seed
  for (const r of rolesSeed) {
    const result = await Role.findOneAndUpdate({ slug: r.slug }, { $set: r }, { upsert: true, returnDocument: 'after' });
    console.log(`  UPSERT  "${r.slug}" — ${result.permissions.length} permissions`);
  }

  // 2. Roles made in the UI: listed, and only deleted when asked
  const systemSlugs = rolesSeed.map((r) => r.slug);
  const customRoles = await Role.find({ slug: { $nin: systemSlugs }, isSystem: { $ne: true } }).lean();
  if (!customRoles.length) {
    console.log('\n  No custom roles');
  } else if (!REMOVE_CUSTOM) {
    console.log(`\n  Custom roles kept (use --remove-custom-roles to delete): ${customRoles.map((r) => r.slug).join(', ')}`);
  } else {
    for (const role of customRoles) {
      const affected = await User.countDocuments({ role: role.slug });
      if (affected > 0) {
        await User.updateMany({ role: role.slug }, { $set: { role: 'viewer' } });
        console.log(`  REASSIGN  ${affected} user(s) from "${role.slug}" → "viewer"`);
      }
      await Role.deleteOne({ _id: role._id });
      console.log(`  DELETED   custom role "${role.slug}" (${role.name})`);
    }
  }

  // 3. Demo logins, only when asked — each with its own random password, shown once
  if (DEMO_USERS) {
    console.log('\n  Demo logins (write the passwords down — they are not stored anywhere else):');
    for (const u of DEMO_LOGINS) {
      if (await User.exists({ email: u.email })) {
        console.log(`  SKIP    ${u.email} — already exists`);
        continue;
      }
      const password = crypto.randomBytes(9).toString('base64url');
      await User.create({ ...u, password, isActive: true });
      console.log(`  CREATED ${u.email.padEnd(24)} ${u.role.padEnd(20)} password: ${password}`);
    }
  }

  console.log('\n[syncRoles] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[syncRoles] failed:', err.message);
  process.exit(1);
});
