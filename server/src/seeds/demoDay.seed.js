/**
 * Demo data for showing the app: a busy day at the temple today, plus lighter activity over the
 * last 30 days so the dashboard, registers and reports have something to show.
 *
 * It uses the real setup (seva types, batches, products, suppliers, departments, occasions,
 * settings) and only adds setup where there is none yet (a few products, suppliers or lendable
 * items). Covered: pooja bookings (with postal sevas, hall check-in and closed counter shifts),
 * Mahaprasad coupons (with payments, redemptions and today's cash drawer), donations (named,
 * hundi, anonymous, 80G, in-kind into stock), stock (purchases, transfers, use, wastage, low
 * stock, expiring batches), supplier payments, expenses and budgets, asset lending, and — through
 * attendanceDemo.seed.js — staff attendance.
 *
 * Every record it adds is listed in the `demo_records` collection, so removal is exact: the
 * records, the stock they moved, the seats they took and the numbers they used (receipt, coupon,
 * donation, purchase… numbering carries on from the real records again). Records are written
 * straight to the database, so no WhatsApp, SMS or push message goes out for them.
 *
 *   npm run seed:demo                       add (refuses if demo data is already there)
 *   npm run seed:demo -- --fresh            remove the previous demo data, then add
 *   npm run seed:demo:remove                remove all demo data
 *   add  -- --no-attendance                 leave out the attendance demo
 *
 * Anything typed in by hand while showing the app (a booking made during the demo) is a real
 * record and stays.
 */

import 'dotenv/config';
import '../config/timezone.js';
import crypto from 'crypto';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Asset from '../models/Asset.js';
import AssetTransaction from '../models/AssetTransaction.js';
import AssetUnit from '../models/AssetUnit.js';
import AuditLog from '../models/AuditLog.js';
import Booking from '../models/Booking.js';
import BookingBatch from '../models/BookingBatch.js';
import BookingClosure from '../models/BookingClosure.js';
import BookingSettings from '../models/BookingSettings.js';
import BookingShift from '../models/BookingShift.js';
import BorrowGroup from '../models/BorrowGroup.js';
import Category from '../models/Category.js';
import DailyCounter from '../models/DailyCounter.js';
import Department from '../models/Department.js';
import Donation from '../models/Donation.js';
import DonationOccasion from '../models/DonationOccasion.js';
import Expense from '../models/Expense.js';
import ExpenseBudget from '../models/ExpenseBudget.js';
import MahaprasadCashDrawer from '../models/MahaprasadCashDrawer.js';
import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import MahaprasadOccasion from '../models/MahaprasadOccasion.js';
import MahaprasadPayment from '../models/MahaprasadPayment.js';
import Product from '../models/Product.js';
import PurchaseEntry from '../models/PurchaseEntry.js';
import Role from '../models/Role.js';
import Sequence from '../models/Sequence.js';
import Settings from '../models/Settings.js';
import SevaType from '../models/SevaType.js';
import SlotCounter from '../models/SlotCounter.js';
import StockBalance from '../models/StockBalance.js';
import StockBatch from '../models/StockBatch.js';
import StockTransaction from '../models/StockTransaction.js';
import Supplier from '../models/Supplier.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Unit from '../models/Unit.js';
import User from '../models/User.js';
import { generateUnitsForRange } from '../controllers/assetUnit.controller.js';
import { consumeBatches } from '../services/fifo.service.js';
import { getBalance, recomputeBalance } from '../services/stockBalance.service.js';
import { dayKey, nextNumber } from '../services/sequence.service.js';
import {
  addDays, batchesFor, dateKeyOf, dateKeyToDate, financialYear, formatReceiptNo, labelTimes, seatsFor, slotKey, weekdayOf,
} from '../services/booking/rules.js';
import { generateProductCode } from '../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const REMOVE = ARGS.includes('--remove');
const FRESH = ARGS.includes('--fresh');
const WITH_ATTENDANCE = !ARGS.includes('--no-attendance');

const records = () => mongoose.connection.collection('demo_records');

// ── Randomness (repeatable for a given day) and time ───────────────────────────
const NOW = new Date();
const TODAY = dateKeyOf(NOW);
let state = Number(TODAY.replace(/-/g, ''));
const rand = () => {
  state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
};
const round2 = (n) => Math.round(n * 100) / 100;
// Counted items (pieces, packets, boxes…) move in whole numbers; kg and litres to one decimal
const isWhole = (p) => !['kg', 'L', 'g', 'ml'].includes(p.unit?.symbol);
const roundQty = (p, q) => (isWhole(p) ? Math.floor(q + 1e-9) : Math.floor(q * 10 + 1e-9) / 10);

const hm = (h, m = 0) => h * 60 + m;
const NOW_MIN = NOW.getHours() * 60 + NOW.getMinutes();
const at = (key, minutes) => { const d = dateKeyToDate(key); d.setMinutes(minutes); return d; };
// A time on that day between two clock times — today never later than a couple of minutes ago
function timeOn(key, from, to) {
  const hi = key === TODAY ? Math.min(to, NOW_MIN - 2) : to;
  return hi < from ? null : at(key, int(from, hi));
}
const DAYS = Array.from({ length: 31 }, (_, i) => addDays(TODAY, i - 30));   // 30 days ago … today
const isTuesday = (key) => weekdayOf(key) === 2;   // Mangal Grah temple: Tuesday is the big day
const busy = (key) => (isTuesday(key) ? 2.5 : weekdayOf(key) === 0 ? 1.5 : 1);
const daysAgo = (n) => addDays(TODAY, -n);
const ymd = (key) => key.replace(/-/g, '');

