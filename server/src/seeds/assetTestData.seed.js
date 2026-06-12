/**
 * Asset Test Data Seed — Mangal Grah Mandir
 * Creates assets (with codes + units) + transactions in all statuses for UI testing.
 *
 * Run AFTER index.js seed:
 *   npm run seed           (base data)
 *   npm run seed:assets    (this script)
 *
 * Safe to re-run — clears asset collections before inserting.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Asset from '../models/Asset.js';
import AssetUnit from '../models/AssetUnit.js';
import AssetTransaction from '../models/AssetTransaction.js';
import BorrowGroup from '../models/BorrowGroup.js';
import { generateAssetTransactionNumber } from '../services/assetTransactionNumber.service.js';

const daysAgo     = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(18, 0, 0, 0); return d; };
const date        = (y, m, d) => new Date(y, m - 1, d);

// ── Inline helpers (avoid importing controller) ───────────────────────────────
let _assetSeq = 0;
async function initAssetSeq() {
  const last = await Asset.findOne(
    { assetCode: { $exists: true, $ne: null } },
    { assetCode: 1 },
    { sort: { assetCode: -1 } }
  ).lean();
  _assetSeq = last?.assetCode ? parseInt(last.assetCode.split('-').pop(), 10) : 0;
}
function nextAssetCode() {
  _assetSeq += 1;
  return `MGM-AST-${String(_assetSeq).padStart(3, '0')}`;
}

async function createUnits(asset) {
  const total = asset.totalQuantity;
  const pad   = total > 99 ? 3 : 2;
  const docs  = [];
  for (let i = 1; i <= total; i++) {
    docs.push({ asset: asset._id, unitCode: `${asset.assetCode}-${String(i).padStart(pad, '0')}`, unitNumber: i });
  }
  if (docs.length) await AssetUnit.insertMany(docs, { ordered: false });
}

// ─── Asset master data ───────────────────────────────────────────────────────
const ASSETS = [
  { name: 'PA Speaker System',     category: 'Electronics', totalQuantity: 2,   finePerDay: 100, purchaseDate: date(2021, 3, 10), description: '500W portable PA with mic stand' },
  { name: 'Wireless Microphone',   category: 'Electronics', totalQuantity: 4,   finePerDay: 50,  purchaseDate: date(2022, 7, 5),  description: 'UHF handheld mics' },
  { name: 'Generator (5 KVA)',     category: 'Electronics', totalQuantity: 1,   finePerDay: 200, purchaseDate: date(2019, 11, 20),description: 'Petrol generator for outdoor events' },
  { name: 'LED Projector',         category: 'Electronics', totalQuantity: 1,   finePerDay: 150, purchaseDate: date(2023, 1, 15), description: '3000 lumen HDMI projector' },
  { name: 'Mandap Set (Full)',      category: 'Mandap',      totalQuantity: 1,   finePerDay: 500, purchaseDate: date(2018, 6, 1),  description: 'Complete mandap with pillars and canopy' },
  { name: 'Mandap Pillars (Set)',   category: 'Mandap',      totalQuantity: 4,   finePerDay: 100, purchaseDate: date(2018, 6, 1),  description: 'Decorative brass-finish pillars' },
  { name: 'Steel Plates',          category: 'Utensils',    totalQuantity: 100, finePerDay: 0,   purchaseDate: date(2020, 2, 14), description: 'Stainless steel dinner plates' },
  { name: 'Steel Bowls (Katori)',  category: 'Utensils',    totalQuantity: 200, finePerDay: 0,   purchaseDate: date(2020, 2, 14), description: 'Small serving bowls' },
  { name: 'Steel Glasses',         category: 'Utensils',    totalQuantity: 150, finePerDay: 0,   purchaseDate: date(2020, 2, 14), description: '250ml steel tumblers' },
  { name: 'Large Cooking Vessel',  category: 'Utensils',    totalQuantity: 6,   finePerDay: 20,  purchaseDate: date(2021, 9, 8),  description: '50-litre aluminium degchi' },
  { name: 'Gas Stove (Double)',     category: 'Utensils',    totalQuantity: 3,   finePerDay: 30,  purchaseDate: date(2022, 4, 22), description: 'Double-burner LPG stove' },
  { name: 'Folding Chairs',        category: 'Furniture',   totalQuantity: 50,  finePerDay: 5,   purchaseDate: date(2020, 8, 3),  description: 'Plastic folding chairs' },
  { name: 'Folding Tables',        category: 'Furniture',   totalQuantity: 20,  finePerDay: 10,  purchaseDate: date(2020, 8, 3),  description: '6-foot rectangular tables' },
  { name: 'Carpet / Dari',         category: 'Decoration',  totalQuantity: 8,   finePerDay: 20,  purchaseDate: date(2021, 12, 1), description: '6x4 ft cotton dari' },
  { name: 'Tabla Set',             category: 'Electronics', totalQuantity: 1,   finePerDay: 100, purchaseDate: date(2017, 5, 18), description: 'Tabla with bayan for bhajans' },
  { name: 'Harmonium',             category: 'Electronics', totalQuantity: 1,   finePerDay: 75,  purchaseDate: date(2017, 5, 18), description: 'Portable harmonium' },
  { name: 'LED Decoration Lights', category: 'Decoration',  totalQuantity: 10,  finePerDay: 15,  purchaseDate: date(2023, 10, 5), description: '10m LED string lights' },
  { name: 'Tarpaulin / Shamiyana', category: 'Furniture',   totalQuantity: 3,   finePerDay: 50,  purchaseDate: date(2019, 4, 30), description: '20x30 ft waterproof canopy' },
];

// ─── Staff users to seed as borrowers ────────────────────────────────────────
const STAFF_USERS = [
  { name: 'Ramesh Patil',   email: 'ramesh@mandir.com',  role: 'staff' },
  { name: 'Suresh Jadhav',  email: 'suresh@mandir.com',  role: 'staff' },
  { name: 'Priya Deshmukh', email: 'priya@mandir.com',   role: 'staff' },
  { name: 'Anil Shinde',    email: 'anil@mandir.com',    role: 'store_manager' },
];

async function seedAssetData() {
  await connectDB();
  console.log('\n[AssetSeed] Starting...\n');

  // ── Clear previous asset test data ─────────────────────────────────────────
  await BorrowGroup.deleteMany({});
  await AssetTransaction.deleteMany({});
  await AssetUnit.deleteMany({});
  await Asset.deleteMany({});
  console.log('  Cleared BorrowGroup, AssetTransaction, AssetUnit, Asset collections');

  await initAssetSeq();  // start codes from 0 since we cleared everything

  // ── Ensure staff users exist ────────────────────────────────────────────────
  const borrowers = [];
  for (const u of STAFF_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      borrowers.push(existing);
    } else {
      const created = await User.create({
        ...u, password: 'Test@1234',
        phone: `91900000000${borrowers.length + 1}`, isActive: true,
      });
      borrowers.push(created);
      console.log(`  Created user: ${u.name}`);
    }
  }

  // ── Mark admin as approver ──────────────────────────────────────────────────
  const admin = await User.findOne({ role: 'super_admin' });
  if (admin) {
    await User.updateOne({ _id: admin._id }, { $set: { canApproveAssets: true } });
    console.log(`  Marked "${admin.name}" as asset approver`);
  }
  const storeManager = borrowers.find((u) => u.role === 'store_manager');
  if (storeManager) {
    await User.updateOne({ _id: storeManager._id }, { $set: { canApproveAssets: true } });
    console.log(`  Marked "${storeManager.name}" as asset approver`);
  }

  const approver     = admin || borrowers[0];
  const approver2    = storeManager || approver;
  const helpDeskUser = admin;

  // ── Create assets with codes + units ───────────────────────────────────────
  const createdAssets = [];
  let totalUnits = 0;
  for (const a of ASSETS) {
    const assetCode = nextAssetCode();
    const asset = await Asset.create({ ...a, assetCode, createdBy: helpDeskUser._id });
    await createUnits(asset);
    totalUnits += asset.totalQuantity;
    createdAssets.push(asset);
  }
  console.log(`  Created ${createdAssets.length} assets with codes MGM-AST-001 – MGM-AST-${String(createdAssets.length).padStart(3,'0')}`);
  console.log(`  Generated ${totalUnits} asset units`);

  // Quick lookup by name
  const asset = (name) => createdAssets.find((a) => a.name === name);

  // ── Transactions ─────────────────────────────────────────────────────────────
  const txns = [];

  // 1. APPROVED — Steel Plates
  txns.push({
    asset: asset('Steel Plates')._id, borrower: borrowers[0]._id, quantityBorrowed: 50,
    expectedReturnDate: daysFromNow(5), approvedBy: approver._id, approvedAt: daysAgo(1),
    status: 'approved', notes: 'For Pooja lunch — 50 guests', createdBy: helpDeskUser._id,
  });

  // 2. APPROVED — Wireless Microphone
  txns.push({
    asset: asset('Wireless Microphone')._id, borrower: borrowers[1]._id, quantityBorrowed: 2,
    expectedReturnDate: daysFromNow(3), approvedBy: approver2._id, approvedAt: daysAgo(0),
    status: 'approved', notes: 'Pravachan program on Sunday', createdBy: helpDeskUser._id,
  });

  // 3. CHECKED OUT — PA Speaker System (due in 2 days)
  txns.push({
    asset: asset('PA Speaker System')._id, borrower: borrowers[0]._id, quantityBorrowed: 1,
    expectedReturnDate: daysFromNow(2), approvedBy: approver._id, approvedAt: daysAgo(3),
    checkedOutAt: daysAgo(2), status: 'checked_out', conditionAtCheckout: 'good',
    remindersSent: [], createdBy: helpDeskUser._id,
  });

  // 4. CHECKED OUT — Folding Chairs (due tomorrow)
  txns.push({
    asset: asset('Folding Chairs')._id, borrower: borrowers[2]._id, quantityBorrowed: 20,
    expectedReturnDate: daysFromNow(1), approvedBy: approver._id, approvedAt: daysAgo(4),
    checkedOutAt: daysAgo(3), status: 'checked_out', conditionAtCheckout: 'good',
    createdBy: helpDeskUser._id,
  });

  // 5. CHECKED OUT — Mandap Set (due in 7 days)
  txns.push({
    asset: asset('Mandap Set (Full)')._id, borrower: borrowers[1]._id, quantityBorrowed: 1,
    expectedReturnDate: daysFromNow(7), approvedBy: approver2._id, approvedAt: daysAgo(1),
    checkedOutAt: daysAgo(0), status: 'checked_out', conditionAtCheckout: 'good',
    notes: 'Wedding ceremony at staff member home', createdBy: helpDeskUser._id,
  });

  // 6. OVERDUE — Generator (3 days overdue)
  txns.push({
    asset: asset('Generator (5 KVA)')._id, borrower: borrowers[2]._id, quantityBorrowed: 1,
    expectedReturnDate: daysAgo(3), approvedBy: approver._id, approvedAt: daysAgo(8),
    checkedOutAt: daysAgo(7), status: 'overdue', conditionAtCheckout: 'good',
    remindersSent: [
      { reminderType: 'due_tomorrow', sentAt: daysAgo(4) },
      { reminderType: 'due_today',    sentAt: daysAgo(3) },
      { reminderType: 'overdue',      sentAt: daysAgo(1) },
    ],
    createdBy: helpDeskUser._id,
  });

  // 7. OVERDUE — LED Projector (1 day overdue)
  txns.push({
    asset: asset('LED Projector')._id, borrower: borrowers[0]._id, quantityBorrowed: 1,
    expectedReturnDate: daysAgo(1), approvedBy: approver._id, approvedAt: daysAgo(6),
    checkedOutAt: daysAgo(5), status: 'overdue', conditionAtCheckout: 'fair',
    remindersSent: [
      { reminderType: 'due_tomorrow', sentAt: daysAgo(2) },
      { reminderType: 'due_today',    sentAt: daysAgo(1) },
    ],
    createdBy: helpDeskUser._id,
  });

  // 8. RETURNED — Steel Bowls (on time, no fine)
  txns.push({
    asset: asset('Steel Bowls (Katori)')._id, borrower: borrowers[1]._id, quantityBorrowed: 100,
    expectedReturnDate: daysAgo(5), actualReturnDate: daysAgo(5),
    approvedBy: approver._id, approvedAt: daysAgo(12), checkedOutAt: daysAgo(11),
    status: 'returned', conditionAtCheckout: 'good', conditionAtReturn: 'good',
    lateDays: 0, fineApplied: false, createdBy: helpDeskUser._id,
  });

  // 9. RETURNED — Tabla Set (returned late, fine applied)
  txns.push({
    asset: asset('Tabla Set')._id, borrower: borrowers[2]._id, quantityBorrowed: 1,
    expectedReturnDate: daysAgo(10), actualReturnDate: daysAgo(7),
    approvedBy: approver2._id, approvedAt: daysAgo(18), checkedOutAt: daysAgo(17),
    status: 'returned', conditionAtCheckout: 'good', conditionAtReturn: 'fair',
    lateDays: 3, fineApplied: true, fineAmount: 300,
    remindersSent: [
      { reminderType: 'due_tomorrow', sentAt: daysAgo(11) },
      { reminderType: 'due_today',    sentAt: daysAgo(10) },
      { reminderType: 'overdue',      sentAt: daysAgo(8) },
    ],
    createdBy: helpDeskUser._id,
  });

  // 10. RETURNED — Harmonium (fine waived)
  txns.push({
    asset: asset('Harmonium')._id, borrower: borrowers[0]._id, quantityBorrowed: 1,
    expectedReturnDate: daysAgo(15), actualReturnDate: daysAgo(13),
    approvedBy: approver._id, approvedAt: daysAgo(20), checkedOutAt: daysAgo(19),
    status: 'returned', conditionAtCheckout: 'good', conditionAtReturn: 'good',
    lateDays: 2, fineApplied: false, fineWaived: true,
    fineWaivedReason: 'Trustee discretion — returned by Sunday as promised',
    createdBy: helpDeskUser._id,
  });

  // 11. RETURNED — Carpet (returned damaged, fine applied)
  txns.push({
    asset: asset('Carpet / Dari')._id, borrower: borrowers[1]._id, quantityBorrowed: 3,
    expectedReturnDate: daysAgo(20), actualReturnDate: daysAgo(18),
    approvedBy: approver._id, approvedAt: daysAgo(28), checkedOutAt: daysAgo(27),
    status: 'returned', conditionAtCheckout: 'good', conditionAtReturn: 'damaged',
    damageNotes: 'Two carpets have burn marks from diyas',
    lateDays: 2, fineApplied: true, fineAmount: 500, createdBy: helpDeskUser._id,
  });

  // 12. RETURNED — Folding Tables (with extension)
  txns.push({
    asset: asset('Folding Tables')._id, borrower: borrowers[2]._id, quantityBorrowed: 10,
    expectedReturnDate: daysAgo(2), actualReturnDate: daysAgo(2),
    approvedBy: approver2._id, approvedAt: daysAgo(14), checkedOutAt: daysAgo(13),
    status: 'returned', conditionAtCheckout: 'good', conditionAtReturn: 'good',
    lateDays: 0, fineApplied: false,
    extensions: [{
      previousReturnDate: daysAgo(7), newReturnDate: daysAgo(2),
      approvedBy: approver._id, approvedAt: daysAgo(8),
      extendedBy: helpDeskUser._id, notes: 'Event extended by 5 days',
    }],
    createdBy: helpDeskUser._id,
  });

  // 13. CANCELLED — LED Lights
  txns.push({
    asset: asset('LED Decoration Lights')._id, borrower: borrowers[0]._id, quantityBorrowed: 5,
    expectedReturnDate: daysFromNow(2), approvedBy: approver._id, approvedAt: daysAgo(1),
    status: 'cancelled', cancellationReason: 'Event postponed due to rain',
    createdBy: helpDeskUser._id,
  });

  // ── Insert all transactions with generated numbers ──────────────────────────
  for (const txnData of txns) {
    const txnNumber = await generateAssetTransactionNumber();
    await AssetTransaction.create({ ...txnData, transactionNumber: txnNumber });
  }

  console.log(`  Created ${txns.length} asset transactions`);
  console.log('\n  Status breakdown:');
  console.log('    approved     : 2');
  console.log('    checked_out  : 3');
  console.log('    overdue      : 2');
  console.log('    returned     : 5 (1 with extension, 2 with fine, 1 waived, 1 damaged)');
  console.log('    cancelled    : 1');
  console.log('\n[AssetSeed] Done!\n');

  await mongoose.disconnect();
}

seedAssetData().catch((err) => {
  console.error('[AssetSeed] Failed:', err);
  process.exit(1);
});
