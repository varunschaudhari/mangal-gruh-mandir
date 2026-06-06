// Run once: node -e "import('./src/seeds/addPaymentsPermissions.seed.js')"
// Adds payments:read/write/approve permissions to existing Role documents in MongoDB

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role.js';

dotenv.config();

const ADDITIONS = {
  admin:         ['donations:read', 'donations:write', 'payments:read', 'payments:write', 'payments:approve'],
  store_manager: ['donations:read', 'donations:write', 'payments:read', 'payments:write', 'payments:approve'],
  staff:         ['donations:read', 'payments:read', 'payments:write'],
  viewer:        ['donations:read', 'payments:read'],
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
  for (const [slug, perms] of Object.entries(ADDITIONS)) {
    const role = await Role.findOne({ slug });
    if (!role) { console.log(`Role ${slug} not found — skipping`); continue; }
    const existing = new Set(role.permissions);
    let added = 0;
    for (const p of perms) {
      if (!existing.has(p) && !existing.has('*')) { existing.add(p); added++; }
    }
    role.permissions = [...existing];
    await role.save();
    console.log(`${slug}: +${added} permissions`);
  }
  console.log('Done.');
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
