import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Asset from '../models/Asset.js';

async function backfill() {
  await connectDB();
  console.log('Connected to MongoDB');

  const unassigned = await Asset.find(
    { $or: [{ assetCode: { $exists: false } }, { assetCode: null }] }
  ).sort({ createdAt: 1 }).lean();

  if (!unassigned.length) {
    console.log('All assets already have codes. Nothing to do.');
    process.exit(0);
  }

  const last = await Asset.findOne(
    { assetCode: { $exists: true, $ne: null } },
    { assetCode: 1 },
    { sort: { assetCode: -1 } }
  ).lean();

  let seq = 1;
  if (last?.assetCode) {
    const parts = last.assetCode.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  for (const asset of unassigned) {
    const code = `MGM-AST-${String(seq).padStart(3, '0')}`;
    await Asset.updateOne({ _id: asset._id }, { assetCode: code });
    console.log(`  ${asset.name}  →  ${code}`);
    seq++;
  }

  console.log(`\nDone — assigned codes to ${unassigned.length} asset(s).`);
  process.exit(0);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
