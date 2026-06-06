/**
 * Test Data Seed — Mangal Grah Mandir (Updated)
 * 3 months of realistic data: March–June 2026
 * 40 products including Dal Bati Churma + Amul Panchamrut (packaged + ingredients)
 * ~200 transactions covering all modules
 *
 * ⚠️  To re-seed fresh:
 *   1. Drop DB or clear collections via mongosh
 *   2. node src/seeds/index.js
 *   3. node src/seeds/testData.seed.js
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
import Donation from '../models/Donation.js';
import SupplierPayment from '../models/SupplierPayment.js';
import DonationOccasion from '../models/DonationOccasion.js';
import Asset from '../models/Asset.js';
import AssetTransaction from '../models/AssetTransaction.js';
import BorrowGroup from '../models/BorrowGroup.js';
import Settings from '../models/Settings.js';
import { createBatch, consumeBatches, transferBatches } from '../services/fifo.service.js';
import { recomputeBalance } from '../services/stockBalance.service.js';
import { generateTransactionNumber } from '../services/transactionNumber.service.js';
import { generatePaymentNumber } from '../services/paymentNumber.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function createTxn({
  type, product, from, to, qty, date, supplier, rate,
  stockInType, stockOutPurpose, wastageReason,
  expiryDate, batchRef, invoiceNumber, notes, adminUser,
}) {
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
    invoiceNumber: invoiceNumber || undefined,
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

// ─── Main ──────────────────────────────────────────────────────────────────────

const seed = async () => {
  await connectDB();

  // Skip if already seeded with updated data
  const alreadyNew = await Product.findOne({ code: 'TOOR-DAL' });
  if (alreadyNew) {
    console.log('⚠  Updated test data already exists (TOOR-DAL found). Skipping.');
    await mongoose.disconnect();
    return;
  }

  // Warn if old seed data exists
  const oldData = await Product.findOne({ code: 'RICE-BAS' });
  if (oldData) {
    console.log('⚠  Old test data found (RICE-BAS). Clear the DB first then re-run:');
    console.log('   node src/seeds/index.js && node src/seeds/testData.seed.js');
    await mongoose.disconnect();
    return;
  }

  console.log('\n🌱  Seeding 3-month test data...\n');

  // ── Lookup master data ─────────────────────────────────────────────────────

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
    Unit.findOne({ symbol: 'g'  }),
    Unit.findOne({ symbol: 'L'  }),
    Unit.findOne({ symbol: 'pcs' }),
    Unit.findOne({ symbol: 'pkt' }),
    Unit.findOne({ symbol: 'bag' }),
  ]);

  const adminUser = await User.findOne({ role: 'super_admin' });

  if (!ms || !kt || !ps || !adminUser) {
    console.error('❌  Run node src/seeds/index.js first to create departments and admin user.');
    await mongoose.disconnect();
    return;
  }

  const opts = { adminUser };

  // ── 1. Suppliers ───────────────────────────────────────────────────────────

  console.log('Creating suppliers...');
  const [kirana, flowerMart, dairy, trust, amul, dryFruits] = await Promise.all([
    Supplier.create({ name: 'Shri Ganesh Kirana Store', type: 'vendor', contactPerson: 'Ramesh Patil', phone: '9876543210', city: 'Amalner', gstin: '27AABCS1234A1Z5', creditDays: 30,
      bankAccounts: [{ label: 'Main Account', bankName: 'State Bank of India', accountHolderName: 'Ramesh Patil', accountNumber: '12345678901', ifscCode: 'SBIN0002654', isDefault: true }] }),
    Supplier.create({ name: 'Pushpa Flower Mart', type: 'vendor', contactPerson: 'Sunita Joshi', phone: '9823456780', city: 'Amalner', creditDays: 7,
      bankAccounts: [{ label: 'Savings', bankName: 'Bank of Maharashtra', accountHolderName: 'Sunita Joshi', accountNumber: '60043210987', ifscCode: 'MAHB0000123', upiId: 'sunita.joshi@okbom', isDefault: true }] }),
    Supplier.create({ name: 'Amalner Dairy Farm', type: 'vendor', contactPerson: 'Govind Yadav', phone: '9812345678', city: 'Amalner', creditDays: 15,
      bankAccounts: [{ label: 'Farm Account', bankName: 'Union Bank of India', accountHolderName: 'Govind Yadav', accountNumber: '33902345678', ifscCode: 'UBIN0568441', isDefault: true }] }),
    Supplier.create({ name: 'Amalner Charitable Trust', type: 'donor', contactPerson: 'Shri Dinesh Shah', phone: '9800001234', city: 'Amalner', panNumber: 'AAACT1234A',
      bankAccounts: [{ label: 'Trust Account', bankName: 'HDFC Bank', accountHolderName: 'Amalner Charitable Trust', accountNumber: '50100123456789', ifscCode: 'HDFC0001234', isDefault: true }] }),
    Supplier.create({ name: 'Amul Distributor Amalner', type: 'vendor', contactPerson: 'Kiran Mehta', phone: '9988776655', city: 'Amalner', gstin: '27AABCM5678B1Z3', creditDays: 21,
      bankAccounts: [{ label: 'Business Account', bankName: 'Axis Bank', accountHolderName: 'Kiran Mehta', accountNumber: '918020034567890', ifscCode: 'UTIB0000789', upiId: 'kiran.amul@axisb', isDefault: true }] }),
    Supplier.create({ name: 'Shri Ganpati Dry Fruits', type: 'vendor', contactPerson: 'Mohan Agrawal', phone: '9977665544', city: 'Amalner', creditDays: 15,
      bankAccounts: [{ label: 'Current Account', bankName: 'Central Bank of India', accountHolderName: 'Mohan Agrawal', accountNumber: '3253000123456', ifscCode: 'CBIN0280987', isDefault: true }] }),
  ]);
  console.log('  ✓ 6 vendors (with bank accounts)');

  // Individual named donors
  const [donorRamesh, donorSavita, donorPatel] = await Promise.all([
    Supplier.create({ name: 'Ramesh Shantilal Shah', type: 'donor', phone: '9812001234', city: 'Amalner', panNumber: 'ABCRS5678D',
      bankAccounts: [{ label: 'Savings', bankName: 'State Bank of India', accountHolderName: 'Ramesh S Shah', accountNumber: '30987654321', ifscCode: 'SBIN0002654', isDefault: true }] }),
    Supplier.create({ name: 'Savita Bhaskar Mehta', type: 'donor', phone: '9876001122', city: 'Amalner', panNumber: 'ABFSM2345B',
      bankAccounts: [{ label: 'Account', bankName: 'Bank of Baroda', accountHolderName: 'Savita B Mehta', accountNumber: '24680135792', ifscCode: 'BARB0AMALNT', isDefault: true }] }),
    Supplier.create({ name: 'Patel Parivar', type: 'donor', contactPerson: 'Haresh Patel', phone: '9900556677', city: 'Amalner', panNumber: 'AABPP4567C',
      bankAccounts: [{ label: 'Family Account', bankName: 'HDFC Bank', accountHolderName: 'Haresh Patel', accountNumber: '50100987654321', ifscCode: 'HDFC0004567', isDefault: true }] }),
  ]);
  console.log('  ✓ 3 individual donors (with bank accounts)');

  // ── 2. Products ────────────────────────────────────────────────────────────

  console.log('Creating products...');
  const productDefs = [
    // ── Grains & Pulses ──
    { name: 'Basmati Rice',            code: 'RICE-BAS',   category: grCat, unit: kg,  minStockLevel: 50,  reorderPoint: 100, standardRate: 80,  isPujaItem: false },
    { name: 'Wheat Flour (Atta)',       code: 'ATTA-WHT',   category: grCat, unit: kg,  minStockLevel: 30,  reorderPoint: 60,  standardRate: 35,  isPujaItem: false },
    { name: 'Toor Dal',                code: 'TOOR-DAL',   category: grCat, unit: kg,  minStockLevel: 15,  reorderPoint: 35,  standardRate: 120, isPujaItem: false },
    { name: 'Moong Dal',               code: 'MONG-DAL',   category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 25,  standardRate: 110, isPujaItem: false },
    { name: 'Chana Dal',               code: 'DAL-CHN',    category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 25,  standardRate: 90,  isPujaItem: false },
    { name: 'Urad Dal',                code: 'DAL-URD',    category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 20,  standardRate: 110, isPujaItem: false },
    { name: 'Besan (Gram Flour)',       code: 'BSNA',       category: grCat, unit: kg,  minStockLevel: 10,  reorderPoint: 25,  standardRate: 65,  isPujaItem: false },
    { name: 'Poha',                    code: 'POHA',        category: grCat, unit: kg,  minStockLevel: 5,   reorderPoint: 15,  standardRate: 50,  isPujaItem: false },

    // ── Oil & Ghee ──
    { name: 'Pure Desi Ghee',          code: 'GHEE-DSI',   category: ogCat, unit: kg,  minStockLevel: 10,  reorderPoint: 20,  standardRate: 600, isPujaItem: true,  isPerishable: true },
    { name: 'Coconut Oil',             code: 'OIL-CCN',    category: ogCat, unit: L,   minStockLevel: 5,   reorderPoint: 10,  standardRate: 180, isPujaItem: false },
    { name: 'Mustard Oil',             code: 'OIL-MST',    category: ogCat, unit: L,   minStockLevel: 5,   reorderPoint: 10,  standardRate: 150, isPujaItem: false },

    // ── Spices & Condiments ──
    { name: 'Rock Salt (Sendha)',       code: 'SALT-RCK',   category: spCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 40,  isPujaItem: false },
    { name: 'Sugar',                   code: 'SUGR',        category: spCat, unit: kg,  minStockLevel: 20,  reorderPoint: 40,  standardRate: 45,  isPujaItem: false },
    { name: 'Turmeric Powder',         code: 'TURMR',       category: spCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 200, isPujaItem: true  },
    { name: 'Jaggery (Gur)',           code: 'GUR',         category: spCat, unit: kg,  minStockLevel: 5,   reorderPoint: 15,  standardRate: 60,  isPujaItem: false, isPerishable: true },
    { name: 'Red Chili Powder',        code: 'RCHIL',       category: spCat, unit: kg,  minStockLevel: 2,   reorderPoint: 6,   standardRate: 250, isPujaItem: false },
    { name: 'Coriander Powder',        code: 'CORIAND',     category: spCat, unit: kg,  minStockLevel: 2,   reorderPoint: 6,   standardRate: 200, isPujaItem: false },
    { name: 'Garam Masala',            code: 'GRMSLA',      category: spCat, unit: kg,  minStockLevel: 1,   reorderPoint: 3,   standardRate: 400, isPujaItem: false },
    { name: 'Cardamom (Elaichi)',       code: 'ELCHI',       category: spCat, unit: g,   minStockLevel: 100, reorderPoint: 300, standardRate: 3,   isPujaItem: true  },

    // ── Dairy & Panchamrut Ingredients ──
    { name: 'Cow Milk',                code: 'MILK-COW',    category: dpCat, unit: L,   minStockLevel: 10,  reorderPoint: 20,  standardRate: 62,  isPujaItem: true,  isPerishable: true },
    { name: 'Fresh Curd (Dahi)',        code: 'DAHI',        category: dpCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 70,  isPujaItem: true,  isPerishable: true },
    { name: 'Paneer',                  code: 'PNEER',        category: dpCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 320, isPujaItem: false, isPerishable: true },
    { name: 'Pure Honey (Shahad)',      code: 'SHAHAD',      category: pjCat, unit: kg,  minStockLevel: 2,   reorderPoint: 4,   standardRate: 600, isPujaItem: true  },
    { name: 'Amul Panchamrut',         code: 'PANCHMRT',    category: pjCat, unit: pkt, minStockLevel: 10,  reorderPoint: 20,  standardRate: 55,  isPujaItem: true  },

    // ── Flowers ──
    { name: 'Marigold Flowers',        code: 'FLWR-MRG',    category: flCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 80,  isPujaItem: true,  isPerishable: true },
    { name: 'Rose Petals',             code: 'FLWR-RSP',    category: flCat, unit: kg,  minStockLevel: 2,   reorderPoint: 5,   standardRate: 150, isPujaItem: true,  isPerishable: true },
    { name: 'Lotus Flowers',           code: 'FLWR-LTS',    category: flCat, unit: pcs, minStockLevel: 10,  reorderPoint: 25,  standardRate: 5,   isPujaItem: true,  isPerishable: true },

    // ── Puja Items ──
    { name: 'Agarbatti (Incense)',      code: 'AGBT',        category: pjCat, unit: pcs, minStockLevel: 100, reorderPoint: 200, standardRate: 2,   isPujaItem: true  },
    { name: 'Camphor (Kapoor)',         code: 'KAPR',        category: pjCat, unit: g,   minStockLevel: 100, reorderPoint: 300, standardRate: 0.5, isPujaItem: true  },
    { name: 'Kumkum',                  code: 'KUMKM',        category: pjCat, unit: g,   minStockLevel: 200, reorderPoint: 500, standardRate: 0.3, isPujaItem: true  },
    { name: 'Diya (Clay Lamp)',        code: 'DIYA',         category: pjCat, unit: pcs, minStockLevel: 50,  reorderPoint: 100, standardRate: 3,   isPujaItem: true  },
    { name: 'Sandalwood Paste',        code: 'SNDL',         category: pjCat, unit: g,   minStockLevel: 50,  reorderPoint: 100, standardRate: 2,   isPujaItem: true  },
    { name: 'Dhoop Sticks',            code: 'DHOOP',        category: pjCat, unit: pkt, minStockLevel: 10,  reorderPoint: 20,  standardRate: 30,  isPujaItem: true  },

    // ── Sweets & Prasadam ──
    { name: 'Besan Laddoo',            code: 'LADU-BSN',    category: swCat, unit: kg,  minStockLevel: 5,   reorderPoint: 10,  standardRate: 350, isPujaItem: true,  isPerishable: true },
    { name: 'Modak (Steamed)',          code: 'MODAK',       category: swCat, unit: pcs, minStockLevel: 20,  reorderPoint: 50,  standardRate: 15,  isPujaItem: true,  isPerishable: true },
    { name: 'Dry Fruits Mix',           code: 'DRYFRT',      category: swCat, unit: kg,  minStockLevel: 3,   reorderPoint: 8,   standardRate: 800, isPujaItem: false  },

    // ── Packing Material ──
    { name: 'Paper Bags (Small)',       code: 'BAG-PPR',     category: pmCat, unit: pcs, minStockLevel: 100, reorderPoint: 300, standardRate: 2,   isPujaItem: false },
    { name: 'Banana Leaves',           code: 'LEAF-BAN',    category: pmCat, unit: pcs, minStockLevel: 20,  reorderPoint: 50,  standardRate: 3,   isPujaItem: false, isPerishable: true },

    // ── Cleaning Supplies ──
    { name: 'Phenyl (Floor Cleaner)',   code: 'PHNYL',       category: csCat, unit: L,   minStockLevel: 5,   reorderPoint: 10,  standardRate: 80,  isPujaItem: false },
    { name: 'Broom',                   code: 'BROOM',        category: csCat, unit: pcs, minStockLevel: 3,   reorderPoint: 5,   standardRate: 80,  isPujaItem: false },
  ];

  const P = {};
  for (const pd of productDefs) {
    P[pd.code] = await Product.create({ ...pd, createdBy: adminUser._id });
  }
  console.log(`  ✓ ${productDefs.length} products`);

  // ── 3. Users ───────────────────────────────────────────────────────────────

  console.log('Creating test users...');
  await Promise.all([
    User.create({ name: 'Suresh Sharma',    email: 'manager@mandir.com',   password: 'Manager@123',  role: 'store_manager', canApproveAssets: true, canApprovePayments: true }),
    User.create({ name: 'Priya Kulkarni',   email: 'kitchen@mandir.com',   password: 'Kitchen@123',  role: 'staff', departments: [kt._id] }),
    User.create({ name: 'Anita Desai',      email: 'puja@mandir.com',      password: 'Puja@1234',    role: 'staff', departments: [ps._id] }),
    User.create({ name: 'Vijay Patil',      email: 'viewer@mandir.com',    password: 'Viewer@123',   role: 'viewer' }),
    // Trustees — can approve payments
    User.create({ name: 'Narayan Deshmukh', email: 'trustee1@mandir.com',  password: 'Trustee@123',  role: 'admin',  canApproveAssets: true, canApprovePayments: true }),
    User.create({ name: 'Sunanda Joshi',    email: 'trustee2@mandir.com',  password: 'Trustee@456',  role: 'admin',  canApproveAssets: true, canApprovePayments: true }),
    // Additional staff
    User.create({ name: 'Mukesh Jadhav',    email: 'staff1@mandir.com',    password: 'Staff@1234',   role: 'staff',  departments: [ms._id] }),
    User.create({ name: 'Kavita Raut',      email: 'staff2@mandir.com',    password: 'Staff@5678',   role: 'staff',  departments: [ps._id] }),
    User.create({ name: 'Ramesh Borse',     email: 'staff3@mandir.com',    password: 'Staff@9012',   role: 'staff',  departments: [kt._id] }),
  ]);
  console.log('  ✓ 9 test users (incl. 2 trustees + 3 additional staff)');

  // ── 4. Transactions ─────────────────────────────────────────────────────────
  // 3 months: March 1 → June 2, 2026
  // Today = Day 0, so March 1 ≈ Day -93

  console.log('\nCreating transactions (3 months)...\n');

  // ════════════════════════════════════════════════════════════════
  // MARCH — Opening + Month 1
  // ════════════════════════════════════════════════════════════════

  // ── Day -93: Opening Balances — Main Store ──
  console.log('  [March 01] Opening balances — Main Store...');
  const openings = [
    { product: P['RICE-BAS'], qty: 400,  rate: 78  },
    { product: P['ATTA-WHT'], qty: 200,  rate: 34  },
    { product: P['TOOR-DAL'], qty: 80,   rate: 118 },
    { product: P['MONG-DAL'], qty: 60,   rate: 108 },
    { product: P['DAL-CHN'],  qty: 60,   rate: 88  },
    { product: P['DAL-URD'],  qty: 50,   rate: 108 },
    { product: P['BSNA'],     qty: 50,   rate: 62  },
    { product: P['POHA'],     qty: 25,   rate: 48  },
    { product: P['GHEE-DSI'], qty: 60,   rate: 580, expiryDate: daysFromNow(170), batchRef: 'LOT-GHEE-MAR26' },
    { product: P['OIL-CCN'],  qty: 40,   rate: 175 },
    { product: P['OIL-MST'],  qty: 30,   rate: 145 },
    { product: P['SALT-RCK'], qty: 40,   rate: 38  },
    { product: P['SUGR'],     qty: 150,  rate: 44  },
    { product: P['TURMR'],    qty: 15,   rate: 195 },
    { product: P['GUR'],      qty: 50,   rate: 58,  expiryDate: daysFromNow(80), batchRef: 'GUR-MAR26' },
    { product: P['RCHIL'],    qty: 15,   rate: 245 },
    { product: P['CORIAND'],  qty: 15,   rate: 195 },
    { product: P['GRMSLA'],   qty: 8,    rate: 390 },
    { product: P['ELCHI'],    qty: 2000, rate: 2.8 },
    { product: P['SHAHAD'],   qty: 12,   rate: 580 },
    { product: P['PANCHMRT'], qty: 80,   rate: 52  },
    { product: P['DRYFRT'],   qty: 25,   rate: 780 },
    { product: P['AGBT'],     qty: 2000, rate: 2   },
    { product: P['KAPR'],     qty: 5000, rate: 0.5 },
    { product: P['KUMKM'],    qty: 5000, rate: 0.3 },
    { product: P['DIYA'],     qty: 800,  rate: 3   },
    { product: P['SNDL'],     qty: 800,  rate: 2   },
    { product: P['DHOOP'],    qty: 120,  rate: 28  },
    { product: P['BAG-PPR'],  qty: 1500, rate: 2   },
    { product: P['PHNYL'],    qty: 40,   rate: 75  },
    { product: P['BROOM'],    qty: 12,   rate: 75  },
  ];
  for (const o of openings) {
    await createTxn({ type: 'OPENING_BALANCE', to: ms, date: daysAgo(93), ...o, ...opts });
  }

  // ── Day -88: First perishable purchase (Flower Mart + Dairy) ──
  console.log('  [March 06] Perishable purchases — Flowers & Dairy...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 40, rate: 78,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(88), expiryDate: daysAgo(85), batchRef: 'FL-MAR06', invoiceNumber: 'FL-MAR06', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-RSP'], qty: 15, rate: 145, stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(88), expiryDate: daysAgo(86), invoiceNumber: 'FL-MAR06', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-LTS'], qty: 200,rate: 5,   stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(88), expiryDate: daysAgo(87), invoiceNumber: 'FL-MAR06', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LEAF-BAN'], qty: 200,rate: 3,   stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(88), expiryDate: daysAgo(85), invoiceNumber: 'FL-MAR06', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 80, rate: 60,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(88), expiryDate: daysAgo(87), batchRef: 'MLK-MAR06', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20, rate: 68,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(88), expiryDate: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PNEER'],    qty: 8,  rate: 315, stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(88), expiryDate: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 30, rate: 340, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(88), expiryDate: daysAgo(81), batchRef: 'SW-MAR06', ...opts });

  // ── Day -87: First transfers to departments ──
  console.log('  [March 07] Transfers — Main Store → all departments...');
  // → Kitchen
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 60,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ATTA-WHT'], qty: 40,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['TOOR-DAL'], qty: 20,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MONG-DAL'], qty: 15,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['BSNA'],     qty: 20,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GHEE-DSI'], qty: 15,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['SUGR'],     qty: 30,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['SALT-RCK'], qty: 10,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RCHIL'],    qty: 4,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['CORIAND'],  qty: 4,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GRMSLA'],   qty: 2,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DRYFRT'],   qty: 5,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ELCHI'],    qty: 300, date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GUR'],      qty: 10,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 50,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['PNEER'],    qty: 5,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 20,  date: daysAgo(87), ...opts });
  // → Puja Room
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 400, date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KAPR'],     qty: 1000,date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KUMKM'],    qty: 1000,date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['DIYA'],     qty: 200, date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SNDL'],     qty: 200, date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['DHOOP'],    qty: 30,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['GHEE-DSI'], qty: 5,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 20,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SHAHAD'],   qty: 3,   date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['TURMR'],    qty: 3,   date: daysAgo(87), ...opts });
  // → Flower Room
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 30,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-RSP'], qty: 12,  date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-LTS'], qty: 150, date: daysAgo(87), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['LEAF-BAN'], qty: 150, date: daysAgo(87), ...opts });

  // ── Day -85: Week 1 Consumption ──
  console.log('  [March 09] Week 1 — Kitchen consumption...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), notes: 'Prasadam rice', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), notes: 'Dal for langar', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(85), notes: 'Panchamrut making', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 10, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(85), notes: 'Daily prasad distribution', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING', date: daysAgo(85), notes: 'Daily aarti', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 150,stockOutPurpose: 'OFFERING', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 150,stockOutPurpose: 'OFFERING', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['DIYA'],     qty: 30, stockOutPurpose: 'OFFERING', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING', date: daysAgo(85), notes: 'Daily abhishek', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['SHAHAD'],   qty: 0.5,stockOutPurpose: 'OFFERING', date: daysAgo(85), notes: 'Panchamrut abhishek', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 10, stockOutPurpose: 'OFFERING', date: daysAgo(85), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-RSP'], qty: 5,  stockOutPurpose: 'OFFERING', date: daysAgo(85), ...opts });

  // ════════════════════════════════════════════════════════════════
  // HOLI FESTIVAL — March 14 (Day -80)
  // ════════════════════════════════════════════════════════════════

  console.log('  [March 13] Pre-Holi purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 40,  rate: 345, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(81), expiryDate: daysAgo(74), batchRef: 'SW-HOLI26', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DRYFRT'],   qty: 12,  rate: 800, stockInType: 'PURCHASE', supplier: dryFruits, date: daysAgo(81), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SUGR'],     qty: 40,  rate: 46,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(81), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MODAK'],    qty: 200, rate: 14,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(81), expiryDate: daysAgo(79), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 60,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(81), expiryDate: daysAgo(80), batchRef: 'MLK-HOLI', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(81), expiryDate: daysAgo(78), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 60,  rate: 85,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(81), expiryDate: daysAgo(78), batchRef: 'FL-HOLI', invoiceNumber: 'FL-HOLI', ...opts });

  console.log('  [March 14] Holi Festival — transfers + big consumption...');
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 30,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DRYFRT'],   qty: 10,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['SUGR'],     qty: 25,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 40,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 50,  date: daysAgo(80), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 10,  date: daysAgo(80), ...opts });

  // Dal Bati Churma preparation on Holi
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 12, stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Dal Bati Churma — Holi festival', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MONG-DAL'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Dal Bati Churma — Holi festival', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Bati preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['BSNA'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Churma preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Bati + Churma ghee', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DRYFRT'],   qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Churma garnish', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ELCHI'],    qty: 200,stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(80), notes: 'Panchamrut preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 25, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(80), notes: 'Holi prasad distribution', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ms, product: P['MODAK'],    qty: 150,stockOutPurpose: 'DISTRIBUTION', date: daysAgo(80), notes: 'Holi modak distribution', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 500,stockOutPurpose: 'OFFERING',    date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 500,stockOutPurpose: 'OFFERING',    date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['DIYA'],     qty: 100,stockOutPurpose: 'OFFERING',    date: daysAgo(80), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 8,  stockOutPurpose: 'OFFERING',    date: daysAgo(80), notes: 'Holi abhishek', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 30, stockOutPurpose: 'OFFERING',    date: daysAgo(80), notes: 'Holi decoration', ...opts });

  // Post-Holi wastage
  await createTxn({ type: 'WASTAGE', from: fr, product: P['FLWR-MRG'], qty: 8, wastageReason: 'EXPIRED', date: daysAgo(79), notes: 'Leftover flowers dried up', ...opts });
  await createTxn({ type: 'WASTAGE', from: fr, product: P['FLWR-RSP'], qty: 3, wastageReason: 'EXPIRED', date: daysAgo(79), ...opts });

  // ── Day -77: Post-Holi replenishment ──
  console.log('  [March 17] Post-Holi replenishment...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RICE-BAS'], qty: 100, rate: 80, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(77), batchRef: 'INV-GK-MAR17', invoiceNumber: 'INV-GK-MAR17', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['TOOR-DAL'], qty: 30,  rate: 120, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(77), invoiceNumber: 'INV-GK-MAR17', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAL-CHN'],  qty: 25,  rate: 90,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(77), invoiceNumber: 'INV-GK-MAR17', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 35,  rate: 80,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(77), expiryDate: daysAgo(74), batchRef: 'FL-MAR17', invoiceNumber: 'FL-MAR17', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 60,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(77), expiryDate: daysAgo(76), batchRef: 'MLK-MAR17', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 15,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(77), expiryDate: daysAgo(74), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PANCHMRT'], qty: 30,  rate: 52,  stockInType: 'PURCHASE', supplier: amul,      date: daysAgo(77), ...opts });

  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 40,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['TOOR-DAL'], qty: 15,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ATTA-WHT'], qty: 20,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GHEE-DSI'], qty: 12,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['BSNA'],     qty: 15,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 40,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 10,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 30,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 10,  date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 300, date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KAPR'],     qty: 700, date: daysAgo(76), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KUMKM'],    qty: 700, date: daysAgo(76), ...opts });

  // ── Day -73: Mid-March regular operations ──
  console.log('  [March 21] Mid-March operations...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), notes: 'Weekly dal', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING',    date: daysAgo(73), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 15, stockOutPurpose: 'OFFERING',    date: daysAgo(73), ...opts });

  // ── Day -66: Month-end purchase (March) ──
  console.log('  [March 28] Month-end purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RICE-BAS'], qty: 150, rate: 82,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), batchRef: 'INV-GK-MAR28', invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['ATTA-WHT'], qty: 80,  rate: 36,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SUGR'],     qty: 80,  rate: 46,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RCHIL'],    qty: 8,   rate: 250, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['CORIAND'],  qty: 8,   rate: 200, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAL-URD'],  qty: 25,  rate: 112, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['POHA'],     qty: 20,  rate: 50,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['TOOR-DAL'], qty: 40,  rate: 122, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MONG-DAL'], qty: 25,  rate: 112, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(66), invoiceNumber: 'INV-GK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PANCHMRT'], qty: 50,  rate: 54,  stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(66), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SHAHAD'],   qty: 5,   rate: 600, stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(66), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 70,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(66), expiryDate: daysAgo(65), batchRef: 'MLK-MAR28', invoiceNumber: 'MLK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(66), expiryDate: daysAgo(63), invoiceNumber: 'MLK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PNEER'],    qty: 8,   rate: 320, stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(66), expiryDate: daysAgo(61), invoiceNumber: 'MLK-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 40,  rate: 82,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(66), expiryDate: daysAgo(63), batchRef: 'FL-MAR28', invoiceNumber: 'FL-MAR28', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 25,  rate: 345, stockInType: 'PURCHASE', supplier: kirana,   date: daysAgo(66), expiryDate: daysAgo(59), batchRef: 'SW-MAR28', invoiceNumber: 'INV-GK-MAR28', ...opts });

  // Month-end transfers
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 50,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ATTA-WHT'], qty: 30,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['SUGR'],     qty: 20,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 45,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['PNEER'],    qty: 5,   date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAL-URD'],  qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['POHA'],     qty: 10,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RCHIL'],    qty: 3,   date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['CORIAND'],  qty: 3,   date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GHEE-DSI'], qty: 12,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['TOOR-DAL'], qty: 25,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MONG-DAL'], qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['BSNA'],     qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ELCHI'],    qty: 500, date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GUR'],      qty: 10,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 300, date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KAPR'],     qty: 800, date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KUMKM'],    qty: 800, date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['DIYA'],     qty: 150, date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 15,  date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SHAHAD'],   qty: 2,   date: daysAgo(65), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 35,  date: daysAgo(65), ...opts });

  // ════════════════════════════════════════════════════════════════
  // APRIL — Ram Navami + Hanuman Jayanti
  // ════════════════════════════════════════════════════════════════

  // ── Day -62: April week 1 consumption ──
  console.log('  [April 01] April week 1 consumption...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(62), notes: 'Panchamrut ingredients', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING',    date: daysAgo(62), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 15, stockOutPurpose: 'OFFERING',    date: daysAgo(62), ...opts });

  // ── RAM NAVAMI — April 6 (Day -57) ──
  console.log('  [April 05] Pre-Ram Navami purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 30,  rate: 350, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(58), expiryDate: daysAgo(51), batchRef: 'SW-RAMNAV', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 70,  rate: 90,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(58), expiryDate: daysAgo(55), batchRef: 'FL-RAMNAV', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-LTS'], qty: 300, rate: 5,   stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(58), expiryDate: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LEAF-BAN'], qty: 200, rate: 3,   stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(58), expiryDate: daysAgo(55), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 80,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(58), expiryDate: daysAgo(57), batchRef: 'MLK-RAMNAV', invoiceNumber: 'MLK-RAMNAV', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 25,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(58), expiryDate: daysAgo(55), invoiceNumber: 'MLK-RAMNAV', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DRYFRT'],   qty: 10,  rate: 820, stockInType: 'PURCHASE', supplier: dryFruits,  date: daysAgo(58), invoiceNumber: 'DRY-APR05', ...opts });

  console.log('  [April 06] Ram Navami — big festival...');
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 25,  date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 50,  date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 20,  date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DRYFRT'],   qty: 8,   date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 60,  date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-LTS'], qty: 250, date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 12,  date: daysAgo(57), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SHAHAD'],   qty: 1.5, date: daysAgo(57), ...opts });

  // Ram Navami consumption
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 25, stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), notes: 'Ram Navami prasad rice', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), notes: 'Dal Bati for Ram Navami', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['BSNA'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), notes: 'Churma preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 6,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), notes: 'Ram Navami bati', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), notes: 'Panchamrut for Ram Navami', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DRYFRT'],   qty: 6,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 20, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(57), notes: 'Ram Navami prasad distribution', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 500,stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 500,stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['DIYA'],     qty: 100,stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 10, stockOutPurpose: 'OFFERING',    date: daysAgo(57), notes: 'Ram Navami abhishek with Panchamrut', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['SHAHAD'],   qty: 1,  stockOutPurpose: 'OFFERING',    date: daysAgo(57), notes: 'Panchamrut honey', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 35, stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-LTS'], qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(57), ...opts });

  await createTxn({ type: 'WASTAGE', from: fr, product: P['FLWR-MRG'], qty: 10, wastageReason: 'EXPIRED', date: daysAgo(56), notes: 'Leftover flowers', ...opts });

  // ── HANUMAN JAYANTI — April 12 (Day -51) ──
  console.log('  [April 11] Pre-Hanuman Jayanti purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 25,  rate: 350, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(52), expiryDate: daysAgo(45), batchRef: 'SW-HANUMAN', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['BSNA'],     qty: 20,  rate: 65,  stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(52), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 45,  rate: 85,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(52), expiryDate: daysAgo(49), batchRef: 'FL-HANUMAN', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 55,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(52), expiryDate: daysAgo(51), batchRef: 'MLK-HANUMAN', invoiceNumber: 'MLK-HANUMAN', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 18,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(52), expiryDate: daysAgo(49), invoiceNumber: 'MLK-HANUMAN', ...opts });

  console.log('  [April 12] Hanuman Jayanti...');
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 20,  date: daysAgo(51), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['BSNA'],     qty: 15,  date: daysAgo(51), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 35,  date: daysAgo(51), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 12,  date: daysAgo(51), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 40,  date: daysAgo(51), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 8,   date: daysAgo(51), ...opts });

  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['BSNA'],     qty: 12, stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), notes: 'Besan laddoo for Hanuman', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), notes: 'Panchamrut + cooking', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(51), notes: 'Panchamrut abhishek', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 18, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(51), notes: 'Hanuman bhog distribution', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 150,stockOutPurpose: 'OFFERING',    date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 300,stockOutPurpose: 'OFFERING',    date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 300,stockOutPurpose: 'OFFERING',    date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['DIYA'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(51), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 6,  stockOutPurpose: 'OFFERING',    date: daysAgo(51), notes: 'Hanuman abhishek Panchamrut', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 30, stockOutPurpose: 'OFFERING',    date: daysAgo(51), ...opts });

  // ── Day -45: Mid-April purchase + donation ──
  console.log('  [April 18] Mid-April purchase & donation...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RICE-BAS'], qty: 100, rate: 82,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(45), batchRef: 'INV-GK-APR18', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['ATTA-WHT'], qty: 60,  rate: 36,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(45), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['TOOR-DAL'], qty: 25,  rate: 122, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(45), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MONG-DAL'], qty: 20,  rate: 112, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(45), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 65,  rate: 62,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(45), expiryDate: daysAgo(44), batchRef: 'MLK-APR18', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20,  rate: 70,  stockInType: 'PURCHASE', supplier: dairy,     date: daysAgo(45), expiryDate: daysAgo(42), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['GHEE-DSI'], qty: 20,  rate: 0,   stockInType: 'DONATION', supplier: trust,     date: daysAgo(45), expiryDate: daysFromNow(120), batchRef: 'DON-TRUST-APR', notes: 'Donation by Amalner Charitable Trust on Akshaya Tritiya', ...opts });

  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 40,  date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['TOOR-DAL'], qty: 15,  date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MONG-DAL'], qty: 10,  date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 40,  date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GHEE-DSI'], qty: 8,   date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 300, date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['DIYA'],     qty: 150, date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KUMKM'],    qty: 500, date: daysAgo(44), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KAPR'],     qty: 800, date: daysAgo(44), ...opts });

  // ── Day -39: Late April consumption ──
  console.log('  [April 24] Late April consumption...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(39), notes: 'Weekly dal Bati', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MONG-DAL'], qty: 6,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(39), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING',    date: daysAgo(39), ...opts });

  // ════════════════════════════════════════════════════════════════
  // MAY — Regular Operations
  // ════════════════════════════════════════════════════════════════

  console.log('  [May 01] May monthly purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RICE-BAS'], qty: 120, rate: 84,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(32), batchRef: 'INV-GK-MAY01', invoiceNumber: 'INV-GK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['ATTA-WHT'], qty: 60,  rate: 37,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(32), invoiceNumber: 'INV-GK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SUGR'],     qty: 60,  rate: 47,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(32), invoiceNumber: 'INV-GK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RCHIL'],    qty: 5,   rate: 255, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(32), invoiceNumber: 'INV-GK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['CORIAND'],  qty: 5,   rate: 205, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(32), invoiceNumber: 'INV-GK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PANCHMRT'], qty: 50,  rate: 54,  stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(32), invoiceNumber: 'AMUL-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SHAHAD'],   qty: 3,   rate: 610, stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(32), invoiceNumber: 'AMUL-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 70,  rate: 64,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(32), expiryDate: daysAgo(31), batchRef: 'MLK-MAY01', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20,  rate: 72,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(32), expiryDate: daysAgo(29), ...opts });

  // May donation — Akshaya Tritiya
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['GHEE-DSI'], qty: 15, rate: 0, stockInType: 'DONATION', supplier: trust, date: daysAgo(30), expiryDate: daysFromNow(120), batchRef: 'DON-TRUST-MAY', notes: 'Donation on Akshaya Tritiya — Shri Dinesh Shah', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SUGR'],     qty: 20, rate: 0, stockInType: 'DONATION', supplier: trust, date: daysAgo(30), notes: 'Sugar donation by Amalner Charitable Trust', ...opts });

  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 45,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['ATTA-WHT'], qty: 20,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['SUGR'],     qty: 15,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 45,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['GHEE-DSI'], qty: 8,   date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 15,  date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 200, date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SHAHAD'],   qty: 2,   date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KAPR'],     qty: 800, date: daysAgo(31), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['KUMKM'],    qty: 800, date: daysAgo(31), ...opts });

  // ── Day -25: May mid-month consumption ──
  console.log('  [May 08] Mid-May operations...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(25), notes: 'Panchamrut for daily abhishek', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 6,  stockOutPurpose: 'OFFERING',    date: daysAgo(25), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['SHAHAD'],   qty: 0.5,stockOutPurpose: 'OFFERING',    date: daysAgo(25), ...opts });

  // ── Day -18: Mid-May purchase ──
  console.log('  [May 15] Mid-May purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 20,  rate: 355, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(18), expiryDate: daysFromNow(6), batchRef: 'SW-MAY15', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 35,  rate: 88,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(18), expiryDate: daysFromNow(4), batchRef: 'FL-MAY15', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-LTS'], qty: 200, rate: 5,   stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(18), expiryDate: daysFromNow(2), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 55,  rate: 64,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(18), expiryDate: daysAgo(17), batchRef: 'MLK-MAY15', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 15,  rate: 72,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(18), expiryDate: daysAgo(15), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PNEER'],    qty: 5,   rate: 325, stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(18), expiryDate: daysAgo(13), ...opts });

  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 15,  date: daysAgo(17), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 35,  date: daysAgo(17), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 10,  date: daysAgo(17), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['PNEER'],    qty: 4,   date: daysAgo(17), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 28,  date: daysAgo(17), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-LTS'], qty: 150, date: daysAgo(17), ...opts });

  // ── Day -14: Mid-May operations ──
  console.log('  [May 19] Mid-May consumption...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 20, stockOutPurpose: 'CONSUMPTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 3,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 10, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-MRG'], qty: 18, stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: fr, product: P['FLWR-LTS'], qty: 100,stockOutPurpose: 'OFFERING',    date: daysAgo(14), ...opts });
  await createTxn({ type: 'WASTAGE', from: fr, product: P['FLWR-MRG'],   qty: 4, wastageReason: 'EXPIRED', date: daysAgo(13), ...opts });

  // ── Day -10: End-May purchase ──
  console.log('  [May 23] End-May purchase...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['RICE-BAS'], qty: 100, rate: 84,  stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(10), batchRef: 'INV-GK-MAY23', invoiceNumber: 'INV-GK-MAY23', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['TOOR-DAL'], qty: 30,  rate: 122, stockInType: 'PURCHASE', supplier: kirana,    date: daysAgo(10), invoiceNumber: 'INV-GK-MAY23', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DRYFRT'],   qty: 10,  rate: 820, stockInType: 'PURCHASE', supplier: dryFruits, date: daysAgo(10), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['PANCHMRT'], qty: 40,  rate: 55,  stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(10), invoiceNumber: 'AMUL-MAY23', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['SHAHAD'],   qty: 3,   rate: 615, stockInType: 'PURCHASE', supplier: amul,     date: daysAgo(10), invoiceNumber: 'AMUL-MAY23', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 60,  rate: 64,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(10), expiryDate: daysAgo(9), batchRef: 'MLK-MAY23', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 20,  rate: 72,  stockInType: 'PURCHASE', supplier: dairy,    date: daysAgo(10), expiryDate: daysAgo(7), ...opts });

  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['RICE-BAS'], qty: 40,  date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['TOOR-DAL'], qty: 15,  date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DRYFRT'],   qty: 5,   date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 40,  date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 15,  date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['PANCHMRT'], qty: 12,  date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['AGBT'],     qty: 200, date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['DIYA'],     qty: 100, date: daysAgo(9), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: ps, product: P['SHAHAD'],   qty: 2,   date: daysAgo(9), ...opts });

  // ── Day -5: Dal Bati Churma special prep ──
  console.log('  [May 28] Dal Bati Churma special preparation...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['TOOR-DAL'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Dal Bati Churma — special Sunday prasad', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MONG-DAL'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Mixed dal for Bati', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ATTA-WHT'], qty: 12, stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Bati dough', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['BSNA'],     qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Churma preparation', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GHEE-DSI'], qty: 8,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Bati + Churma ghee', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 12, stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DRYFRT'],   qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Churma garnish', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['ELCHI'],    qty: 150,stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RCHIL'],    qty: 2,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['CORIAND'],  qty: 2,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['GRMSLA'],   qty: 1,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 10, stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['DAHI'],     qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(5), notes: 'Panchamrut ingredients', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['LADU-BSN'], qty: 12, stockOutPurpose: 'DISTRIBUTION', date: daysAgo(5), ...opts });

  // ── Day -3: Recent regular operations ──
  console.log('  [May 30] Recent operations...');
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['RICE-BAS'], qty: 15, stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 12, stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['SUGR'],     qty: 5,  stockOutPurpose: 'CONSUMPTION', date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 80, stockOutPurpose: 'OFFERING',    date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KAPR'],     qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['KUMKM'],    qty: 200,stockOutPurpose: 'OFFERING',    date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 5,  stockOutPurpose: 'OFFERING',    date: daysAgo(3), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['SHAHAD'],   qty: 0.5,stockOutPurpose: 'OFFERING',    date: daysAgo(3), notes: 'Panchamrut abhishek', ...opts });

  // ── Day -1: Today's transactions (with near-expiry items for demo) ──
  console.log('  [June 01] Today — recent stock in & daily use...');
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['FLWR-MRG'], qty: 25, rate: 90,  stockInType: 'PURCHASE', supplier: flowerMart, date: daysAgo(1), expiryDate: daysFromNow(3), batchRef: 'FL-TODAY', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['MILK-COW'], qty: 30, rate: 65,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(1), expiryDate: daysFromNow(1), batchRef: 'MLK-TODAY', ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['DAHI'],     qty: 10, rate: 72,  stockInType: 'PURCHASE', supplier: dairy,      date: daysAgo(1), expiryDate: daysFromNow(2), ...opts });
  await createTxn({ type: 'STOCK_IN', to: ms, product: P['LADU-BSN'], qty: 15, rate: 360, stockInType: 'PURCHASE', supplier: kirana,     date: daysAgo(1), expiryDate: daysFromNow(5), batchRef: 'SW-TODAY', ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['MILK-COW'], qty: 20,  date: daysAgo(1), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['DAHI'],     qty: 8,   date: daysAgo(1), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: kt, product: P['LADU-BSN'], qty: 10,  date: daysAgo(1), ...opts });
  await createTxn({ type: 'TRANSFER', from: ms, to: fr, product: P['FLWR-MRG'], qty: 20,  date: daysAgo(1), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: kt, product: P['MILK-COW'], qty: 8, stockOutPurpose: 'CONSUMPTION', date: daysAgo(1), ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['AGBT'],     qty: 40,stockOutPurpose: 'OFFERING',    date: daysAgo(1), notes: 'Morning aarti', ...opts });
  await createTxn({ type: 'STOCK_OUT', from: ps, product: P['PANCHMRT'], qty: 3, stockOutPurpose: 'OFFERING',    date: daysAgo(1), notes: 'Daily abhishek', ...opts });
  await createTxn({ type: 'WASTAGE', from: ms, product: P['PNEER'], qty: 1, wastageReason: 'EXPIRED', date: daysAgo(1), notes: 'Paneer spoiled in main store', ...opts });

  // ── 5. Donations ───────────────────────────────────────────────────────────

  console.log('\nCreating donations...');

  const [hundiOcc, generalOcc, ramNavamiOcc, prasadOcc] = await Promise.all([
    DonationOccasion.findOne({ name: 'Hundi' }),
    DonationOccasion.findOne({ name: 'General Donation' }),
    DonationOccasion.findOne({ name: 'Ram Navami' }),
    DonationOccasion.findOne({ name: 'Prasad Sponsorship' }),
  ]);

  function donationNumKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  async function genDonNum(date) {
    const prefix = `DON-${donationNumKey(date)}-`;
    const last = await Donation.findOne(
      { donationNumber: { $regex: `^${prefix}` } },
      { donationNumber: 1 },
      { sort: { donationNumber: -1 } }
    ).lean();
    const seq = last?.donationNumber
      ? parseInt(last.donationNumber.split('-').at(-1), 10) + 1
      : 1;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  const donationData = [
    // Named — cash, Holi festival
    {
      donationType: 'named',
      date: daysAgo(80),
      donor: trust._id,
      occasion: hundiOcc?._id,
      cashAmount: 11000,
      paymentMode: 'cash',
      is80G: true,
      notes: 'Holi festival donation by Amalner Charitable Trust',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Hundi — weekly March collection
    {
      donationType: 'hundi',
      date: daysAgo(75),
      occasion: hundiOcc?._id,
      cashAmount: 8500,
      paymentMode: 'cash',
      notes: 'Weekly hundi collection — last week of March',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Anonymous — walk-in, Ram Navami
    {
      donationType: 'anonymous',
      date: daysAgo(57),
      donorName: 'Shri Ram Prasad',
      donorPhone: '9876500001',
      occasion: ramNavamiOcc?._id,
      cashAmount: 5100,
      paymentMode: 'cash',
      notes: 'Ram Navami anonymous donation',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Named — UPI, Akshaya Tritiya
    {
      donationType: 'named',
      date: daysAgo(45),
      donor: trust._id,
      occasion: generalOcc?._id,
      cashAmount: 21000,
      paymentMode: 'upi',
      paymentRef: 'UPI-TXN-ACT202604',
      is80G: true,
      notes: 'Akshaya Tritiya — Amalner Charitable Trust donation',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Hundi — April weekly collection
    {
      donationType: 'hundi',
      date: daysAgo(40),
      occasion: hundiOcc?._id,
      cashAmount: 6200,
      paymentMode: 'cash',
      notes: 'Hundi collection — last week of April',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Named — cheque, Prasad Sponsorship
    {
      donationType: 'named',
      date: daysAgo(30),
      donor: trust._id,
      occasion: prasadOcc?._id,
      cashAmount: 51000,
      paymentMode: 'cheque',
      paymentRef: 'CHQ-00124',
      is80G: true,
      notes: 'Prasad sponsorship — May monthly donation by Shri Dinesh Shah',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Hundi — May weekly collection
    {
      donationType: 'hundi',
      date: daysAgo(15),
      occasion: hundiOcc?._id,
      cashAmount: 9800,
      paymentMode: 'cash',
      notes: 'Hundi collection — second week of May',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
    // Anonymous — walk-in, kind (sugar already stocked separately)
    {
      donationType: 'anonymous',
      date: daysAgo(5),
      donorName: 'Smt. Laxmibai Patil',
      donorPhone: '9823400002',
      occasion: generalOcc?._id,
      cashAmount: 2100,
      paymentMode: 'cash',
      notes: 'General donation — walk-in devotee',
      receivedBy: adminUser._id,
      createdBy: adminUser._id,
    },
  ];

  for (const d of donationData) {
    d.donationNumber = await genDonNum(d.date);
    await Donation.create(d);
  }
  console.log(`  ✓ ${donationData.length} donations (trust + hundi + anonymous)`);

  // ── Additional donations from individual donors + more hundi ──────────────
  const [ganeshOcc, templeRenOcc] = await Promise.all([
    DonationOccasion.findOne({ name: 'Ganesh Utsav' }),
    DonationOccasion.findOne({ name: 'Temple Renovation' }),
  ]);

  const extraDonations = [
    // Ramesh Shah — March, general cash
    { donationType: 'named', date: daysAgo(78), donor: donorRamesh._id, occasion: generalOcc?._id, cashAmount: 5100, paymentMode: 'cash', is80G: true, notes: 'Monthly donation by Ramesh Shantilal Shah', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Savita Mehta — Ram Navami, UPI
    { donationType: 'named', date: daysAgo(56), donor: donorSavita._id, occasion: ramNavamiOcc?._id, cashAmount: 3100, paymentMode: 'upi', paymentRef: 'UPI-SAV-RAMNAV26', is80G: false, notes: 'Ram Navami donation — Savita Bhaskar Mehta', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Patel Parivar — Temple Renovation fund, cheque
    { donationType: 'named', date: daysAgo(48), donor: donorPatel._id, occasion: templeRenOcc?._id, cashAmount: 25000, paymentMode: 'cheque', paymentRef: 'CHQ-PAT-0456', is80G: true, notes: 'Temple Renovation Fund — Patel family contribution', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Hundi — April week 1
    { donationType: 'hundi', date: daysAgo(60), occasion: hundiOcc?._id, cashAmount: 7200, paymentMode: 'cash', notes: 'Weekly hundi collection — first week of April', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Hundi — Hanuman Jayanti special
    { donationType: 'hundi', date: daysAgo(51), occasion: hundiOcc?._id, cashAmount: 12500, paymentMode: 'cash', notes: 'Hanuman Jayanti special hundi collection', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Ramesh Shah — May, UPI
    { donationType: 'named', date: daysAgo(22), donor: donorRamesh._id, occasion: generalOcc?._id, cashAmount: 7500, paymentMode: 'upi', paymentRef: 'UPI-RSH-MAY2026', is80G: true, notes: 'May monthly donation — Ramesh Shantilal Shah', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Anonymous — May walk-in
    { donationType: 'anonymous', date: daysAgo(20), donorName: 'Shri Vitthal Devotee', donorPhone: '9823411111', occasion: generalOcc?._id, cashAmount: 1100, paymentMode: 'cash', notes: 'Anonymous walk-in donation', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Savita Mehta — recent general
    { donationType: 'named', date: daysAgo(7), donor: donorSavita._id, occasion: generalOcc?._id, cashAmount: 2100, paymentMode: 'cash', notes: 'General donation — Savita Bhaskar Mehta', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Patel Parivar — June NEFT
    { donationType: 'named', date: daysAgo(2), donor: donorPatel._id, occasion: generalOcc?._id, cashAmount: 15000, paymentMode: 'bank_transfer', paymentRef: 'NEFT-PAT-JUN2026', is80G: true, notes: 'June donation — Patel Parivar', receivedBy: adminUser._id, createdBy: adminUser._id },
    // Hundi — June week 1
    { donationType: 'hundi', date: daysAgo(1), occasion: hundiOcc?._id, cashAmount: 6800, paymentMode: 'cash', notes: 'Weekly hundi collection — first week of June', receivedBy: adminUser._id, createdBy: adminUser._id },
  ];

  for (const d of extraDonations) {
    d.donationNumber = await genDonNum(d.date);
    await Donation.create(d);
  }
  console.log(`  ✓ ${extraDonations.length} additional donations (3 individual donors + hundi + anonymous)`);

  // ── 6. Supplier Payments ──────────────────────────────────────────────────

  console.log('Creating supplier payments...');

  const paymentsData = [
    // Kirana — approved, March consolidated (NEFT)
    // INV-GK-MAR17: RICE-BAS(8000)+TOOR-DAL(3600)+DAL-CHN(2250) = 13850
    // INV-GK-MAR28: RICE-BAS(12300)+ATTA-WHT(2880)+SUGR(3680)+RCHIL(2000)+CORIAND(1600)+DAL-URD(2800)+POHA(1000)+TOOR-DAL(4880)+MONG-DAL(2800)+LADU-BSN(8625) = 42565
    {
      supplier: kirana._id,
      invoices: [
        { invoiceNumber: 'INV-GK-MAR17', invoiceDate: daysAgo(77), invoiceTotal: 13850, paidAmount: 13850 },
        { invoiceNumber: 'INV-GK-MAR28', invoiceDate: daysAgo(66), invoiceTotal: 42565, paidAmount: 42565 },
      ],
      totalAmount: 56415,
      paymentDate: daysAgo(60),
      paymentMode: 'neft',
      referenceNumber: 'NEFT-MAR-2026-001',
      bankName: 'SBI Amalner',
      status: 'approved',
      approvedBy: adminUser._id,
      approvedAt: daysAgo(59),
      notes: 'March consolidated payment — Shri Ganesh Kirana Store',
      createdBy: adminUser._id,
    },
    // Flower Mart — approved, March (cash)
    // FL-MAR06: FLWR-MRG(3120)+FLWR-RSP(2175)+FLWR-LTS(1000)+LEAF-BAN(600) = 6895
    // FL-HOLI: FLWR-MRG(5100) | FL-MAR17: FLWR-MRG(2800) | FL-MAR28: FLWR-MRG(3280)
    {
      supplier: flowerMart._id,
      invoices: [
        { invoiceNumber: 'FL-MAR06',  invoiceDate: daysAgo(88), invoiceTotal: 6895,  paidAmount: 6895 },
        { invoiceNumber: 'FL-HOLI',   invoiceDate: daysAgo(81), invoiceTotal: 5100,  paidAmount: 5100 },
        { invoiceNumber: 'FL-MAR17',  invoiceDate: daysAgo(77), invoiceTotal: 2800,  paidAmount: 2800 },
        { invoiceNumber: 'FL-MAR28',  invoiceDate: daysAgo(66), invoiceTotal: 3280,  paidAmount: 3280 },
      ],
      totalAmount: 18075,
      paymentDate: daysAgo(58),
      paymentMode: 'cash',
      status: 'approved',
      approvedBy: adminUser._id,
      approvedAt: daysAgo(57),
      notes: 'March flower purchases — Pushpa Flower Mart',
      createdBy: adminUser._id,
    },
    // Dairy — approved, April (UPI)
    // MLK-MAR28: MILK-COW(4340)+DAHI(1400)+PNEER(2560) = 8300
    // MLK-RAMNAV: MILK-COW(4960)+DAHI(1750) = 6710
    // MLK-HANUMAN: MILK-COW(3410)+DAHI(1260) = 4670
    {
      supplier: dairy._id,
      invoices: [
        { invoiceNumber: 'MLK-MAR28',  invoiceDate: daysAgo(66), invoiceTotal: 8300,  paidAmount: 8300 },
        { invoiceNumber: 'MLK-RAMNAV', invoiceDate: daysAgo(58), invoiceTotal: 6710,  paidAmount: 6710 },
        { invoiceNumber: 'MLK-HANUMAN',invoiceDate: daysAgo(52), invoiceTotal: 4670,  paidAmount: 4670 },
      ],
      totalAmount: 19680,
      paymentDate: daysAgo(35),
      paymentMode: 'upi',
      referenceNumber: 'UPI-DAIRY-APR2026',
      status: 'approved',
      approvedBy: adminUser._id,
      approvedAt: daysAgo(34),
      notes: 'April dairy payment — Amalner Dairy Farm',
      createdBy: adminUser._id,
    },
    // Kirana — approved, May consolidated (NEFT)
    // INV-GK-MAY01: RICE-BAS(10080)+ATTA-WHT(2220)+SUGR(2820)+RCHIL(1275)+CORIAND(1025) = 17420
    // INV-GK-MAY23: RICE-BAS(8400)+TOOR-DAL(3660) = 12060
    {
      supplier: kirana._id,
      invoices: [
        { invoiceNumber: 'INV-GK-MAY01', invoiceDate: daysAgo(32), invoiceTotal: 17420, paidAmount: 17420 },
        { invoiceNumber: 'INV-GK-MAY23', invoiceDate: daysAgo(10), invoiceTotal: 12060, paidAmount: 12060 },
      ],
      totalAmount: 29480,
      paymentDate: daysAgo(5),
      paymentMode: 'neft',
      referenceNumber: 'NEFT-MAY-2026-002',
      bankName: 'SBI Amalner',
      status: 'approved',
      approvedBy: adminUser._id,
      approvedAt: daysAgo(4),
      notes: 'May payment — Shri Ganesh Kirana Store',
      createdBy: adminUser._id,
    },
    // Amul — pending approval
    // AMUL-MAY01: PANCHMRT(2700)+SHAHAD(1830) = 4530
    // AMUL-MAY23: PANCHMRT(2200)+SHAHAD(1845) = 4045
    {
      supplier: amul._id,
      invoices: [
        { invoiceNumber: 'AMUL-MAY01', invoiceDate: daysAgo(32), invoiceTotal: 4530, paidAmount: 4530 },
        { invoiceNumber: 'AMUL-MAY23', invoiceDate: daysAgo(10), invoiceTotal: 4045, paidAmount: 4045 },
      ],
      totalAmount: 8575,
      paymentDate: daysAgo(3),
      paymentMode: 'neft',
      referenceNumber: 'NEFT-AMUL-MAY2026',
      bankName: 'HDFC Amalner',
      status: 'pending_approval',
      notes: 'May payment — Amul Distributor Amalner',
      createdBy: adminUser._id,
    },
    // Dry Fruits — rejected (invoice dispute)
    // DRY-APR05: DRYFRT(10×820) = 8200
    {
      supplier: dryFruits._id,
      invoices: [
        { invoiceNumber: 'DRY-APR05', invoiceDate: daysAgo(58), invoiceTotal: 8200, paidAmount: 8200 },
      ],
      totalAmount: 8200,
      paymentDate: daysAgo(12),
      paymentMode: 'cheque',
      referenceNumber: 'CHQ-0089',
      bankName: 'Bank of Baroda',
      status: 'rejected',
      rejectionReason: 'Invoice not verified — please resubmit with GST invoice copy',
      notes: 'April dry fruits payment — Shri Ganpati Dry Fruits',
      createdBy: adminUser._id,
    },
    // Flower Mart — April+May, pending approval (for trustees to approve)
    // FL-RAMNAV: FLWR-MRG(70×90)+FLWR-LTS(300×5)+LEAF-BAN(200×3) = 6300+1500+600 = 8400
    // FL-HANUMAN: FLWR-MRG(45×85) = 3825
    // FL-MAY15: FLWR-MRG(35×88)+FLWR-LTS(200×5) = 3080+1000 = 4080
    {
      supplier: flowerMart._id,
      invoices: [
        { invoiceNumber: 'FL-RAMNAV',  invoiceDate: daysAgo(58), invoiceTotal: 8400, paidAmount: 8400 },
        { invoiceNumber: 'FL-HANUMAN', invoiceDate: daysAgo(52), invoiceTotal: 3825, paidAmount: 3825 },
        { invoiceNumber: 'FL-MAY15',   invoiceDate: daysAgo(18), invoiceTotal: 4080, paidAmount: 4080 },
      ],
      totalAmount: 16305,
      paymentDate: daysAgo(3),
      paymentMode: 'cash',
      status: 'pending_approval',
      notes: 'April–May flower purchases — Pushpa Flower Mart (pending trustee approval)',
      createdBy: adminUser._id,
    },
    // Dairy — April+May, pending approval
    // MLK-APR18: MILK-COW(65×62)+DAHI(20×70) = 4030+1400 = 5430
    // MLK-MAY01: MILK-COW(70×64)+DAHI(20×72) = 4480+1440 = 5920
    // MLK-MAY15: MILK-COW(55×64)+DAHI(15×72)+PNEER(5×325) = 3520+1080+1625 = 6225
    {
      supplier: dairy._id,
      invoices: [
        { invoiceNumber: 'MLK-APR18', invoiceDate: daysAgo(45), invoiceTotal: 5430, paidAmount: 5430 },
        { invoiceNumber: 'MLK-MAY01', invoiceDate: daysAgo(32), invoiceTotal: 5920, paidAmount: 5920 },
        { invoiceNumber: 'MLK-MAY15', invoiceDate: daysAgo(18), invoiceTotal: 6225, paidAmount: 6225 },
      ],
      totalAmount: 17575,
      paymentDate: daysAgo(1),
      paymentMode: 'upi',
      referenceNumber: 'UPI-DAIRY-JUN2026',
      status: 'pending_approval',
      notes: 'April–May dairy payment — Amalner Dairy Farm (pending trustee approval)',
      createdBy: adminUser._id,
    },
  ];

  for (const p of paymentsData) {
    p.paymentNumber = await generatePaymentNumber(p.paymentDate);
    await SupplierPayment.create(p);
  }
  console.log(`  ✓ ${paymentsData.length} supplier payments`);

  // ─── Done ─────────────────────────────────────────────────────────────────

  const txnCount = await StockTransaction.countDocuments();
  const donCount = await Donation.countDocuments();
  const payCount = await SupplierPayment.countDocuments();
  console.log(`\n✅  Test data seeded successfully!`);
  console.log(`   Products          : ${productDefs.length} (Dal Bati Churma, Panchamrut & more)`);
  console.log(`   Suppliers         : 6 vendors (with bank accounts)`);
  console.log(`   Donors            : 3 individual + 1 charitable trust`);
  console.log(`   Users             : 9 (super admin + manager + 2 trustees + 3 staff + viewer)`);
  console.log(`   Stock Transactions: ${txnCount} total (3 months: March–June 2026)`);
  console.log(`   Donations         : ${donCount} (named/hundi/anonymous across 3 months)`);
  console.log(`   Supplier Payments : ${payCount} (approved, pending, rejected)`);
  console.log(`   Key Events        : Holi, Ram Navami, Hanuman Jayanti, Akshaya Tritiya\n`);
  console.log('Login Credentials:');
  console.log('   Super Admin   : admin@mandir.com     / Admin@1234');
  console.log('   Store Manager : manager@mandir.com   / Manager@123  [can approve payments]');
  console.log('   Trustee 1     : trustee1@mandir.com  / Trustee@123  [can approve payments]');
  console.log('   Trustee 2     : trustee2@mandir.com  / Trustee@456  [can approve payments]');
  console.log('   Kitchen Staff : kitchen@mandir.com   / Kitchen@123');
  console.log('   Puja Staff    : puja@mandir.com      / Puja@1234');
  console.log('   Staff 1       : staff1@mandir.com    / Staff@1234');
  console.log('   Staff 2       : staff2@mandir.com    / Staff@5678');
  console.log('   Staff 3       : staff3@mandir.com    / Staff@9012');
  console.log('   Viewer        : viewer@mandir.com    / Viewer@123\n');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('❌  Test seed failed:', err.message);
  process.exit(1);
});
