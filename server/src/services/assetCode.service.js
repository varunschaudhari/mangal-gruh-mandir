import Asset from '../models/Asset.js';

export async function generateAssetCode() {
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

  return `MGM-AST-${String(seq).padStart(3, '0')}`;
}
