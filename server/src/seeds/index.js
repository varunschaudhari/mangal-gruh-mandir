import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import Unit from '../models/Unit.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { departments } from './departments.seed.js';
import { categories } from './categories.seed.js';
import { units } from './units.seed.js';
import { rolesSeed } from './roles.seed.js';

const seed = async () => {
  await connectDB();
  console.log('Starting seed...');

  // Departments
  for (const d of departments) {
    await Department.updateOne({ code: d.code }, { $setOnInsert: d }, { upsert: true });
  }
  console.log(`✓ ${departments.length} departments`);

  // Categories
  for (const c of categories) {
    await Category.updateOne({ code: c.code }, { $setOnInsert: c }, { upsert: true });
  }
  console.log(`✓ ${categories.length} categories`);

  // Units
  for (const u of units) {
    await Unit.updateOne({ symbol: u.symbol }, { $setOnInsert: u }, { upsert: true });
  }
  console.log(`✓ ${units.length} units`);

  // Roles
  for (const r of rolesSeed) {
    await Role.updateOne({ slug: r.slug }, { $set: r }, { upsert: true });
  }
  console.log(`✓ ${rolesSeed.length} roles`);

  // Super admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@mandir.local';
  const existing = await User.findOne({ email: adminEmail });
  if (!existing) {
    await User.create({
      name: process.env.SEED_ADMIN_NAME || 'Super Admin',
      email: adminEmail,
      password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
      role: 'super_admin',
    });
    console.log(`✓ Super admin created: ${adminEmail}`);
  } else {
    console.log(`- Super admin already exists: ${adminEmail}`);
  }

  console.log('\nSeed complete!');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
