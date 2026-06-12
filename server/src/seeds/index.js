import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import Unit from '../models/Unit.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import DonationOccasion from '../models/DonationOccasion.js';
import MahaprasadOccasion from '../models/MahaprasadOccasion.js';
import { departments } from './departments.seed.js';
import { categories } from './categories.seed.js';
import { units } from './units.seed.js';
import { rolesSeed } from './roles.seed.js';

const OCCASIONS = [
  { name: 'Hundi',               sortOrder: 1 },
  { name: 'General Donation',    sortOrder: 2 },
  { name: 'Ganesh Utsav',        sortOrder: 3 },
  { name: 'Ram Navami',          sortOrder: 4 },
  { name: 'Diwali Programme',    sortOrder: 5 },
  { name: 'Navratri',            sortOrder: 6 },
  { name: 'Prasad Sponsorship',  sortOrder: 7 },
  { name: 'Temple Renovation',   sortOrder: 8 },
  { name: 'Annual Utsav',        sortOrder: 9 },
  { name: 'Annadan Programme',   sortOrder: 10 },
];

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

  // Donation Occasions
  for (const o of OCCASIONS) {
    await DonationOccasion.updateOne({ name: o.name }, { $setOnInsert: o }, { upsert: true });
  }
  console.log(`✓ ${OCCASIONS.length} donation occasions`);

  // Mahaprasad Occasions
  const MP_OCCASIONS = [
    { name: 'Ekadashi',           sortOrder: 1  },
    { name: 'Ram Navami',         sortOrder: 2  },
    { name: 'Janmashtami',        sortOrder: 3  },
    { name: 'Navratri',           sortOrder: 4  },
    { name: 'Ganesh Utsav',       sortOrder: 5  },
    { name: 'Diwali',             sortOrder: 6  },
    { name: 'Holi',               sortOrder: 7  },
    { name: 'Maha Shivratri',     sortOrder: 8  },
    { name: 'Annadan Seva',       sortOrder: 9  },
    { name: 'Prasad Sponsorship', sortOrder: 10 },
    { name: 'Temple Anniversary', sortOrder: 11 },
    { name: 'Special Programme',  sortOrder: 12 },
  ];
  for (const o of MP_OCCASIONS) {
    await MahaprasadOccasion.updateOne({ name: o.name }, { $setOnInsert: o }, { upsert: true });
  }
  console.log(`✓ ${MP_OCCASIONS.length} mahaprasad occasions`);

  // Super admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@mandir.com';
  const existing = await User.findOne({ email: adminEmail });
  if (!existing) {
    await User.create({
      name: process.env.SEED_ADMIN_NAME || 'Super Admin',
      email: adminEmail,
      password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
      role: 'super_admin',
      canApproveAssets: true,
      canApprovePayments: true,
    });
    console.log(`✓ Super admin created: ${adminEmail}`);
  } else {
    await User.updateOne({ _id: existing._id }, { $set: { canApproveAssets: true, canApprovePayments: true } });
    console.log(`- Super admin already exists: ${adminEmail}`);
  }

  console.log('\nSeed complete!');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
