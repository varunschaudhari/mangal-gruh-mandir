/**
 * Go-live clean-up: removes every test and demo record and keeps the temple's setup.
 *
 *   docker compose exec server npm run golive                          what it would do (changes nothing)
 *   ./backup-db.sh                                                      a fresh backup first — required
 *   docker compose exec server npm run golive -- --confirm=<database>   do it (the name the preview shows)
 *   docker compose restart server                                       then start the server clean
 *
 *   --keep-users=a@x.org,b@y.org   keep only these super admins (default: every super admin)
 *   --skip-backup-check            run without a backup from the last 2 hours (not recommended)
 *
 * KEPT — the setup: Settings (temple details, prices, WhatsApp / SMS / payment keys), roles,
 * departments, categories, units, donation and Mahaprasad occasions, seva types, halls, batches,
 * booking setup and closed dates, attendance settings (shifts, holidays, approved machines),
 * payroll settings, the usual daily Mahaprasad total, the PIN-code lookup cache — and the super
 * admin login(s), with their sessions.
 *
 * EMPTIED: products, suppliers, assets; all stock and its history; purchases, supplier payments
 * and payment templates; expenses, budgets and their receipt files; donations; pooja bookings and
 * counter shifts; Mahaprasad coupons, payments, cash drawers and online orders; the record of
 * WhatsApp messages to devotees (delivered / read); attendance
 * (punches, roster, months, corrections, double shifts) and salary; every other login with its
 * staff profile, sessions and phone registrations; the numbering (every receipt, coupon and
 * booking number starts again from 1); the audit and app-error logs; the demo-data list.
 *
 * Every model must be in one of the lists below (goLive.test.js checks), so a module added later
 * can't be silently skipped. Collections in the database that belong to no model are left alone
 * and listed.
 */
import 'dotenv/config';
import '../config/timezone.js';
import { readdir, rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { backupStatus } from '../services/health.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODELS_DIR = path.join(__dirname, '../models');
const RECEIPTS_DIR = path.join(__dirname, '../../uploads/expenses');
const BACKUP_MAX_HOURS = 2;

export const KEEP = [
  'Settings', 'Role', 'Department', 'Category', 'Unit', 'DonationOccasion', 'MahaprasadOccasion',
  'SevaType', 'BookingHall', 'BookingBatch', 'BookingSettings', 'BookingClosure',
  'AttendanceSettings', 'PayrollSettings', 'Pincode',
];
export const CLEAR = [
  // stock and buying
  'Product', 'Supplier', 'StockBalance', 'StockBatch', 'StockTransaction', 'PurchaseEntry',
  'SupplierPayment', 'PaymentTemplate', 'Expense', 'ExpenseBudget',
  // lending
  'Asset', 'AssetUnit', 'AssetTransaction', 'BorrowGroup',
  // donations, bookings, Mahaprasad
  'Donation', 'Booking', 'BookingShift', 'SlotCounter',
  'MahaprasadCoupon', 'MahaprasadPayment', 'MahaprasadCashDrawer', 'MahaprasadOrder',
  'WhatsAppMessage',   // whether each devotee's message was delivered — for those sales and bookings
  // attendance and salary
  'Punch', 'RosterDay', 'AttendanceMonth', 'AttendanceOverride', 'DoubleShift', 'SalaryRun', 'SalaryAdvance',
  // notice board — notices put up while testing
  'Notice',
  // numbering and logs
  'Sequence', 'DailyCounter', 'AuditLog', 'ClientError',
];
// Kept in part — see partFilter()
export const PART = ['User', 'Staff', 'Session', 'DeviceToken'];
// Not a model: the demo seed's list of what it added (seeds/demoDay.seed.js)
const EXTRA_CLEAR = ['demo_records'];

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name) => process.argv.includes(`--${name}`);

// What to delete from a collection that is kept in part
function partFilter(model, keptUserIds) {
  if (model === 'User') return { _id: { $nin: keptUserIds } };
  return { user: { $nin: keptUserIds } };                                 // Staff, Session, DeviceToken
}

async function loadModels() {
  for (const file of await readdir(MODELS_DIR)) {
    if (file.endsWith('.js') && !file.endsWith('.test.js') && file !== 'singleton.js') {
      await import(pathToFileURL(path.join(MODELS_DIR, file)).href);
    }
  }
}

async function receiptFiles() {
  try { return (await readdir(RECEIPTS_DIR, { withFileTypes: true })).filter((f) => f.isFile() && f.name !== '.gitkeep').map((f) => f.name); } catch { return []; }
}