// ── People and places ────────────────────────────────────────────────────────
const FIRST_M = ['Ramesh', 'Suresh', 'Mahesh', 'Ganesh', 'Dinesh', 'Prakash', 'Anil', 'Sunil', 'Vijay', 'Sanjay', 'Rajendra', 'Dilip', 'Nitin', 'Sachin', 'Rahul', 'Amol', 'Yogesh', 'Sandip', 'Kiran', 'Vinod', 'Manoj', 'Pravin', 'Hemant', 'Ashok', 'Dnyaneshwar', 'Bhushan', 'Tushar', 'Mangesh', 'Avinash', 'Shrikant'];
const FIRST_F = ['Sunita', 'Anita', 'Kavita', 'Savita', 'Meena', 'Rekha', 'Jyoti', 'Manisha', 'Sangita', 'Vaishali', 'Pooja', 'Priyanka', 'Shubhangi', 'Ashwini', 'Swati', 'Archana', 'Bharati', 'Lata', 'Mangala', 'Ujwala'];
const LAST = ['Patil', 'Deshmukh', 'Joshi', 'Kulkarni', 'Pawar', 'Chaudhari', 'Mahajan', 'Wagh', 'Borse', 'Sonawane', 'Bhole', 'Shinde', 'Jadhav', 'More', 'Gaikwad', 'Thakur', 'Agrawal', 'Bhamare', 'Salunkhe', 'Deore', 'Mali', 'Badgujar', 'Khairnar', 'Nikam', 'Sapkale', 'Vaidya', 'Kale', 'Bari', 'Suryawanshi', 'Pardeshi'];
const PLACES = [
  { city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', pincode: '425401', areas: ['Amalner', 'Pimpale', 'Dhar', 'Mangrul'] },
  { city: 'Jalgaon', district: 'Jalgaon', state: 'Maharashtra', pincode: '425001', areas: ['Jalgaon'] },
  { city: 'Dhule', district: 'Dhule', state: 'Maharashtra', pincode: '424001', areas: ['Dhule'] },
  { city: 'Chopda', district: 'Jalgaon', state: 'Maharashtra', pincode: '425107', areas: ['Chopda'] },
  { city: 'Parola', district: 'Jalgaon', state: 'Maharashtra', pincode: '425111', areas: ['Parola'] },
  { city: 'Erandol', district: 'Jalgaon', state: 'Maharashtra', pincode: '425109', areas: ['Erandol'] },
  { city: 'Bhusawal', district: 'Jalgaon', state: 'Maharashtra', pincode: '425201', areas: ['Bhusawal'] },
  { city: 'Shirpur', district: 'Dhule', state: 'Maharashtra', pincode: '425405', areas: ['Shirpur'] },
  { city: 'Nashik', district: 'Nashik', state: 'Maharashtra', pincode: '422001', areas: ['Nashik'] },
  { city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411030', areas: ['Sadashiv Peth'] },
  { city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400067', areas: ['Kandivali West'] },
  { city: 'Indore', district: 'Indore', state: 'Madhya Pradesh', pincode: '452001', areas: ['Indore'] },
  { city: 'Surat', district: 'Surat', state: 'Gujarat', pincode: '395003', areas: ['Surat'] },
];
const STREETS = ['Station Road', 'Main Road', 'Ganesh Colony', 'Shivaji Nagar', 'Gandhi Chowk', 'Tilak Road', 'Sane Guruji Nagar', 'Market Yard', 'Datta Mandir Road', 'Bazar Peth', 'Vidya Vihar', 'Samarth Colony'];
const GOTRAS = ['Kashyap', 'Bharadwaj', 'Vashishtha', 'Atri', 'Gautam', 'Jamadagni', 'Vishwamitra', 'Agastya', 'Shandilya', 'Kaundinya'];
const RASHIS = ['Mesh', 'Vrishabh', 'Mithun', 'Kark', 'Sinha', 'Kanya', 'Tula', 'Vrishchik', 'Dhanu', 'Makar', 'Kumbh', 'Meen'];
const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Punarvasu', 'Pushya', 'Magha', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Mula', 'Shravana', 'Revati'];

const usedPhones = new Set();
const phone = () => {
  for (;;) {
    const p = `${pick(['9', '9', '8', '7'])}${int(100000000, 999999999)}`;
    if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
  }
};
const personName = () => `${chance(0.6) ? pick(FIRST_M) : pick(FIRST_F)} ${pick(LAST)}`;
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const pan = () => `${pick(LETTERS)}${pick(LETTERS)}${pick(LETTERS)}P${pick(LETTERS)}${int(1000, 9999)}${pick(LETTERS)}`;
const placeAddress = () => {
  const pl = weighted([[PLACES[0], 8], ...PLACES.slice(1).map((p) => [p, 1])]);
  return { address: `${int(1, 260)}, ${pick(STREETS)}`, pincode: pl.pincode, area: pick(pl.areas), city: pl.city, district: pl.district, state: pl.state };
};
// Devotees who come back: the counter finds them by mobile number
const REGULARS = Array.from({ length: 70 }, () => ({ name: personName(), phone: phone(), gotra: chance(0.7) ? pick(GOTRAS) : '', place: placeAddress() }));

// ── Bookkeeping: everything added is listed, so it can be removed exactly ──────
const prefixes = new Set();
const stockPairs = new Set();
const slotKeys = new Set();
const dailyCounters = [];
const summary = {};

async function track(model, docs) {
  const ids = [].concat(docs).filter(Boolean).map((d) => d._id);
  if (!ids.length) return;
  summary[model] = (summary[model] || 0) + ids.length;
  await records().updateOne({ _id: `ids:${model}` }, { $push: { ids: { $each: ids } } }, { upsert: true });
}
const number = (prefix, sources, width = 3) => { prefixes.add(prefix); return nextNumber({ prefix, width, sources }); };
const SRC = {
  txn: [{ model: StockTransaction, field: 'transactionNumber' }],
  purchase: [{ model: PurchaseEntry, field: 'entryNumber' }],
  payment: [{ model: SupplierPayment, field: 'paymentNumber' }],
  expense: [{ model: Expense, field: 'expenseNumber' }],
  donation: [{ model: Donation, field: 'donationNumber' }],
  asset: [{ model: Asset, field: 'assetCode' }],
  borrow: [
    { model: BorrowGroup, field: 'groupNumber' },
    { model: AssetTransaction, field: 'transactionNumber', filter: { transactionNumber: { $not: /\// } } },
  ],
};
const stamp = (date) => ({ createdAt: date, updatedAt: date });

// ── Staff who "did" the demo work (random passwords: nobody can sign in as them) ─
const STAFF = [
  { key: 'counter1', name: 'Sunita Patil', role: 'booking_counter' },
  { key: 'counter2', name: 'Rahul Deshmukh', role: 'booking_counter' },
  { key: 'hall', name: 'Dnyaneshwar Wagh', role: 'hall_checkin' },
  { key: 'prasad', name: 'Ganesh Mahajan', role: 'mahaprasad_counter' },
  { key: 'scanner', name: 'Vijay Sonawane', role: 'mahaprasad_redeem' },
  { key: 'desk', name: 'Meena Kulkarni', role: 'donation_desk' },
  { key: 'store', name: 'Prakash Bhole', role: 'store_manager' },
  { key: 'accounts', name: 'Anil Chaudhari', role: 'accountant' },
  { key: 'trustee', name: 'Madhukar Joshi', role: 'viewer', canApprovePayments: true, canApproveAssets: true },
];

async function createStaff() {
  const roles = new Set((await Role.find().select('slug').lean()).map((r) => r.slug));
  const out = {};
  for (const s of STAFF) {
    const [first, last] = s.name.toLowerCase().split(' ');
    const user = await User.create({
      name: s.name, email: `${first}.${last}@demo.mandir.local`, password: crypto.randomBytes(18).toString('base64url'),
      phone: `91${phone()}`, role: roles.has(s.role) ? s.role : 'viewer', departments: [], isActive: true,
      canApprovePayments: Boolean(s.canApprovePayments), canApproveAssets: Boolean(s.canApproveAssets),
    });
    out[s.key] = user;
  }
  await track('User', Object.values(out));
  return out;
}

// ── Setup that may be missing on a new installation ──────────────────────────
const STARTER_PRODUCTS = [
  // name, category code, unit, rate, min stock, reorder point, shelf life (days, 0 = keeps)
  ['Basmati Rice', 'GR', 'kg', 95, 50, 80, 0], ['Toor Dal', 'GR', 'kg', 140, 30, 50, 0],
  ['Wheat Flour (Atta)', 'GR', 'kg', 42, 50, 80, 0], ['Besan', 'GR', 'kg', 90, 15, 25, 0],
  ['Sugar', 'SP', 'kg', 44, 40, 60, 0], ['Pure Ghee', 'OG', 'kg', 620, 10, 15, 180],
  ['Groundnut Oil', 'OG', 'L', 180, 20, 30, 0], ['Milk', 'DP', 'L', 62, 20, 30, 2],
  ['Marigold Flowers', 'FL', 'kg', 80, 10, 15, 2], ['Dry Fruits Mix', 'SW', 'kg', 850, 5, 8, 90],
  ['Camphor', 'PJ', 'pkt', 45, 20, 40, 0], ['Agarbatti', 'PJ', 'box', 60, 20, 40, 0],
  ['Coconut', 'PJ', 'pcs', 30, 50, 100, 20], ['Kumkum', 'PJ', 'pkt', 20, 20, 40, 0],
  ['Cotton Wicks', 'PJ', 'pkt', 25, 30, 50, 0], ['Paper Plates (Patravali)', 'PM', 'pcs', 2, 500, 1000, 0],
];
const STARTER_SUPPLIERS = [
  { name: 'Shri Ganesh Kirana Stores', contactPerson: 'Ramesh Agrawal', city: 'Amalner', pincode: '425401', creditDays: 15 },
  { name: 'Mahalaxmi Traders', contactPerson: 'Sanjay Bhamare', city: 'Jalgaon', pincode: '425001', creditDays: 30 },
  { name: 'Om Puja Bhandar', contactPerson: 'Nitin Vaidya', city: 'Amalner', pincode: '425401', creditDays: 7 },
  { name: 'Gokul Dairy & Flowers', contactPerson: 'Kiran Mali', city: 'Amalner', pincode: '425401', creditDays: 7 },
];
const STARTER_ASSETS = [
  ['Speaker System', 'Electronics', 2, 200], ['Plastic Chairs', 'Furniture', 100, 5], ['Brass Handa (large)', 'Vessels', 6, 50],
  ['Mandap Cloth Set', 'Mandap', 3, 100], ['Steel Utensil Set', 'Utensils', 10, 20], ['Generator (5 kVA)', 'Electronics', 1, 500],
];

async function ensureSetup() {
  const extra = {};
  let products = await Product.find({ isActive: true }).populate('unit', 'symbol').populate('category', 'code').lean();
  if (products.length < 8) {
    const cats = Object.fromEntries((await Category.find().lean()).map((c) => [c.code, c._id]));
    const units = Object.fromEntries((await Unit.find().lean()).map((u) => [u.symbol, u._id]));
    const names = new Set(products.map((p) => p.name.toLowerCase()));
    const made = [];
    for (const [name, cat, unit, rate, min, reorder, shelf] of STARTER_PRODUCTS) {
      if (names.has(name.toLowerCase()) || !units[unit] || !(cats[cat] || Object.values(cats)[0])) continue;
      made.push(await Product.create({
        name, code: await generateProductCode(), category: cats[cat] || Object.values(cats)[0], unit: units[unit],
        standardRate: rate, minStockLevel: min, reorderPoint: reorder, isPerishable: shelf > 0, shelfLifeDays: shelf || null,
        isPujaItem: cat === 'PJ',
      }));
    }
    await track('Product', made);
    extra.products = made.length;
    products = await Product.find({ isActive: true }).populate('unit', 'symbol').populate('category', 'code').lean();
  }
  let vendors = await Supplier.find({ isActive: true, type: { $in: ['vendor', 'both'] } }).lean();
  if (!vendors.length) {
    const made = [];
    for (const s of STARTER_SUPPLIERS) {
      made.push(await Supplier.create({
        ...s, type: 'vendor', phone: phone(), state: 'Maharashtra', district: 'Jalgaon', address: `${int(1, 90)}, ${pick(STREETS)}`,
        bankAccounts: [{ label: 'Current', bankName: pick(['State Bank of India', 'Bank of Maharashtra', 'Jalgaon Janata Sahakari Bank']), accountNumber: String(int(10000000, 99999999)) + int(100, 999), ifscCode: 'SBIN000' + int(1000, 9999), accountHolderName: s.name, isDefault: true }],
      }));
    }
    await track('Supplier', made);
    extra.suppliers = made.length;
    vendors = made.map((m) => m.toObject());
  }
  let assets = await Asset.find({ isActive: true, isBorrowable: true }).lean();
  if (!assets.length) {
    const made = [];
    for (const [name, category, qty, fine] of STARTER_ASSETS) {
      const a = await Asset.create({ name, category, totalQuantity: qty, finePerDay: fine, assetCode: await number('MGM-AST-', SRC.asset), purchaseDate: dateKeyToDate(daysAgo(400)) });
      await generateUnitsForRange(a, 1, qty);
      made.push(a);
    }
    await track('Asset', made);
    await track('AssetUnit', await AssetUnit.find({ asset: { $in: made.map((m) => m._id) } }).select('_id').lean());
    extra.assets = made.length;
    assets = made.map((m) => m.toObject());
  }
  return { products, vendors, assets, extra };
}

// ── Stock: purchases, transfers, use, wastage ───────────────────────────────────
function useProfile(p) {
  const sym = p.unit?.symbol || '';
  const rate = p.standardRate || 0;
  let daily;
  if (sym === 'kg') daily = rate > 400 ? int(1, 3) : int(4, 14);
  else if (sym === 'L') daily = int(2, 8);
  else if (sym === 'pcs') daily = rate < 5 ? int(150, 350) : int(10, 40);
  else if (sym === 'g' || sym === 'ml') daily = int(200, 800);
  else daily = int(2, 8);
  const shelf = p.shelfLifeDays || (p.isPerishable ? 7 : 0);
  return { daily, shelf, rate: rate > 0 ? rate : int(30, 400) };
}

async function stockIn({ product, dept, qty, rate, date, stockInType = 'PURCHASE', supplier, invoiceNumber, invoiceDate, dueDate, donorName, expiryDate, user }) {
  const txn = await StockTransaction.create({
    transactionNumber: await number(`TXN-${dayKey(date)}-`, SRC.txn),
    transactionType: 'STOCK_IN', transactionDate: date, product: product._id, toDepartment: dept._id,
    quantity: qty, unit: product.unit?._id || product.unit, rate, totalValue: round2(rate * qty),
    stockInType, supplier: supplier?._id, invoiceNumber, invoiceDate, dueDate, donorName,
    expiryDate: expiryDate || undefined, batchRef: stockInType === 'PURCHASE' ? `B${ymd(dateKeyOf(date)).slice(2)}${int(10, 99)}` : undefined,
    createdBy: user._id, ...stamp(date),
  });
  const batch = await StockBatch.create({
    product: product._id, department: dept._id, originalQty: qty, remainingQty: qty,
    expiryDate: expiryDate || null, batchRef: txn.batchRef || null, sourceTransaction: txn._id, ...stamp(date),
  });
  await track('StockTransaction', txn);
  await track('StockBatch', batch);
  stockPairs.add(`${product._id}:${dept._id}`);
  return txn;
}

// Stock-out, wastage or transfer: takes FIFO from the batches; quietly takes less if there isn't enough
async function stockMove({ type, product, from, to, qty, date, purpose, reason, issuedTo, user }) {
  const have = await getBalance(product._id, from._id);
  const take = roundQty(product, Math.min(qty, have));
  if (take <= 0) return null;
  let consumed;
  try { consumed = await consumeBatches(product._id, from._id, take); } catch { return null; }
  const rate = useProfile(product).rate;
  const txn = await StockTransaction.create({
    transactionNumber: await number(`TXN-${dayKey(date)}-`, SRC.txn),
    transactionType: type, transactionDate: date, product: product._id, fromDepartment: from._id, toDepartment: to?._id,
    quantity: take, unit: product.unit?._id || product.unit, rate, totalValue: round2(rate * take),
    stockOutPurpose: type === 'STOCK_OUT' ? purpose : undefined, issuedTo, wastageReason: type === 'WASTAGE' ? reason : undefined,
    consumedBatches: consumed, createdBy: user._id, ...stamp(date),
  });
  await track('StockTransaction', txn);
  stockPairs.add(`${product._id}:${from._id}`);
  if (type === 'TRANSFER') {
    const made = [];
    for (const c of consumed) {
      const src = await StockBatch.findById(c.batch).lean();
      made.push(await StockBatch.create({
        product: product._id, department: to._id, originalQty: c.qty, remainingQty: c.qty,
        expiryDate: src?.expiryDate || null, batchRef: src?.batchRef || null, sourceTransaction: txn._id, ...stamp(date),
      }));
    }
    await track('StockBatch', made);
    stockPairs.add(`${product._id}:${to._id}`);
  }
  return txn;
}

async function seedStock({ products, vendors, departments, staff }) {
  const store = departments.find((d) => d.type === 'store') || departments[0];
  const byType = (t) => departments.find((d) => d.type === t && d._id !== store._id);
  const kitchen = byType('kitchen'); const puja = byType('puja'); const flower = byType('flower');
  const deptFor = (p) => {
    const code = p.category?.code;
    if (code === 'FL') return flower || puja || store;
    if (code === 'PJ' || p.isPujaItem) return puja || store;
    if (['PM', 'CS'].includes(code)) return kitchen || store;
    return kitchen || store;
  };
  const profile = new Map(products.map((p) => [String(p._id), useProfile(p)]));
  const perishables = products.filter((p) => { const s = profile.get(String(p._id)).shelf; return s > 0 && s <= 7; });
  const keepers = products.filter((p) => !perishables.includes(p));
  // Each product comes from one supplier (dairy and flowers from the last one when there are several)
  const supplierOf = new Map(products.map((p, i) => {
    const code = p.category?.code;
    const v = ['DP', 'FL', 'VF'].includes(code) && vendors.length > 1 ? vendors[vendors.length - 1]
      : (code === 'PJ' || p.isPujaItem) && vendors.length > 2 ? vendors[2] : vendors[i % Math.min(vendors.length, 2)];
    return [String(p._id), v];
  }));
  const purchases = [];

  async function purchase(key, items, { expiringSoon, expired } = {}) {
    const groups = new Map();
    for (const it of items) {
      const v = supplierOf.get(String(it.product._id));
      if (!groups.has(String(v._id))) groups.set(String(v._id), { vendor: v, items: [] });
      groups.get(String(v._id)).items.push(it);
    }
    for (const { vendor, items: list } of groups.values()) {
      const date = timeOn(key, hm(9), hm(11, 30)) || timeOn(key, hm(6), hm(23, 59));
      if (!date) continue;
      const invoiceDate = dateKeyToDate(key);
      const dueDate = vendor.creditDays > 0 ? dateKeyToDate(addDays(key, vendor.creditDays)) : undefined;
      const invoiceNumber = `${vendor.name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase()}/${financialYear(date).slice(2)}/${int(1000, 9999)}`;
      const processed = [];
      for (const it of list) {
        const prof = profile.get(String(it.product._id));
        let expiryDate = prof.shelf ? dateKeyToDate(addDays(key, prof.shelf)) : undefined;
        if (expiringSoon && String(expiringSoon) === String(it.product._id)) expiryDate = dateKeyToDate(addDays(TODAY, 4));
        if (expired && String(expired) === String(it.product._id)) expiryDate = dateKeyToDate(addDays(TODAY, -1));
        const rate = round2(prof.rate * (0.95 + rand() * 0.1));
        const txn = await stockIn({ product: it.product, dept: store, qty: it.qty, rate, date, supplier: vendor, invoiceNumber, invoiceDate, dueDate, expiryDate, user: staff.store });
        processed.push({ product: it.product._id, quantity: it.qty, unit: it.product.unit?._id, rate, totalValue: round2(rate * it.qty), expiryDate, batchRef: txn.batchRef, stockTransactionId: txn._id });
      }
      const entry = await PurchaseEntry.create({
        entryNumber: await number(`PUR-${date.getFullYear()}-`, SRC.purchase),
        supplier: vendor._id, invoiceNumber, invoiceDate, dueDate, receivedDate: date, toDepartment: store._id,
        items: processed, totalValue: round2(processed.reduce((s, i) => s + i.totalValue, 0)), createdBy: staff.store._id, ...stamp(date),
      });
      await track('PurchaseEntry', entry);
      purchases.push({ entry: entry.toObject(), vendor, key });
    }
  }

  const qtyFor = (p, days) => {
    const prof = profile.get(String(p._id));
    const q = prof.daily * days * (0.9 + rand() * 0.3);
    return p.unit?.symbol === 'kg' || p.unit?.symbol === 'L' ? Math.max(1, Math.round(q)) : Math.max(1, Math.round(q));
  };

  for (let i = 0; i < DAYS.length; i++) {
    const key = DAYS[i];
    // Purchases: a big stock-up 30 days ago, weekly top-ups, perishables every 3 days
    if (i === 0) {
      const withShelf = keepers.find((p) => profile.get(String(p._id)).shelf > 0) || keepers[0];
      await purchase(key, products.map((p) => ({ product: p, qty: qtyFor(p, perishables.includes(p) ? 3 : 12) })), { expired: withShelf?._id });
    } else if ([7, 14, 21, 28].includes(i)) {
      const pickList = keepers.filter(() => chance(0.75));
      const soon = i === 7 ? (keepers.find((p) => profile.get(String(p._id)).shelf > 0) || pickList[0]) : null;
      await purchase(key, pickList.map((p) => ({ product: p, qty: qtyFor(p, 7) })), { expiringSoon: soon?._id });
    } else if (i === 30) {
      await purchase(key, [...perishables, ...keepers.filter(() => chance(0.2))].map((p) => ({ product: p, qty: qtyFor(p, 3) })));
    }
    if (i % 3 === 0 && i !== 0 && i !== 30 && perishables.length) {
      await purchase(key, perishables.map((p) => ({ product: p, qty: qtyFor(p, 3) })));
    }

    // Moving stock to where it's used, and using it
    const factor = isTuesday(key) ? 1.8 : 1;
    for (const p of products) {
      const prof = profile.get(String(p._id));
      const dept = deptFor(p);
      if (dept._id !== store._id && (i % 3 === 1 || prof.shelf > 0)) {
        const date = timeOn(key, hm(7), hm(9));
        if (date) await stockMove({ type: 'TRANSFER', product: p, from: store, to: dept, qty: prof.daily * (prof.shelf > 0 ? 1.2 : 3.5), date, user: staff.store });
      }
      if (!chance(0.8)) continue;
      const date = timeOn(key, hm(9), hm(19));
      if (!date) continue;
      const purpose = dept.type === 'kitchen' ? 'CONSUMPTION' : dept.type === 'distribution' ? 'DISTRIBUTION' : 'OFFERING';
      await stockMove({
        type: 'STOCK_OUT', product: p, from: dept, qty: round2(prof.daily * factor * (0.7 + rand() * 0.6)), date, purpose,
        issuedTo: dept.type === 'kitchen' ? 'Kitchen — Mahaprasad' : dept.type === 'flower' ? 'Gabhara decoration' : 'Abhishek / puja', user: staff.store,
      });
    }
    if (i % 5 === 2 && perishables.length) {
      const p = pick(perishables);
      const date = timeOn(key, hm(19), hm(21));
      if (date) await stockMove({ type: 'WASTAGE', product: p, from: deptFor(p), qty: Math.max(1, Math.round(profile.get(String(p._id)).daily * 0.3)), date, reason: pick(['EXPIRED', 'DAMAGED', 'SPILLAGE']), user: staff.store });
    }
  }

  // A few items low or out of stock today, so the alerts have something to show
  const withMin = keepers.filter((p) => p.minStockLevel > 0);
  for (const [n, p] of withMin.slice(0, 4).entries()) {
    const have = await getBalance(p._id, store._id);
    const target = n === 0 ? 0 : roundQty(p, p.minStockLevel * (0.4 + rand() * 0.3));
    const date = timeOn(TODAY, hm(8), hm(23, 59));
    if (have > target && date) {
      await stockMove({ type: 'STOCK_OUT', product: p, from: store, qty: have - target, date, purpose: 'CONSUMPTION', issuedTo: 'Kitchen — Mahaprasad', user: staff.store });
    }
  }
  return { purchases, store };
}

// ── Supplier payments for those purchases ────────────────────────────────────
async function seedPayments({ purchases, staff }) {
  const sorted = [...purchases].sort((a, b) => a.entry.receivedDate - b.entry.receivedDate);
  const ageOf = (p) => DAYS.length - 1 - DAYS.indexOf(p.key);
  const unpaidOverdue = sorted.find((p) => ageOf(p) >= 14 && ageOf(p) <= 17);
  const made = [];
  const pay = async (p, amount, { status = 'approved', when, rejectionReason } = {}) => {
    const date = when || at(addDays(p.key, Math.min(p.vendor.creditDays || 5, int(3, 12))), hm(int(11, 16), int(0, 59)));
    if (date > NOW) return;
    const mode = amount < 2000 ? pick(['cash', 'upi']) : pick(['neft', 'neft', 'upi', 'cheque', 'rtgs']);
    const doc = await SupplierPayment.create({
      paymentNumber: await number(`PAY-${dayKey(date)}-`, SRC.payment),
      supplier: p.vendor._id,
      invoices: [{ purchaseEntryId: p.entry._id, invoiceNumber: p.entry.invoiceNumber, invoiceDate: p.entry.invoiceDate, invoiceTotal: p.entry.totalValue, paidAmount: amount }],
      totalAmount: amount, paymentDate: date, paymentMode: mode,
      referenceNumber: mode === 'cash' ? undefined : mode === 'cheque' ? String(int(100000, 999999)) : `${mode.toUpperCase()}${int(100000000, 999999999)}`,
      status, createdBy: staff.accounts._id,
      ...(status === 'approved' ? { approvedBy: staff.trustee._id, approvedAt: new Date(Math.min(date.getTime() + 2 * 3600e3, NOW.getTime())) } : {}),
      ...(status === 'rejected' ? { rejectedBy: staff.trustee._id, rejectedAt: new Date(date.getTime() + 3600e3), rejectionReason } : {}),
      ...stamp(date),
    });
    made.push(doc);
  };
  for (const p of sorted) {
    const age = ageOf(p);
    const total = p.entry.totalValue;
    if (p === unpaidOverdue) {
      await pay(p, total, { status: 'rejected', rejectionReason: 'UTR does not match the bank statement — please check and resubmit' });
    } else if (age >= 10) {
      await pay(p, total);
    } else if (age >= 3) {
      if (chance(0.5)) await pay(p, round2(Math.round(total / 2)));
    } else if (age >= 1) {
      await pay(p, total, { status: 'pending_approval', when: timeOn(TODAY, hm(10), hm(13)) || NOW });
    }
  }
  await track('SupplierPayment', made);
}

// ── Expenses and this month's budgets ────────────────────────────────────────
async function seedExpenses({ staff }) {
  const made = [];
  const add = async (key, category, description, payee, min, max, { status = 'approved', paymentMode } = {}) => {
    const date = timeOn(key, hm(10), hm(18));
    if (!date) return;
    const approvedAt = new Date(Math.min(date.getTime() + int(2, 20) * 3600e3, NOW.getTime() - 60e3));
    made.push(await Expense.create({
      expenseNumber: await number(`EXP-${date.getFullYear()}-`, SRC.expense),
      category, description, payee, amount: Math.round(int(min, max) / 10) * 10, expenseDate: dateKeyToDate(key),
      paymentMode: paymentMode || pick(['cash', 'upi', 'upi', 'bank', 'cheque']), referenceNumber: chance(0.5) ? String(int(100000, 999999)) : undefined,
      status, createdBy: staff.accounts._id,
      ...(status === 'approved' ? { approvedBy: staff.trustee._id, approvedAt } : {}),
      ...(status === 'rejected' ? { rejectedBy: staff.trustee._id, rejectedAt: approvedAt, rejectionReason: 'Bill not attached — please add the receipt' } : {}),
      ...stamp(date),
    }));
  };
  await add(daysAgo(25), 'electricity', 'Electricity bill — temple premises', 'MSEDCL', 8000, 14000, { paymentMode: 'bank' });
  await add(daysAgo(22), 'water', 'Water charges — quarterly', 'Amalner Nagar Parishad', 1200, 1800, { paymentMode: 'cheque' });
  for (const key of DAYS.slice(0, -1).filter(isTuesday)) {
    await add(key, 'priest_fees', 'Dakshina — Tuesday abhishek', 'Pt. Vinayak Joshi', 2100, 5100);
    await add(key, 'decoration', 'Flower decoration — gabhara and mandap', 'Shri Sai Flower Decorators', 1500, 4500);
  }
  for (const [n, d] of [[19, 'Plumbing repair — wash area'], [11, 'Electrical fittings — mandap lights'], [4, 'Painting touch-up — entrance']]) {
    await add(daysAgo(n), 'maintenance', d, pick(['Om Electricals', 'Sai Hardware', 'Patil Painting Works']), 1500, 9000);
  }
  await add(daysAgo(17), 'printing', 'Receipt books printing', 'Shree Printers', 800, 2500);
  await add(daysAgo(6), 'printing', 'Banner printing — Tuesday darshan timings', 'Shree Printers', 1200, 3500);
  for (const [n, d] of [[28, 'Drinking water cans'], [20, 'Courier charges'], [13, 'Generator diesel'], [8, 'Cleaning staff refreshments'], [2, 'Pooja material (urgent)']]) {
    await add(daysAgo(n), 'miscellaneous', d, pick(['Local vendor', 'Ganesh Traders', 'Cash purchase']), 300, 2500, { paymentMode: 'cash' });
  }
  await add(daysAgo(9), 'miscellaneous', 'Tea and snacks — volunteers', 'Hotel Annapurna', 600, 1500, { status: 'rejected', paymentMode: 'cash' });
  // Today: waiting for approval
  await add(TODAY, 'decoration', 'Flower decoration — Tuesday preparation', 'Shri Sai Flower Decorators', 2500, 4500, { status: 'pending_approval' });
  await add(TODAY, 'priest_fees', 'Dakshina — special abhishek', 'Pt. Vinayak Joshi', 2100, 3100, { status: 'pending_approval' });
  await add(TODAY, 'miscellaneous', 'Drinking water cans', 'Ganesh Traders', 400, 900, { status: 'pending_approval', paymentMode: 'cash' });
  await track('Expense', made);

  const budgets = { electricity: 15000, water: 2000, priest_fees: 20000, maintenance: 15000, decoration: 18000, printing: 5000, miscellaneous: 8000 };
  const year = NOW.getFullYear(); const month = NOW.getMonth() + 1;
  const madeBudgets = [];
  for (const [category, budgetAmount] of Object.entries(budgets)) {
    if (await ExpenseBudget.exists({ year, month, category })) continue;
    madeBudgets.push(await ExpenseBudget.create({ year, month, category, budgetAmount }));
  }
  await track('ExpenseBudget', madeBudgets);
}

// ── Donations ────────────────────────────────────────────────────────────────
async function seedDonations({ products, store, staff }) {
  const occasions = await DonationOccasion.find({ isActive: true }).lean();
  const occ = (name) => occasions.find((o) => o.name === name)?._id;
  const general = occ('General Donation') || occasions[0]?._id;
  // In-kind gifts: grains, oil, sugar, ghee — nothing that spoils in days (flowers, milk)
  const groceries = products.filter((p) => ['kg', 'L'].includes(p.unit?.symbol) && !p.isPujaItem
    && !['FL', 'VF', 'DP'].includes(p.category?.code) && !(p.shelfLifeDays > 0 && p.shelfLifeDays < 60));
  const regularDonors = REGULARS.slice(0, 25);
  const made = [];
  for (const key of DAYS) {
    const count = key === TODAY ? 40 : Math.round(6 * busy(key) * (0.7 + rand() * 0.6));
    const entries = [];
    for (let n = 0; n < count; n++) entries.push({ date: timeOn(key, hm(6, 30), hm(20, 30)), hundi: false });
    // Hundi is counted on Tuesday and Sunday evenings
    if (key !== TODAY && (isTuesday(key) || weekdayOf(key) === 0)) entries.push({ date: at(key, hm(20, int(35, 55))), hundi: true });
    for (const { date, hundi } of entries.filter((e) => e.date).sort((a, b) => a.date - b.date)) {
      const kind = !hundi && groceries.length && chance(0.1);
      const type = hundi ? 'hundi' : chance(0.13) ? 'anonymous' : 'named';
      const donor = type === 'named' ? (chance(0.3) ? pick(regularDonors) : { name: personName(), phone: phone() }) : null;
      const cash = hundi ? int(80, 450) * 100 + int(0, 99)
        : kind ? (chance(0.3) ? pick([101, 251, 501]) : 0)
          : weighted([[101, 20], [151, 8], [201, 12], [251, 12], [501, 14], [1001, 10], [1101, 5], [2100, 6], [2501, 4], [5001, 4], [11000, 2], [21000, 1]]);
      const mode = hundi ? 'cash' : cash >= 5001 ? pick(['cheque', 'bank_transfer', 'upi']) : weighted([['cash', 50], ['upi', 42], ['cheque', 5], ['bank_transfer', 3]]);
      // 80G: named donors with a PAN; no 80G on cash above ₹2,000 (it can't be claimed)
      const is80G = type === 'named' && cash >= 1001 && !(mode === 'cash' && cash > 2000) && chance(0.6);
      const kindItems = [];
      if (kind) {
        for (const p of [pick(groceries), ...(chance(0.4) ? [pick(groceries)] : [])]) {
          const qty = p.unit?.symbol === 'kg' ? pick([5, 10, 10, 25, 50]) : pick([5, 10, 15]);
          const txn = await stockIn({ product: p, dept: store, qty, rate: 0, date, stockInType: 'DONATION', donorName: donor?.name || 'Anonymous', user: staff.desk });
          kindItems.push({ product: p._id, quantity: qty, unit: p.unit?._id, department: store._id, estimatedValue: Math.round(qty * useProfile(p).rate), stockTransactionId: txn._id });
        }
      }
      const doc = await Donation.create({
        donationNumber: await number(`DON-${ymd(dateKeyOf(date))}-`, SRC.donation),
        donationType: type, date,
        donorName: donor?.name, donorPhone: donor?.phone, panNumber: is80G ? pan() : undefined, is80G,
        occasion: hundi ? (occ('Hundi') || general) : chance(0.75) ? general : (pick(occasions)?._id || general),
        cashAmount: cash, paymentMode: mode,
        paymentRef: mode === 'upi' ? `${int(100000, 999999)}${int(100000, 999999)}` : mode === 'cheque' ? String(int(100000, 999999)) : mode === 'bank_transfer' ? `NEFT${int(10000000, 99999999)}` : undefined,
        kindItems, totalEstimatedValue: cash + kindItems.reduce((s, i) => s + i.estimatedValue, 0),
        notes: hundi ? 'Hundi counting — witnessed by two trustees' : undefined,
        receivedBy: staff.desk._id, createdBy: staff.desk._id, ...stamp(date),
      });
      made.push(doc);
    }
  }
  // One entered twice by mistake, voided
  const dup = made.find((d) => d.donationType === 'named' && !d.kindItems.length && d.date < dateKeyToDate(TODAY));
  if (dup) await Donation.updateOne({ _id: dup._id }, { $set: { isVoided: true, voidReason: 'Entered twice by mistake' } });
  await track('Donation', made);
}

// ── Pooja bookings ───────────────────────────────────────────────────────────
async function seedBookings({ staff }) {
  const sevas = await SevaType.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  if (!sevas.length) return;
  const batches = await BookingBatch.find({ isActive: true }).lean();
  const settings = await BookingSettings.getOrCreate();
  const closures = await BookingClosure.find({ date: { $gte: DAYS[0] } }).lean();
  const capacityUnit = settings.capacityUnit || 'bookings';
  const closed = (seva, key) => closures.some((c) => c.date === key && (!c.sevaTypes?.length || c.sevaTypes.some((id) => String(id) === String(seva._id))));
  const counters = await SlotCounter.find({ date: { $gte: DAYS[0] } }).lean();
  const used = new Map(counters.map((c) => [c.key, { booked: c.booked, seq: c.seq }]));
  const take = (key, seats, capacity) => {
    const u = used.get(key) || { booked: 0, seq: 0 };
    if (capacity && u.booked + seats > capacity) return null;
    u.booked += seats; u.seq += 1; used.set(key, u); slotKeys.add(key);
    return u.seq;
  };
  const counterStaff = [staff.counter1, staff.counter2];
  const list = [];

  const devotee = (seva) => {
    const reg = chance(0.35) ? pick(REGULARS) : null;
    const d = { name: reg?.name || personName(), phone: reg?.phone || phone(), gotra: reg?.gotra || (chance(0.5) ? pick(GOTRAS) : '') };
    if (seva.needsPostalAddress || chance(0.3)) Object.assign(d, reg?.place || placeAddress());
    if (chance(0.3)) d.familyNames = Array.from({ length: int(1, 3) }, () => pick([...FIRST_M, ...FIRST_F]));
    if (chance(0.2)) { d.rashi = pick(RASHIS); d.nakshatra = pick(NAKSHATRAS); }
    if (chance(0.08)) d.email = `${d.name.toLowerCase().replace(/[^a-z]+/g, '.')}${int(10, 99)}@gmail.com`;
    return d;
  };
  const people = (seva) => Math.min(seva.maxPeople || 6, weighted([[1, 45], [2, 30], [3, 12], [4, 10], [5, 3]]));
  const mode = () => weighted([['cash', 58], ['upi', 38], ['card', 4]]);

  function make(seva, { key, batch, paidAt }) {
    const peopleCount = people(seva);
    let counterKey = null; let capacity = 0; let label = ''; let hall = '';
    if (seva.schedule === 'batch') { counterKey = slotKey.batch(batch._id, key); capacity = batch.capacity; label = batchLabelOf(batch); hall = batch.hall; }
    else if (seva.schedule === 'slot') { counterKey = slotKey.seva(seva._id, key); capacity = seva.dailyLimit || 0; label = seva.slotTime || ''; }
    const seats = counterKey ? seatsFor(capacityUnit, peopleCount) : 0;
    const voided = chance(0.02);
    const serialNo = counterKey ? (voided ? (used.get(counterKey)?.seq || 0) + 1 : take(counterKey, seats, capacity)) : undefined;
    if (counterKey && serialNo == null) return false;
    if (voided && counterKey) { const u = used.get(counterKey) || { booked: 0, seq: 0 }; u.seq += 1; used.set(counterKey, u); slotKeys.add(counterKey); }
    const by = pick(counterStaff);
    const m = mode();
    list.push({
      sevaType: seva._id, sevaName: seva.name, schedule: seva.schedule, amount: seva.price,
      performDate: key && seva.schedule !== 'none' ? dateKeyToDate(key) : undefined, dateKey: seva.schedule !== 'none' ? key : undefined,
      batch: batch?._id, batchLabel: label, hall, serialNo, seats, devotee: devotee(seva), peopleCount,
      paymentMode: m, paymentRef: m === 'upi' ? `${int(100000, 999999)}${int(100000, 999999)}` : m === 'card' ? String(int(1000, 9999)) : '',
      paidAt, channel: 'counter', status: voided ? 'voided' : 'confirmed',
      ...(voided ? { voidReason: 'Devotee asked to cancel', voidedBy: by._id, voidedAt: new Date(Math.min(paidAt.getTime() + 20 * 60e3, NOW.getTime())) } : {}),
      receiptToken: crypto.randomBytes(12).toString('base64url'), createdBy: by._id, ...stamp(paidAt),
    });
    return true;
  }
  const batchLabelOf = (b) => {
    const t = (hhmm) => { const [h, mi] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
    return `${t(b.start)} – ${t(b.end)}`;
  };
  const startMin = (b) => { const [h, mi] = b.start.split(':').map(Number); return h * 60 + mi; };
  // When was it paid: some in advance, most the same morning before the batch starts
  const paidTime = (key, startsAt) => {
    if (chance(0.3) || startsAt < hm(6, 15)) {
      const prev = addDays(key, -int(1, 5));
      return at(prev, int(hm(8), hm(20)));
    }
    const t = timeOn(key, Math.max(hm(5, 30), startsAt - 180), startsAt - 10);
    return t || at(addDays(key, -1), int(hm(10), hm(20)));
  };

  const dated = sevas.filter((s) => s.schedule !== 'none');
  const minPrice = Math.min(...sevas.map((s) => s.price));
  const postal = sevas.filter((s) => s.schedule === 'none');
  const plan = (key) => {
    if (key === TODAY) return { dated: 95, postal: 10 };
    return { dated: Math.round(18 * busy(key) * (0.8 + rand() * 0.4)), postal: Math.round(2 * busy(key)) };
  };
  const future = Array.from({ length: 10 }, (_, i) => addDays(TODAY, i + 1));
  for (const key of [...DAYS, ...future]) {
    const isFuture = key > TODAY;
    const n = !dated.length ? 0 : isFuture ? (isTuesday(key) ? 8 : 2) : plan(key).dated;
    for (let k = 0; k < n; k++) {
      // Cheaper sevas are booked far more often; office-arranged ones (Bhomyag) only now and then
      const seva = weighted(dated.map((s) => [s, (s.schedule === 'batch' ? 6 : s.schedule === 'slot' ? 2 : 0.5) * Math.max(0.08, minPrice / s.price)]));
      if (!seva || closed(seva, key)) continue;
      if (seva.schedule === 'slot' && seva.weekdays?.length && !seva.weekdays.includes(weekdayOf(key))) continue;
      let batch = null;
      if (seva.schedule === 'batch') {
        const options = batchesFor(batches, seva, key);
        if (!options.length) continue;
        // Spread over the day's batches that still have room (morning ones a little fuller)
        const open = options.filter((b) => (used.get(slotKey.batch(b._id, key))?.booked || 0) < b.capacity);
        batch = open.length ? weighted(open.map((b, n) => [b, n < 3 ? 1.5 : 1])) : pick(options);
      }
      const startsAt = batch ? startMin(batch) : (labelTimes(seva.slotTime)?.start ?? hm(6));
      const paidAt = isFuture ? timeOn(TODAY, hm(6), hm(23, 59)) : paidTime(key, startsAt);
      if (!paidAt || paidAt > NOW) continue;
      make(seva, { key, batch, paidAt });
    }
    if (!isFuture) {
      for (let k = 0; k < (postal.length ? plan(key).postal : 0); k++) {
        const paidAt = timeOn(key, hm(7), hm(20));
        if (paidAt) make(pick(postal), { key, paidAt });
      }
    }
  }

  // Receipt numbers in the order they were paid, continuing the financial year's series
  list.sort((a, b) => a.paidAt - b.paidAt);
  const fyCounters = new Map();
  for (const b of list) {
    const fy = financialYear(b.paidAt);
    if (!fyCounters.has(fy)) fyCounters.set(fy, (await DailyCounter.findOne({ module: 'booking-receipt', date: fy }).lean())?.count || 0);
    const seq = fyCounters.get(fy) + 1;
    fyCounters.set(fy, seq);
    Object.assign(b, { fy, seq, receiptNo: formatReceiptNo(settings.receiptPrefix, fy, seq) });
  }

  // Hall check-in: most devotees of batches that have started were scanned in
  for (const b of list) {
    if (b.status !== 'confirmed' || !b.dateKey || b.dateKey > TODAY) continue;
    const starts = b.batch ? startMin(batches.find((x) => String(x._id) === String(b.batch))) : (labelTimes(b.batchLabel)?.start ?? hm(7));
    if (b.dateKey === TODAY && starts > NOW_MIN) continue;
    if (chance(0.9)) Object.assign(b, { checkedInAt: at(b.dateKey, Math.max(hm(5), starts - int(0, 25))), checkedInBy: staff.hall._id });
  }

  // Closed counter shifts for past days (today's counters are still open)
  const shifts = [];
  const groups = new Map();
  for (const b of list) {
    const day = dateKeyOf(b.paidAt);
    if (day >= TODAY) continue;
    const k = `${b.createdBy}|${day}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  for (const [k, items] of groups) {
    const [userId, day] = k.split('|');
    const totals = { count: 0, amount: 0, cash: 0, upi: 0, card: 0, voidedCount: 0 };
    for (const b of items) {
      if (b.status === 'voided') { totals.voidedCount += 1; continue; }
      totals.count += 1; totals.amount += b.amount; totals[b.paymentMode] = (totals[b.paymentMode] || 0) + b.amount;
    }
    const openingFloat = 500;
    const expectedCash = openingFloat + totals.cash;
    const difference = chance(0.12) ? pick([-20, -10, 10]) : 0;
    const closedAt = new Date(Math.max(...items.map((b) => b.paidAt.getTime())) + int(20, 50) * 60e3);
    const oldEnough = day < addDays(TODAY, -1);
    const shift = {
      _id: new mongoose.Types.ObjectId(), user: userId, startedAt: new Date(Math.min(...items.map((b) => b.paidAt.getTime()))), closedAt,
      totals, openingFloat, countedCash: expectedCash + difference, expectedCash, difference,
      notes: difference ? (difference < 0 ? 'Short — change given extra by mistake' : 'Extra — devotee left the change') : '',
      status: oldEnough ? 'verified' : 'closed',
      ...(oldEnough ? { verifiedBy: staff.trustee._id, verifiedAt: at(addDays(day, 1), hm(10, int(0, 59))) } : {}),
      ...stamp(closedAt),
    };
    shifts.push(shift);
    for (const b of items) b.shift = shift._id;
  }
  if (shifts.length) await track('BookingShift', await BookingShift.insertMany(shifts));
  for (let i = 0; i < list.length; i += 500) await track('Booking', await Booking.insertMany(list.slice(i, i + 500)));

  // Seat counters and receipt numbering now include the demo bookings
  for (const key of slotKeys) {
    const u = used.get(key);
    const date = key.split(':').pop();
    await SlotCounter.updateOne({ key }, { $set: { booked: u.booked, date }, $max: { seq: u.seq } }, { upsert: true });
  }
  for (const [fy, seq] of fyCounters) {
    await DailyCounter.updateOne({ module: 'booking-receipt', date: fy }, { $max: { count: seq } }, { upsert: true });
    dailyCounters.push({ module: 'booking-receipt', date: fy });
  }
}

// ── Mahaprasad coupons ───────────────────────────────────────────────────────
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NOTE_TO_DRAWER = { 10: { 10: 1 }, 20: { 20: 1 }, 50: { 50: 1 }, 100: { 100: 1 }, 200: { 100: 2 }, 500: { 500: 1 } };

async function seedMahaprasad({ staff }) {
  const settings = await Settings.getOrCreate();
  const occasions = (await MahaprasadOccasion.find({ isActive: true }).lean()).map((o) => o.name);
  const cap = settings.mahaprasadDailyCap || 0;
  const coupons = []; const payments = [];
  let drawer = null;
  if (!(await MahaprasadCashDrawer.exists({ date: ymd(TODAY) }))) {
    const opening = { 1: 0, 2: 0, 5: 0, 10: 30, 20: 25, 50: 10, 100: 5, 500: 0 };
    drawer = { date: ymd(TODAY), counts: { ...opening }, openingCounts: { ...opening }, receivedCounts: { 1: 0, 2: 0, 5: 0, 10: 0, 20: 0, 50: 0, 100: 0, 500: 0 }, changeCounts: { 1: 0, 2: 0, 5: 0, 10: 0, 20: 0, 50: 0, 100: 0, 500: 0 }, isFloatSet: true, openedBy: staff.prasad._id, openedAt: at(TODAY, hm(10, 30)) };
  }
  for (const key of DAYS) {
    const price = settings.mahaprasadDayPricing?.[DAY_KEYS[weekdayOf(key)]] ?? 0;
    let persons = key === TODAY ? 500 : Math.round(150 * busy(key) * (0.8 + rand() * 0.4));
    if (cap > 0) persons = Math.min(persons, key === TODAY ? cap - 25 : cap);
    const issues = [];
    while (persons > 0) {
      const group = chance(0.05);
      const size = Math.min(persons, group ? int(6, 15) : weighted([[1, 50], [2, 25], [3, 12], [4, 8], [5, 5]]));
      const time = (chance(0.7) ? timeOn(key, hm(11), hm(15)) : timeOn(key, hm(18, 30), hm(21)))
        || timeOn(key, hm(11), hm(15)) || timeOn(key, hm(7), hm(23, 59));   // today: before the evening has come
      persons -= size;
      if (time) issues.push({ time, size, group });
    }
    issues.sort((a, b) => a.time - b.time);
    let seq = (await DailyCounter.findOne({ module: 'mahaprasad', date: ymd(key) }).lean())?.count || 0;
    for (const { time, size, group } of issues) {
      const free = price === 0 || chance(0.08);
      const type = free ? 'free' : 'paid';
      const batchId = crypto.randomBytes(5).toString('hex');
      const couponDate = dateKeyToDate(key); couponDate.setHours(12, 0, 0, 0);
      const occasion = free && occasions.length && chance(0.5) ? pick(occasions) : '';
      const docs = Array.from({ length: group ? 1 : size }, () => {
        seq += 1;
        const redeemable = key !== TODAY || time.getTime() < NOW.getTime() - 30 * 60e3;
        const redeemed = redeemable && chance(key === TODAY ? 0.85 : 0.96);
        const redeemedAt = redeemed ? new Date(Math.min(time.getTime() + int(10, 80) * 60e3, NOW.getTime() - 60e3)) : undefined;
        return {
          couponNumber: `MP-${ymd(key)}-${String(seq).padStart(3, '0')}`, date: couponDate, type,
          amount: type === 'paid' ? (group ? price * size : price) : 0, occasion: type === 'free' ? occasion : '',
          status: redeemed ? 'redeemed' : 'issued', issuedBy: staff.prasad._id, issuedAt: time,
          ...(redeemed ? { redeemedBy: staff.scanner._id, redeemedAt } : {}),
          batchId, groupSize: group ? size : 1, isGroup: group, ...stamp(time),
        };
      });
      coupons.push(...docs);
      if (type === 'paid') {
        const totalDue = price * size;
        const cash = chance(0.7);
        let received = totalDue; const notes = [];
        if (cash) {
          received = chance(0.4) ? totalDue : [50, 100, 200, 500].find((n) => n >= totalDue) || Math.ceil(totalDue / 100) * 100;
          let left = received;
          for (const n of [500, 200, 100, 50, 20, 10]) while (left >= n) { notes.push(n); left -= n; }
          received -= left;
        }
        const change = Math.max(0, received - totalDue);
        const changeBreakdown = {};
        if (cash && change > 0 && drawer && key === TODAY) {
          let left = change;
          for (const d of [500, 100, 50, 20, 10, 5, 2, 1]) {
            const k = String(d); const use = Math.min(Math.floor(left / d), drawer.counts[k] || 0);
            if (use > 0) { changeBreakdown[k] = use; drawer.counts[k] -= use; drawer.changeCounts[k] += use; left -= use * d; }
          }
        }
        if (cash && drawer && key === TODAY) {
          for (const n of notes) for (const [d, c] of Object.entries(NOTE_TO_DRAWER[n] || {})) { drawer.counts[d] += c; drawer.receivedCounts[d] += c; }
        }
        payments.push({
          batchId, date: couponDate, couponNumbers: docs.map((d) => d.couponNumber), qty: size, totalDue,
          paymentMode: cash ? 'cash' : 'upi', amountReceived: cash ? received : totalDue, changeReturned: change,
          issuedBy: staff.prasad._id, issuedAt: time, receivedNotes: cash ? notes : [], changeBreakdown, ...stamp(time),
        });
      }
    }
    if (seq > 0) {
      await DailyCounter.updateOne({ module: 'mahaprasad', date: ymd(key) }, { $max: { count: seq } }, { upsert: true });
      dailyCounters.push({ module: 'mahaprasad', date: ymd(key) });
    }
  }
  for (let i = 0; i < coupons.length; i += 1000) await track('MahaprasadCoupon', await MahaprasadCoupon.insertMany(coupons.slice(i, i + 1000)));
  for (let i = 0; i < payments.length; i += 1000) await track('MahaprasadPayment', await MahaprasadPayment.insertMany(payments.slice(i, i + 1000)));
  if (drawer) await track('MahaprasadCashDrawer', await MahaprasadCashDrawer.create({ ...drawer, ...stamp(drawer.openedAt) }));
}

// ── Lending temple items ─────────────────────────────────────────────────────
async function seedAssets({ assets, staff }) {
  const free = new Map(assets.map((a) => [String(a._id), a.totalQuantity]));
  const active = await AssetTransaction.aggregate([
    { $match: { status: { $in: ['approved', 'checked_out', 'overdue'] } } },
    { $group: { _id: '$asset', qty: { $sum: '$quantityBorrowed' } } },
  ]);
  for (const r of active) if (free.has(String(r._id))) free.set(String(r._id), free.get(String(r._id)) - r.qty);
  const takeAsset = (want, hold = true) => {
    const options = assets.filter((a) => free.get(String(a._id)) >= 1);
    if (!options.length) return null;
    const a = pick(options);
    const qty = Math.max(1, Math.min(want, free.get(String(a._id))));
    if (hold) free.set(String(a._id), free.get(String(a._id)) - qty);
    return { asset: a, qty };
  };
  const borrowers = [staff.hall, staff.store, staff.desk, staff.counter2];
  const year = NOW.getFullYear();
  const txns = []; const groups = [];
  const at10 = (key) => at(key, hm(10, int(0, 59)));
  const scenario = async ({ created, due, returned, status, external, fineDays = 0, hold = true, notes }) => {
    const pickd = takeAsset(int(1, 3), hold);
    if (!pickd) return;
    const { asset, qty } = pickd;
    const createdAt = at10(created);
    const fine = fineDays * (asset.finePerDay || 0) * qty;
    txns.push(await AssetTransaction.create({
      transactionNumber: await number(`BR-${year}-`, SRC.borrow, 4),
      asset: asset._id, quantityBorrowed: qty,
      borrowerType: external ? 'external' : 'staff', borrower: external ? undefined : pick(borrowers)._id,
      externalBorrower: external ? { name: personName(), phone: phone(), address: `${placeAddress().address}, Amalner`, idProofType: 'aadhar', idProofNumber: `XXXX XXXX ${int(1000, 9999)}` } : undefined,
      expectedReturnDate: at(due, hm(18)), status, approvedBy: staff.trustee._id, approvedAt: createdAt,
      ...(status !== 'approved' ? { checkedOutAt: new Date(createdAt.getTime() + 30 * 60e3), conditionAtCheckout: 'good' } : {}),
      ...(returned ? { actualReturnDate: at(returned, hm(17)), conditionAtReturn: fineDays ? 'fair' : 'good' } : {}),
      ...(fine ? { lateDays: fineDays, fineAmount: fine, fineApplied: true, finePaid: true, finePaidAt: at(returned, hm(17, 30)) } : {}),
      ...(status === 'overdue' ? { remindersSent: [{ reminderType: 'overdue', sentAt: at(daysAgo(1), hm(9)) }] } : {}),
      notes, createdBy: staff.desk._id, ...stamp(createdAt),
    }));
  };
  await scenario({ created: daysAgo(20), due: daysAgo(17), returned: daysAgo(17), status: 'returned', hold: false, notes: 'Satyanarayan puja at home' });
  await scenario({ created: daysAgo(12), due: daysAgo(9), returned: daysAgo(6), status: 'returned', fineDays: 3, hold: false, notes: 'Wedding function' });
  await scenario({ created: daysAgo(2), due: addDays(TODAY, 3), status: 'checked_out', notes: 'Bhajan programme' });
  await scenario({ created: daysAgo(4), due: TODAY, status: 'checked_out', notes: 'Society Ganesh mandal' });
  await scenario({ created: daysAgo(6), due: daysAgo(2), status: 'overdue', external: true, notes: 'Family function — village' });
  await scenario({ created: TODAY, due: addDays(TODAY, 2), status: 'approved', notes: 'Annadan at the gaushala' });

  // Several items for one event, lent together
  const items = [takeAsset(int(5, 30)), takeAsset(int(1, 2))].filter(Boolean);
  if (items.length) {
    const createdAt = at10(daysAgo(1));
    const groupNumber = await number(`BR-${year}-`, SRC.borrow, 4);
    const group = await BorrowGroup.create({
      groupNumber, borrowerType: 'staff', borrower: staff.store._id, approvedBy: staff.trustee._id, approvedAt: createdAt,
      expectedReturnDate: at(addDays(TODAY, 1), hm(18)), status: 'checked_out', notes: 'Satsang in the mandap',
      createdBy: staff.desk._id, ...stamp(createdAt),
    });
    groups.push(group);
    for (const [n, it] of items.entries()) {
      txns.push(await AssetTransaction.create({
        transactionNumber: items.length === 1 ? groupNumber : `${groupNumber}/${n + 1}`,
        asset: it.asset._id, quantityBorrowed: it.qty, borrowerType: 'staff', borrower: staff.store._id,
        expectedReturnDate: group.expectedReturnDate, status: 'checked_out', approvedBy: staff.trustee._id, approvedAt: createdAt,
        checkedOutAt: new Date(createdAt.getTime() + 20 * 60e3), conditionAtCheckout: 'good', group: group._id,
        createdBy: staff.desk._id, ...stamp(createdAt),
      }));
    }
  }
  await track('BorrowGroup', groups);
  await track('AssetTransaction', txns);
}

// ── Removing the demo data ───────────────────────────────────────────────────
async function removeDemo() {
  const col = records();
  const meta = await col.findOne({ _id: 'meta' });
  if (!meta) { console.log('No demo data found.'); return false; }
  const ids = async (model) => (await col.findOne({ _id: `ids:${model}` }))?.ids || [];
  const all = [];
  const drop = async (Model, name = Model.modelName) => {
    const list = await ids(name);
    all.push(...list);
    for (let i = 0; i < list.length; i += 5000) await Model.deleteMany({ _id: { $in: list.slice(i, i + 5000) } });
    if (list.length) console.log(`  removed ${String(list.length).padStart(5)} ${name}`);
  };

  // Stock first: give back to real batches what demo movements took from them
  const demoBatches = new Set((await ids('StockBatch')).map(String));
  const txns = await StockTransaction.find({ _id: { $in: await ids('StockTransaction') } }).select('consumedBatches').lean();
  for (const t of txns) {
    for (const c of t.consumedBatches || []) {
      if (!demoBatches.has(String(c.batch))) await StockBatch.updateOne({ _id: c.batch }, { $inc: { remainingQty: c.qty } });
    }
  }
  for (const Model of [Booking, BookingShift, MahaprasadCoupon, MahaprasadPayment, MahaprasadCashDrawer, Donation, SupplierPayment,
    PurchaseEntry, StockTransaction, StockBatch, Expense, ExpenseBudget, AssetTransaction, BorrowGroup, AssetUnit, Asset]) {
    await drop(Model);
  }
  const demoProducts = await ids('Product');
  await drop(Product);
  if (demoProducts.length) await StockBalance.deleteMany({ product: { $in: demoProducts } });
  await drop(Supplier);
  await drop(User);

  for (const pair of meta.stockPairs || []) {
    const [p, d] = pair.split(':');
    if (demoProducts.some((x) => String(x) === p)) continue;
    // A balance row only made for demo stock goes; one with real stock is worked out again
    if (await StockBatch.exists({ product: p, department: d })) await recomputeBalance(p, d);
    else await StockBalance.deleteOne({ product: p, department: d });
  }
  // Seats: what remains booked in each batch / slot
  for (const key of meta.slotKeys || []) {
    const [kind, id, date] = key.split(':');
    const match = { dateKey: date, ...(kind === 'B' ? { batch: new mongoose.Types.ObjectId(id) } : { sevaType: new mongoose.Types.ObjectId(id), batch: null }) };
    const [row] = await Booking.aggregate([{ $match: match }, {
      $group: { _id: null, booked: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$seats', 0] } }, seq: { $max: '$serialNo' } },
    }]);
    if (row) await SlotCounter.updateOne({ key }, { $set: { booked: row.booked, seq: row.seq || 0 } });
    else await SlotCounter.deleteOne({ key });
  }
  // Numbering carries on from the records that remain
  for (const { module, date } of meta.dailyCounters || []) {
    let max = 0;
    if (module === 'booking-receipt') max = (await Booking.findOne({ fy: date }).sort({ seq: -1 }).select('seq').lean())?.seq || 0;
    else {
      const left = await MahaprasadCoupon.find({ couponNumber: { $regex: `^MP-${date}-` } }).select('couponNumber').lean();
      max = Math.max(0, ...left.map((c) => Number(c.couponNumber.split('-').pop()) || 0));
    }
    if (max) await DailyCounter.updateOne({ module, date }, { $set: { count: max } });
    else await DailyCounter.deleteOne({ module, date });
  }
  if (meta.prefixes?.length) await Sequence.deleteMany({ _id: { $in: meta.prefixes } });
  for (let i = 0; i < all.length; i += 5000) await AuditLog.deleteMany({ entityRef: { $in: all.slice(i, i + 5000) } });
  if (meta.attendance) runAttendance('--remove');
  await col.drop();
  return true;
}

function runAttendance(flag) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'attendanceDemo.seed.js'), flag], { stdio: 'inherit', env: process.env, cwd: path.join(__dirname, '../..') });
  if (r.status !== 0) console.log(`  (attendance demo ${flag} finished with code ${r.status})`);
  return r.status === 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await connectDB();
  if (REMOVE) {
    console.log('\n[demo] removing demo data');
    if (await removeDemo()) console.log('[demo] done — demo data removed\n');
    return;
  }
  if (await records().findOne({ _id: 'meta' })) {
    if (!FRESH) throw new Error('Demo data is already there. Use --fresh to replace it, or seed:demo:remove to remove it.');
    console.log('\n[demo] removing the previous demo data');
    await removeDemo();
  }
  console.log(`\n[demo] adding demo data for ${TODAY} and the 30 days before`);
  await records().insertOne({ _id: 'meta', createdAt: NOW, today: TODAY });
  const save = () => records().updateOne({ _id: 'meta' }, {
    $set: { prefixes: [...prefixes], stockPairs: [...stockPairs], slotKeys: [...slotKeys], dailyCounters },
  });
  try {
    const staff = await createStaff();
    const { products, vendors, assets, extra } = await ensureSetup();
    const departments = await Department.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    console.log('  · stock and purchases…');
    const { purchases, store } = await seedStock({ products, vendors, departments, staff });
    await save();
    console.log('  · supplier payments and expenses…');
    await seedPayments({ purchases, staff });
    await seedExpenses({ staff });
    console.log('  · donations…');
    await seedDonations({ products, store, staff });
    console.log('  · pooja bookings…');
    await seedBookings({ staff });
    console.log('  · Mahaprasad…');
    await seedMahaprasad({ staff });
    console.log('  · asset lending…');
    await seedAssets({ assets, staff });
    for (const pair of stockPairs) { const [p, d] = pair.split(':'); await recomputeBalance(p, d); }
    await save();
    if (Object.keys(extra).length) console.log(`  · added missing setup: ${JSON.stringify(extra)}`);
  } catch (err) {
    await save();
    throw err;
  }
  if (WITH_ATTENDANCE) {
    console.log('  · attendance (separate demo script)…');
    if (runAttendance('--fresh')) await records().updateOne({ _id: 'meta' }, { $set: { attendance: true } });
  }
  console.log('\n[demo] added:');
  for (const [k, v] of Object.entries(summary)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log('\nRemove it all again with: npm run seed:demo:remove\n');
}

main()
  .catch((err) => { console.error('[demo] failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
