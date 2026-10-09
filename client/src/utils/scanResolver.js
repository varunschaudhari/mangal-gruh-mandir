import { lookupProduct } from '../api/product.api.js';
import { lookupAssetUnit } from '../api/assetUnit.api.js';

// Work out where a scanned code should take the user. The labels this app prints:
//   MP-20261009-042                      Mahaprasad coupon          → Redeem screen
//   https://…/assets/<id>/history        asset label (assetLabel.js) → asset history
//   MGM-AST-007-01                       asset unit sticker          → that asset's units
//   PRD-0012 / a shop barcode (EAN…)     product (code or barcode)   → product details
// Returns { to } for a route, or { error } with a message to show.

const COUPON = /^MP-\d{8}-\d+$/i;
const ASSET_UNIT = /^MGM-AST-[\w-]+$/i;
const ASSET_PATH = /^\/assets\/[a-f0-9]{24}\/history$/;

export async function resolveScan(text) {
  const code = String(text || '').trim();
  if (!code) return { error: 'Nothing was scanned' };

  if (COUPON.test(code)) return { to: `/mahaprasad/redeem?code=${encodeURIComponent(code.toUpperCase())}` };

  if (/^https?:\/\//i.test(code)) {
    try {
      const { pathname } = new URL(code);
      if (ASSET_PATH.test(pathname)) return { to: pathname };
    } catch { /* not a URL after all */ }
    return { error: 'This QR code is not from Mangal Grah Mandir' };
  }

  const notFound = (err, what) => (err?.response?.status === 403
    ? { error: `You don't have access to ${what}` }
    : err?.response?.status === 404 ? null : { error: 'Could not look that up — check the connection' });

  if (ASSET_UNIT.test(code)) {
    try {
      const { data } = await lookupAssetUnit(code);
      return { to: `/assets/${data.data.asset._id}/units` };
    } catch (err) {
      return notFound(err, 'assets') || { error: `No asset unit "${code}"` };
    }
  }

  try {
    const { data } = await lookupProduct(code);
    return { to: `/masters/products/${data.data._id}` };
  } catch (err) {
    return notFound(err, 'products') || { error: `Nothing found for "${code}"` };
  }
}
