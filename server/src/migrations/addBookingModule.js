/**
 * Migration: abhishek / puja booking module
 *
 * - adds bookings:* permissions to existing roles (bookings:cash = verify counter cash handovers)
 * - creates the "Booking Counter" and "Hall Check-in" roles (bookings:checkin = scan slips at the hall)
 * - first run only: adds the seva types and batches from the temple website
 *
 * Safe to run multiple times — $addToSet for permissions, and seva types / batches are
 * only added while their collections are empty (so edits made in Setup are kept).
 *
 * Run with:  npm run migrate:bookings
 */

import 'dotenv/config';
import '../config/timezone.js';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Role from '../models/Role.js';
import SevaType from '../models/SevaType.js';
import BookingBatch from '../models/BookingBatch.js';
import BookingSettings from '../models/BookingSettings.js';
import { rolesSeed } from '../seeds/roles.seed.js';
import { sevaTypesSeed, batchesSeed, DEFAULT_BATCH_CAPACITY } from '../seeds/booking.seed.js';

const PATCHES = [
  { slug: 'admin', add: ['bookings:read', 'bookings:create', 'bookings:void', 'bookings:manage', 'bookings:cash', 'bookings:checkin'] },
  { slug: 'staff', add: ['bookings:read', 'bookings:create', 'bookings:checkin'] },
  { slug: 'booking_counter', add: ['bookings:checkin'] }, // made before hall check-in existed
  { slug: 'viewer', add: ['bookings:read'] },
  { slug: 'accountant', add: ['bookings:read'] },
  { slug: 'cashier', add: ['bookings:read', 'bookings:cash'] }, // verifies counter cash handovers
  // super_admin — already has '*'
];
const NEW_ROLES = ['booking_counter', 'hall_checkin'];

const migrate = async () => {
  await connectDB();
  console.log('\n[Migration] addBookingModule — starting\n');

  for (const { slug, add } of PATCHES) {
    const role = await Role.findOne({ slug });
    if (!role) { console.log(`  SKIP  "${slug}" — role not found`); continue; }
    const toAdd = add.filter((p) => !role.permissions.includes(p));
    if (!toAdd.length) { console.log(`  OK    "${slug}"`); continue; }
    await Role.updateOne({ slug }, { $addToSet: { permissions: { $each: toAdd } } });
    console.log(`  PATCHED "${slug}" — added: ${toAdd.join(', ')}`);
  }

  for (const slug of NEW_ROLES) {
    const seed = rolesSeed.find((r) => r.slug === slug);
    const res = await Role.updateOne({ slug }, { $setOnInsert: seed }, { upsert: true });
    console.log(res.upsertedCount ? `  CREATED role "${slug}"` : `  OK    role "${slug}" exists`);
  }

  if (await SevaType.estimatedDocumentCount() === 0) {
    await SevaType.insertMany(sevaTypesSeed);
    console.log(`  ADDED ${sevaTypesSeed.length} seva types`);
  } else console.log('  OK    seva types already set up — not changed');

  if (await BookingBatch.estimatedDocumentCount() === 0) {
    await BookingBatch.insertMany(batchesSeed);
    console.log(`  ADDED ${batchesSeed.length} batches (capacity ${DEFAULT_BATCH_CAPACITY} each — set the real number in Bookings → Setup)`);
  } else console.log('  OK    batches already set up — not changed');

  await BookingSettings.getOrCreate();
  console.log('\n[Migration] done\n');
  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('[Migration] failed:', err);
  process.exit(1);
});
