import StockBalance from '../models/StockBalance.js';

// Stock that needs attention, per product+department balance of active products:
//   outOfStock — quantity is 0
//   lowStock   — at or below the product's minimum level (includes out of stock)
//   reorder    — above the minimum but at or below its reorder point
export async function getStockAlertCounts() {
  const balances = await StockBalance.find({})
    .populate('product', 'minStockLevel reorderPoint isActive')
    .lean();

  let lowStock = 0;
  let outOfStock = 0;
  let reorder = 0;
  for (const b of balances) {
    if (!b.product?.isActive) continue;
    const min = b.product.minStockLevel || 0;
    const reorderPoint = b.product.reorderPoint || 0;
    if (b.quantity === 0) { outOfStock++; lowStock++; }
    else if (min > 0 && b.quantity <= min) lowStock++;
    else if (reorderPoint > 0 && b.quantity <= reorderPoint) reorder++;
  }
  return { lowStock, outOfStock, reorder };
}
