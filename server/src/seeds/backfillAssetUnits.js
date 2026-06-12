import 'dotenv/config';
import connectDB from '../config/db.js';
import Asset from '../models/Asset.js';
import AssetUnit from '../models/AssetUnit.js';

function padUnit(num, total) {
  return String(num).padStart(total > 99 ? 3 : 2, '0');
}

async function backfill() {
  await connectDB();
  console.log('Connected to MongoDB\n');

  const assets = await Asset.find({ assetCode: { $exists: true, $ne: null } }).sort({ assetCode: 1 });

  let totalCreated = 0;
  for (const asset of assets) {
    const existing = await AssetUnit.countDocuments({ asset: asset._id });
    if (existing >= asset.totalQuantity) {
      console.log(`  ${asset.assetCode}  ${asset.name}  — already has ${existing} units, skipping`);
      continue;
    }

    const startFrom = existing + 1;
    const docs = [];
    for (let i = startFrom; i <= asset.totalQuantity; i++) {
      docs.push({
        asset:      asset._id,
        unitCode:   `${asset.assetCode}-${padUnit(i, asset.totalQuantity)}`,
        unitNumber: i,
      });
    }

    await AssetUnit.insertMany(docs, { ordered: false });
    console.log(`  ${asset.assetCode}  ${asset.name}  — created units ${startFrom}–${asset.totalQuantity}`);
    totalCreated += docs.length;
  }

  console.log(`\nDone — created ${totalCreated} asset unit(s) across ${assets.length} asset(s).`);
  process.exit(0);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
