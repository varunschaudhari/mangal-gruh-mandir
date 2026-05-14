/**
 * Test Data Seed — Mangal Grah Mandir
 * Adds products, suppliers, staff users, and 30 days of realistic transactions.
 * Safe to re-run: skips if test data already exists (checks for product code RICE-BAS).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import Unit from '../models/Unit.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import StockTransaction from '../models/StockTransaction.js';
import { createBatch, consumeBatches, transferBatches } from '../services/fifo.service.js';
import { recomputeBalance } from '../services/stockBalance.service.js';
import { generateTransactionNumber } from '../services/transactionNumber.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

async function createTxn({ type, product, from, to, qty, date, supplier, rate, stockInType,
  stockOutPurpose, wastageReason, expiryDate, batchRef, notes, adminUser }) {
  let consumedBatchesResult = [];

  if (type === 'STOCK_OUT' || type === 'WASTAGE') {
    consumedBatchesResult = await consumeBatches(product._id, from._id, qty);
  }

  const txnNumber = await generateTransactionNumber(date);

  const txn = await StockTransaction.create({
    transactionNumber: txnNumber,
    transactionType: type,
    transactionDate: date,
    product: product._id,
    fromDepartment: from?._id,
    toDepartment: to?._id,
    quantity: qty,
    unit: product.unit,
    rate: rate || 0,
    totalValue: (rate || 0) * qty,
    stockInType: stockInType || undefined,
    supplier: supplier?._id,
    stockOutPurpose: stockOutPurpose || undefined,
    wastageReason: wastageReason || undefined,
    expiryDate: expiryDate || undefined,
    batchRef: batchRef || undefined,
    consumedBatches: consumedBatchesResult,
    notes: notes || undefined,
    createdBy: adminUser._id,
  });

  if (type === 'STOCK_IN' || type === 'OPENING_BALANCE') {
    await createBatch(txn);
    await recomputeBalance(product._id, to._id);
  } else if (type === 'STOCK_OUT' || type === 'WASTAGE') {
    await recomputeBalance(product._id, from._id);
  } else if (type === 'TRANSFER') {
    const consumed = await transferBatches(product._id, from._id, to._id, qty, txn);
    txn.consumedBatches = consumed;
    await txn.save();
    await recomputeBalance(product._id, from._id);
    await recomputeBalance(product._id, to._id);
  }

  return txn;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  await connectDB();

  // Skip if already seeded
  const existing = await Product.findOne({ code: 'RICE-BAS' });
  if (existing) {
    console.log('⚠  Test data already exists. Delete products with code RICE-BAS to re-seed.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n🌱  Seeding test data...\n');

  // ── Lookup seeded masters ────────────────────────────────────────────────────

  const [ms, kt, ps, fr, dc] = await Promise.all([
    Department.findOne({ code: 'MS' }),
    Department.findOne({ code: 'KT' }),
    Department.findOne({ code: 'PS' }),
    Department.findOne({ code: 'FR' }),
    Department.findOne({ code: 'DC' }),
  ]);

  const [grCat, ogCat, spCat, dpCat, flCat, pjCat, swCat, pmCat, csCat] = await Promise.all([
    Category.findOne({ code: 'GR' }),
    Category.findOne({ code: 'OG' }),
    Category.findOne({ code: 'SP' }),
    Category.findOne({ code: 'DP' }),
    Category.findOne({ code: 'FL' }),
    Category.findOne({ code: 'PJ' }),
    Category.findOne({ code: 'SW' }),
    Category.findOne({ code: 'PM' }),
    Category.findOne({ code: 'CS' }),
  ]);

  const [kg, g, L, pcs, pkt, bag] = await Promise.all([
    Unit.findOne({ symbol: 'kg' }),
    Unit.findOne({ symbol: 'g' }),
    Unit.findOne({ symbol: 'L' }),
    Unit.findOne({ symbol: 'pcs' }),
    Unit.findOne({ symbol: 'pkt' }),
    Unit.findOne({ symbol: 'bag' }),
  ]);

  const adminUser = await User.findOne({ role: 'super_admin' });

  if (!ms || !kt || !ps || !adminUser) {
    console.error('❌  Run npm run seed first to create departments, categories, units, and admin user.');
    await mongoose.disconnect();
    return;
  }

  // ── 1. Suppliers ─────────────────────────────────────────────────────────────

  console.log('Creating suppliers...');
  const [kirana, flowerMart, dairy, trust] = await Promise.all([
    Supplier.create({ name: 'Shri Ganesh Kirana Store', type: 'vendor', contactPerson: 'Ramesh Patil', phone: '9876543210', city: 'Amalner' }),
    Supplier.create({ name: 'Pushpa Flower Mart', type: 'vendor', contactPerson: 'Sunita Joshi', phone: '9823456780', city: 'Amalner' }),
    Supplier.create({ name: 'Amalner Dairy Farm', type: 'vendor', contactPerson: 'Govind Yadav', phone: '9812345678', city: 'Amalner' }),
    Supplier.create({ name: 'Amalner Charitable Trust', type: 'donor', contactPerson: 'Shri Dinesh Shah', phone: '9800001234', city: 'Amalner' }),
  ]);
  console.log('  ✓ 4 suppliers');

  // ── 2. Products ──────────────────────────────────────────────────────────────

  console.log('Creating products...');
  const productDefs = [
    // Grains & Pulses
    { name: 'Basmati Rice',       code: 'RICE-BAS', category: grCat, unit: kg,  minStockLevel: 50,  reorderPoint: 100, standardRate: 80,  isPujaItem: false },
    { name: 'Wheat Flour (Atta)', code: 'ATTA-WHT', category: grCat, unit: kg,  minStockLevel: 30,  reorderPoint: 60,  standardRate: 35,  isPujaItem: false },
    { name: 'Chana Dal',          code: 'DAL-CHN',  category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 25,  standardRate: 90,  isPujaItem: false },
    { name: 'Urad Dal',           code: 'DAL-URD',  category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 20,  standardRate: 110, isPujaItem: false },
    { name: 'Poha',               code: 'POHA',     category: grCat, unit: kg,  minStockLevel: 5,   reorderPoint: 15,  standardRate: 50,  isPujaItem: false },
    // Oil & Ghee
    { name: 'Pure Desi Ghee',     code: 'GHEE-DSI', category: ogCat, unit: kg,  minStockLevel: 10,  reorderPoint: 20,  standardRate: 600, isPujaItem: true,  isPerishable: true, shelfLifeDays: 180 },
    { name: 'Coconut Oil',        code: 'OIL-CCN',  category: ogCat, unit: L,   minStockLevel: 5,   reorderPoint: 10,  standardRate: 180, isPujaItem: false, isPerishable: true, shelfLifeDays: 365 },
    { name: 'Mustard Oil',        code: 'OIL-MST',  category: ogCat, unit: L,   minStockLevel: 5,   reorderPoint: 10,  standardRate: 150, isPujaItem: false },
    // Spices & Condiments
    { name: 'Rock Salt (Sendha)', code: 'SALT-RCK', category: spCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 40,  isPujaItem: false },
    { name: 'Sugar',              code: 'SUGR',     category: spCat, unit: kg,  minStockLevel: 20,  reorderPoint: 40,  standardRate: 45,  isPujaItem: false },
    { name: 'Turmeric Powder',    code: 'TURMR',    category: spCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 200, isPujaItem: true  },
    { name: 'Jaggery (Gur)',      code: 'GUR',      category: spCat, unit: kg,  minStockLevel: 5,   reorderPoint: 15,  standardRate: 60,  isPujaItem: false, isPerishable: true, shelfLifeDays: 90 },
    // Dairy
    { name: 'Cow Milk',           code: 'MILK-COW', category: dpCat, unit: L,   minStockLevel: 10,  reorderPoint: 20,  standardRate: 60,  isPujaItem: true,  isPerishable: true, shelfLifeDays: 2  },
    { name: 'Paneer',             code: 'PNEER',    category: dpCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 320, isPujaItem: false, isPerishable: true, shelfLifeDays: 5  },
    // Flowers
    { name: 'Marigold Flowers',   code: 'FLWR-MRG', category: flCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 80,  isPujaItem: true,  isPerishable: true, shelfLifeDays: 3  },
    { name: 'Rose Petals',        code: 'FLWR-RSP', category: flCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 150, isPujaItem: true,  isPerishable: true, shelfLifeDays: 2  },
    { name: 'Lotus Flowers',      code: 'FLWR-LTS', category: flCat, unit: pcs, minStockLevel: 10,  reorderPoint: 25,  standardRate: 5,   isPujaItem: true,  isPerishable: true, shelfLifeDays: 1  },
    // Puja Items
    { name: 'Agarbatti (Incense Sticks)', code: 'AGBT',  category: pjCat, unit: pcs, minStockLevel: 100, reorderPoint: 200, standardRate: 2,   isPujaItem: true  },
    { name: 'Camphor (Kapoor)',    code: 'KAPR',    category: pjCat, unit: g,   minStockLevel: 100, reorderPoint: 300, standardRate: 0.5, isPujaItem: true  },
    { name: 'Kumkum',             code: 'KUMKM',   category: pjCat, unit: g,   minStockLevel: 200, reorderPoint: 500, standardRate: 0.3, isPujaItem: true  },
    { name: 'Diya (Clay Lamp)',   code: 'DIYA',    category: pjCat, unit: pcs, minStockLevel: 50,  reorderPoint: 100, standardRate: 3,   isPujaItem: true  },
    { name: 'Sandalwood Paste',   code: 'SNDL',    category: pjCat, unit: g,   minStockLevel: 50,  reorderPoint: 100, standardRate: 2,   isPujaItem: true  },
    { name: 'Dhoop Sticks',       code: 'DHOOP',   category: pjCat, unit: pkt, minStockLevel: 10,  reorderPoint: 20,  standardRate: 30,  isPujaItem: true  },
    // Sweets & Prasadam
    { name: 'Besan Laddoo',       code: 'LADU-BSN', category: swCat, unit: kg, minStockLevel: 5,   reorderPoint: 10,  standardRate: 350, isPujaItem: true,  isPerishable: true, shelfLifeDays: 7  },
    { name: 'Modak (Steamed)',    code: 'MODAK',   category: swCat, unit: pcs, minStockLevel: 20,  reorderPoint: 50,  standardRate: 15,  isPujaItem: true,  isPerishable: true, shelfLifeDays: 2  },
    // Packing Material
    { name: 'Paper Bags (Small)', code: 'BAG-PPR', category: pmCat, unit: pcs, minStockLevel: 100, reorderPoint: 300, standardRate: 2,   isPujaItem: false },
    { name: 'Banana Leaves',      code: 'LEAF-BAN', category: pmCat, unit: pcs, minStockLevel: 20,  reorderPoint: 50,  standardRate: 3,   isPujaItem: false, isPerishable: true, shelfLifeDays: 3  },
    // Cleaning Supplies
    { name: 'Phenyl (Floor Cleaner)', code: 'PHNYL', category: csCat, unit: L,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 80,  isPujaItem: false },
    { name: 'Broom',              code: 'BROOM',   category: csCat, unit: pcs, minStockLevel: 3,   reorderPoint: 5,   standardRate: 80,  isPujaItem: false },
  ];

  const products = {};
  for (const pd of productDefs) {
    const p = await Product.create({ ...pd, createdBy: adminUser._id });
    products[pd.code] = p;
  }
  console.log(`  ✓ ${productDefs.length} products`);

  // ── 3. Additional Users ──────────────────────────────────────────────────────

  console.log('Creating test users...');
  await Promise.all([
    User.create({ name: 'Suresh Sharma',  email: 'manager@mandir.com',  password: 'Manager@123',  role: 'store_manager' }),
    User.create({ name: 'Priya Kulkarni', email: 'kitchen@mandir.com',  password: 'Kitchen@123',  role: 'staff',   departments: [kt._id] }),
    User.create({ name: 'Anita Desai',    email: 'puja@mandir.com',     password: 'Puja@1234',    role: 'staff',   departments: [ps._id] }),
    User.create({ name: 'Vijay Patil',    email: 'viewer@mandir.com',   password: 'Viewer@123',   role: 'viewer' }),
  ]);
  console.log('  ✓ 4 test users');

  // ── 4. Transactions ──────────────────────────────────────────────────────────

  console.log('Creating transactions...\n');
  const opts = { adminUser };

  // ── Day -30: Opening Balances in Main Store ──────────────────────────────────
  console.log('  [Day -30] Opening balances — Main Store...');
  const openings = [
    { product: products['RICE-BAS'], qty: 200, rate: 78  },
    { product: products['ATTA-WHT'], qty: 100, rate: 34  },
    { product: products['DAL-CHN'],  qty: 40,  rate: 88  },
    { product: products['DAL-URD'],  qty: 30,  rate: 108 },
    { product: products['GHEE-DSI'], qty: 30,  rate: 580, expiryDate: daysFromNow(160), batchRef: 'LOT-GHEE-0101' },
    { product: products['OIL-CCN'],  qty: 20,  rate: 175 },
    { product: products['SALT-RCK'], qty: 25,  rate: 38  },
    { product: products['SUGR'],     qty: 80,  rate: 44  },
    { product: products['TURMR'],    qty: 8,   rate: 195 },
    { product: products['GUR'],      qty: 20,  rate: 58, expiryDate: daysFromNow(60) },
    { product: products['AGBT'],     qty: 500, rate: 2   },
    { product: products['KAPR'],     qty: 1000,rate: 0.5 },
    { product: products['KUMKM'],    qty: 1500,rate: 0.3 },
    { product: products['DIYA'],     qty: 300, rate: 3   },
    { product: products['SNDL'],     qty: 300, rate: 2   },
    { product: products['DHOOP'],    qty: 40,  rate: 28  },
    { product: products['BAG-PPR'],  qty: 500, rate: 2   },
    { product: products['PHNYL'],    qty: 15,  rate: 75  },
    { product: products['BROOM'],    qty: 6,   rate: 75  },
  ];
  for (const o of openings) {
    await createTxn({ type: 'OPENING_BALANCE', to: ms, ...o, date: daysAgo(30), ...opts });
  }

  // ── Day -25: Stock In — Purchase from Kirana ─────────────────────────────────
  console.log('  [Day -25] Stock In — Purchase from Shri Ganesh Kirana...');
  const purchases25 = [
    { product: products['RICE-BAS'], qty: 100, rate: 80, batchRef: 'INV-GK-2501' },
    { product: products['ATTA-WHT'], qty: 50,  rate: 35, batchRef: 'INV-GK-2501' },
    { product: products['POHA'],     qty: 20,  rate: 50, batchRef: 'INV-GK-2501' },
    { product: products['OIL-MST'],  qty: 15,  rate: 148 },
    { product: products['LADU-BSN'], qty: 20,  rate: 340, expiryDate: daysFromNow(5), batchRef: 'SW-2501' },
  ];
  for (const p of purchases25) {
    await createTxn({ type: 'STOCK_IN', to: ms, stockInType: 'PURCHASE', supplier: kirana, date: daysAgo(25), ...p, ...opts });
  }

  // ── Day -22: Stock In — Milk from Dairy ──────────────────────────────────────
  console.log('  [Day -22] Stock In — Milk & Paneer from Dairy...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['MILK-COW'], qty: 50, rate: 60, stockInType: 'PURCHASE', supplier: dairy, date: daysAgo(22), expiryDate: daysFromNow(1), batchRef: 'MLK-2201', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['PNEER'],    qty: 5,  rate: 315, stockInType: 'PURCHASE', supplier: dairy, date: daysAgo(22), expiryDate: daysFromNow(3), ...opts });

  // ── Day -20: Stock In — Flowers from Flower Mart ─────────────────────────────
  console.log('  [Day -20] Stock In — Flowers...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-MRG'], qty: 30, rate: 75, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(20), expiryDate: daysFromNow(2), batchRef: 'FL-2001', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-RSP'], qty: 10, rate: 145, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(20), expiryDate: daysFromNow(1), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-LTS'], qty: 100, rate: 5, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(20), expiryDate: daysFromNow(1), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['LEAF-BAN'], qty: 100, rate: 3, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(20), expiryDate: daysFromNow(2), ...opts });

  // ── Day -18: Donation — Ghee from Trust ──────────────────────────────────────
  console.log('  [Day -18] Stock In — Ghee donation from Trust...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['GHEE-DSI'], qty: 15, rate: 0, stockInType: 'DONATION', supplier: trust, date: daysAgo(18), expiryDate: daysFromNow(180), batchRef: 'DON-TRUST-01', notes: 'Donated by Amalner Charitable Trust on occasion of Ekadashi', ...opts });

  // ── Day -15: Transfers — Main Store → Departments ────────────────────────────
  console.log('  [Day -15] Transfers — Main Store → Kitchen...');
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['RICE-BAS'], qty: 50,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['ATTA-WHT'], qty: 30,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['GHEE-DSI'], qty: 10,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['SUGR'],     qty: 20,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['MILK-COW'], qty: 30,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['DAL-CHN'],  qty: 15,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['POHA'],     qty: 10,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['GUR'],      qty: 10,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['LADU-BSN'], qty: 10,  date: daysAgo(15), ...opts });

  console.log('  [Day -15] Transfers — Main Store → Puja Samagri Room...');
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['AGBT'],     qty: 200, date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['KAPR'],     qty: 400, date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['KUMKM'],    qty: 500, date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['DIYA'],     qty: 100, date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['SNDL'],     qty: 100, date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['GHEE-DSI'], qty: 5,   date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['TURMR'],    qty: 3,   date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['DHOOP'],    qty: 20,  date: daysAgo(15), ...opts });

  console.log('  [Day -15] Transfers — Main Store → Flower Room...');
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-MRG'], qty: 20,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-RSP'], qty: 8,   date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-LTS'], qty: 80,  date: daysAgo(15), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['LEAF-BAN'], qty: 60,  date: daysAgo(15), ...opts });

  // ── Day -12: Stock Out — Kitchen Consumption ──────────────────────────────────
  console.log('  [Day -12] Stock Out — Kitchen daily consumption...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), notes: 'Prasadam preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['ATTA-WHT'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), notes: 'Halwa preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['SUGR'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['DAL-CHN'],  qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(12), ...opts });

  // ── Day -12: Stock Out — Distribution (Prasadam) ─────────────────────────────
  console.log('  [Day -12] Stock Out — Prasadam distribution...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['LADU-BSN'], qty: 8, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(12), notes: 'Ekadashi prasadam distribution', ...opts });

  // ── Day -10: Puja Samagri Usage ───────────────────────────────────────────────
  console.log('  [Day -10] Stock Out — Puja samagri daily use...');
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['AGBT'],  qty: 50,  stockOutPurpose: 'OFFERING', date: daysAgo(10), notes: 'Daily aarti', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['KAPR'],  qty: 100, stockOutPurpose: 'OFFERING', date: daysAgo(10), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['KUMKM'], qty: 150, stockOutPurpose: 'OFFERING', date: daysAgo(10), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['DIYA'],  qty: 30,  stockOutPurpose: 'OFFERING', date: daysAgo(10), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['SNDL'],  qty: 50,  stockOutPurpose: 'OFFERING', date: daysAgo(10), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['GHEE-DSI'], qty: 2, stockOutPurpose: 'OFFERING', date: daysAgo(10), notes: 'Deepam ghee', ...opts });

  // ── Day -8: Wastage — Flower Room (expired flowers) ──────────────────────────
  console.log('  [Day -8] Wastage — Expired flowers in Flower Room...');
  await createTxn({ type: 'WASTAGE', from: fr, product: products['FLWR-MRG'], qty: 5, wastageReason: 'EXPIRED', date: daysAgo(8), notes: 'Flowers dried and unusable', ...opts });
  await createTxn({ type: 'WASTAGE', from: fr, product: products['FLWR-RSP'], qty: 3, wastageReason: 'EXPIRED', date: daysAgo(8), ...opts });

  // ── Day -7: New Stock In ──────────────────────────────────────────────────────
  console.log('  [Day -7] Stock In — Replenishment...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['RICE-BAS'], qty: 150, rate: 82, stockInType: 'PURCHASE', supplier: kirana, date: daysAgo(7), batchRef: 'INV-GK-0701', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['DAL-URD'],  qty: 25,  rate: 112, stockInType: 'PURCHASE', supplier: kirana, date: daysAgo(7), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-MRG'], qty: 25, rate: 80, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(7), expiryDate: daysFromNow(3), batchRef: 'FL-0701', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-LTS'], qty: 120, rate: 5, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(7), expiryDate: daysFromNow(1), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['MILK-COW'], qty: 40, rate: 62, stockInType: 'PURCHASE', supplier: dairy, date: daysAgo(7), expiryDate: daysFromNow(1), batchRef: 'MLK-0701', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['LADU-BSN'], qty: 15, rate: 345, stockInType: 'PURCHASE', supplier: kirana, date: daysAgo(7), expiryDate: daysFromNow(6), batchRef: 'SW-0701', ...opts });

  // ── Day -5: More Transfers ────────────────────────────────────────────────────
  console.log('  [Day -5] Transfers — Replenishment to departments...');
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['RICE-BAS'], qty: 40,  date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['MILK-COW'], qty: 20,  date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['LADU-BSN'], qty: 10,  date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-MRG'], qty: 20,  date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-LTS'], qty: 100, date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['AGBT'],     qty: 100, date: daysAgo(5), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: products['DIYA'],     qty: 50,  date: daysAgo(5), ...opts });

  // ── Day -3: Stock Out ─────────────────────────────────────────────────────────
  console.log('  [Day -3] Stock Out — Kitchen & Puja usage...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['RICE-BAS'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['ATTA-WHT'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['GHEE-DSI'], qty: 2,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['MILK-COW'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['AGBT'],     qty: 60, stockOutPurpose: 'OFFERING',   date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: products['KAPR'],     qty: 80, stockOutPurpose: 'OFFERING',   date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: products['FLWR-MRG'], qty: 10, stockOutPurpose: 'OFFERING',   date: daysAgo(3), notes: 'Shri Ram Navami decoration', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['LADU-BSN'], qty: 8,  stockOutPurpose: 'DISTRIBUTION', date: daysAgo(3), ...opts });

  // ── Day -1: Today-ish transactions ───────────────────────────────────────────
  console.log('  [Day -1] Stock In & Out — Recent activity...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['FLWR-MRG'], qty: 20, rate: 85, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(1), expiryDate: daysFromNow(3), batchRef: 'FL-TODAY', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: products['MILK-COW'], qty: 30, rate: 62, stockInType: 'PURCHASE', supplier: dairy, date: daysAgo(1), expiryDate: daysFromNow(1), batchRef: 'MLK-TODAY', ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: products['MILK-COW'], qty: 20, date: daysAgo(1), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: products['FLWR-MRG'], qty: 15, date: daysAgo(1), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: products['MILK-COW'], qty: 8, stockOutPurpose: 'CONSUMPTION', date: daysAgo(1), ...opts });
  await createTxn({ type: 'WASTAGE', from: ms, product: products['PNEER'], qty: 1, wastageReason: 'EXPIRED', date: daysAgo(1), notes: 'Paneer turned sour in main store', ...opts });

  // ─── Done ────────────────────────────────────────────────────────────────────

  const txnCount = await StockTransaction.countDocuments();
  console.log(`\n✅  Test data seeded successfully!`);
  console.log(`   Products  : ${productDefs.length}`);
  console.log(`   Suppliers : 4`);
  console.log(`   Users     : 4 (manager, kitchen staff, puja staff, viewer)`);
  console.log(`   Transactions: ${txnCount} total\n`);
  console.log('Test Login Credentials:');
  console.log('   Super Admin   : admin@mandir.com    / Admin@1234');
  console.log('   Store Manager : manager@mandir.com  / Manager@123');
  console.log('   Kitchen Staff : kitchen@mandir.com  / Kitchen@123');
  console.log('   Puja Staff    : puja@mandir.com     / Puja@1234');
  console.log('   Viewer        : viewer@mandir.com   / Viewer@123\n');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('❌  Test seed failed:', err.message);
  process.exit(1);
});
