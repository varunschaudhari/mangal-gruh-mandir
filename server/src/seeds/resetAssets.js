/**
 * Reset Asset Module — clears all test data so you can start fresh.
 *
 * Removes:
 *   - All AssetTransactions
 *   - All BorrowGroups
 *   - All Assets
 *   - Test staff users (ramesh@, suresh@, priya@, anil@ mandir.com)
 *   - Removes canApproveAssets flag from all users (resets approvers)
 *
 * Run: npm run reset:assets
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import AssetTransaction from '../models/AssetTransaction.js';
import BorrowGroup from '../models/BorrowGroup.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';

const TEST_EMAILS = [
  'ramesh@mandir.com',
  'suresh@mandir.com',
  'priya@mandir.com',
  'anil@mandir.com',
];

const run = async () => {
  await connectDB();
  console.log('\n[Reset] Clearing asset module data...\n');

  const [txns, groups, assets] = await Promise.all([
    AssetTransaction.deleteMany({}),
    BorrowGroup.deleteMany({}),
    Asset.deleteMany({}),
  ]);

  console.log(`  ✓ Deleted ${txns.deletedCount} asset transactions`);
  console.log(`  ✓ Deleted ${groups.deletedCount} borrow groups`);
  console.log(`  ✓ Deleted ${assets.deletedCount} assets`);

  // Remove test staff users
  const deleted = await User.deleteMany({ email: { $in: TEST_EMAILS } });
  console.log(`  ✓ Removed ${deleted.deletedCount} test staff users`);

  // Reset canApproveAssets on remaining users
  const reset = await User.updateMany({}, { $set: { canApproveAssets: false } });
  console.log(`  ✓ Reset canApproveAssets on ${reset.modifiedCount} user(s)`);

  console.log('\n[Reset] Done. You can now:\n');
  console.log('  1. Re-run seed if needed:   npm run seed:assets');
  console.log('  2. Or start fresh via the UI — new numbers start from today\'s date.\n');

  await mongoose.disconnect();
};

run().catch((err) => { console.error('[Reset] Failed:', err); process.exit(1); });
