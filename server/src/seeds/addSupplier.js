/**
 * One-off: add Shantibhushan Traders supplier
 * Safe to re-run — skips if already exists.
 *
 * Run: node src/seeds/addSupplier.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Supplier from '../models/Supplier.js';

const run = async () => {
  await connectDB();

  const existing = await Supplier.findOne({ name: 'Shantibhushan Traders' });
  if (existing) {
    console.log('Supplier "Shantibhushan Traders" already exists — skipping.');
    await mongoose.disconnect();
    return;
  }

  const supplier = await Supplier.create({
    name:          'Shantibhushan Traders',
    type:          'vendor',
    contactPerson: 'Ashish Chaudhari',
    city:          'Amalner',
    isActive:      true,
  });

  console.log(`✓ Supplier created: ${supplier.name} (ID: ${supplier._id})`);
  await mongoose.disconnect();
};

run().catch((err) => { console.error(err); process.exit(1); });