async function main() {
  await loadModels();
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  const confirm = arg('confirm');
  const doIt = confirm !== undefined;

  const unclassified = mongoose.modelNames().filter((m) => ![...KEEP, ...CLEAR, ...PART].includes(m));
  if (unclassified.length) {
    console.error(`\n✖ Not sure what to do with: ${unclassified.join(', ')} — add them to KEEP, CLEAR or PART in goLive.js.\n`);
    process.exit(1);
  }

  // The logins that stay: super admins (all, or those named)
  const keepEmails = arg('keep-users')?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const keptUsers = await db.collection('users')
    .find({ role: 'super_admin', ...(keepEmails && { email: { $in: keepEmails } }) })
    .project({ name: 1, email: 1, isActive: 1 }).toArray();
  if (!keptUsers.length) {
    console.error(`\n✖ No super admin ${keepEmails ? `among ${keepEmails.join(', ')}` : 'found'} — nobody could sign in afterwards. Nothing done.\n`);
    process.exit(1);
  }
  if (keepEmails && keptUsers.length !== keepEmails.length) {
    const found = keptUsers.map((u) => u.email);
    console.error(`\n✖ Not a super admin (or no such login): ${keepEmails.filter((e) => !found.includes(e)).join(', ')}. Nothing done.\n`);
    process.exit(1);
  }
  const keptUserIds = keptUsers.map((u) => u._id);

  // The plan: every collection of a model, what happens to it
  const plan = [];
  for (const name of mongoose.modelNames().sort()) {
    const coll = mongoose.model(name).collection.name;
    const total = await db.collection(coll).countDocuments();
    if (KEEP.includes(name)) plan.push({ name, coll, total, remove: 0, filter: null });
    else if (CLEAR.includes(name)) plan.push({ name, coll, total, remove: total, filter: {} });
    else {
      const filter = partFilter(name, keptUserIds);
      plan.push({ name, coll, total, remove: await db.collection(coll).countDocuments(filter), filter });
    }
  }
  const known = new Set(plan.map((p) => p.coll));
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  for (const coll of EXTRA_CLEAR.filter((c) => existing.includes(c))) {
    const total = await db.collection(coll).countDocuments();
    plan.push({ name: coll, coll, total, remove: total, filter: {} });
    known.add(coll);
  }
  const untouched = existing.filter((c) => !known.has(c) && !c.startsWith('system.'));
  const files = await receiptFiles();

  console.log(`\nDatabase: ${dbName}${doIt ? '' : '   (preview — nothing is changed)'}\n`);
  console.log('  Collection                    Records   Removed   Left');
  for (const p of plan) {
    console.log(`  ${p.name.padEnd(28)} ${String(p.total).padStart(8)}  ${String(p.remove).padStart(8)}  ${String(p.total - p.remove).padStart(5)}`);
  }
  console.log(`\n  Logins kept: ${keptUsers.map((u) => `${u.name} <${u.email}>${u.isActive === false ? ' (inactive)' : ''}`).join(', ')}`);
  if (keptUsers.length > 1 && !keepEmails) console.log('  (to keep only some: --keep-users=first@x.org,second@y.org)');
  console.log(`  Expense receipt files removed: ${files.length}`);
  if (untouched.length) console.log(`  Left alone (not part of the app): ${untouched.join(', ')}`);

  if (!doIt) {
    console.log(`\nTo do this: take a backup (./backup-db.sh), then run again with --confirm=${dbName}\n`);
    await mongoose.disconnect();
    return;
  }

  if (confirm !== dbName) {
    console.error(`\n✖ --confirm must be the database's name exactly: --confirm=${dbName}. Nothing done.\n`);
    process.exit(1);
  }
  if (!has('skip-backup-check')) {
    const b = await backupStatus();
    if (!b.reporting || b.ageHours > BACKUP_MAX_HOURS) {
      console.error(`\n✖ No backup from the last ${BACKUP_MAX_HOURS} hours${b.reporting ? ` (last one ${b.ageHours} h ago)` : ''}. Run ./backup-db.sh on the server first. Nothing done.\n`);
      process.exit(1);
    }
    console.log(`\n  Backup from ${b.ageHours} h ago — ok`);
  }

  console.log('\nRemoving…');
  for (const p of plan.filter((x) => x.filter && x.remove > 0)) {
    const { deletedCount } = await db.collection(p.coll).deleteMany(p.filter);
    console.log(`  ✔ ${p.name}: ${deletedCount} removed`);
  }
  for (const f of files) await rm(path.join(RECEIPTS_DIR, f), { force: true });
  if (files.length) console.log(`  ✔ ${files.length} expense receipt files removed`);

  console.log('\n✔ Done — the setup is kept, everything else starts empty and numbering starts from 1.');
  console.log('  Restart the server now (docker compose restart server), then enter products, suppliers,');
  console.log('  opening stock and the staff logins.\n');
  await mongoose.disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
