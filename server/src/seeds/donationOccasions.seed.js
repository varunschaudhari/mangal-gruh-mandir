/**
 * Seeds default donation occasions.
 * Run: npm run seed:occasions
 * Safe to re-run — skips existing entries.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import DonationOccasion from '../models/DonationOccasion.js';

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

const run = async () => {
  await connectDB();
  console.log('\n[Occasions] Seeding donation occasions...\n');

  let created = 0;
  for (const o of OCCASIONS) {
    const exists = await DonationOccasion.findOne({ name: o.name });
    if (!exists) {
      await DonationOccasion.create(o);
      console.log(`  ✓ ${o.name}`);
      created++;
    } else {
      console.log(`  - ${o.name} (already exists)`);
    }
  }

  console.log(`\n[Occasions] Done — ${created} created.\n`);
  await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
