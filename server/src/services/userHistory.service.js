/**
 * Has a login done anything in the app? A login can be deleted only when nothing points at it —
 * coupons it issued, payments it recorded, attendance, users it created, the audit log… Otherwise
 * deleting it would leave "Issued by: —" on old records, so it is deactivated instead.
 *
 * Every field that holds a user (ref: 'User') is found from the models themselves, so a new model
 * or field is covered without touching this file.
 */
import mongoose from 'mongoose';

// Records that belong to the login and go with it: its sign-ins and its phones' push tokens
export const OWNED_BY_USER = ['Session', 'DeviceToken'];
// Error reports from the app only note who was signed in — not something the person did
const IGNORED = ['ClientError'];

// What each kind of record is called on the screen
const LABELS = {
  Asset: 'Assets', AssetTransaction: 'Asset movements', AssetUnit: 'Assets',
  AttendanceMonth: 'Attendance', AttendanceOverride: 'Attendance', DoubleShift: 'Attendance', Punch: 'Attendance', RosterDay: 'Attendance',
  AuditLog: 'Audit log entries',
  Booking: 'Pooja bookings', BookingClosure: 'Pooja bookings', BookingShift: 'Pooja bookings',
  BorrowGroup: 'Borrow requests',
  Donation: 'Donations', DonationOccasion: 'Donations',
  Expense: 'Expenses',
  MahaprasadCashDrawer: 'Mahaprasad', MahaprasadCoupon: 'Mahaprasad', MahaprasadOccasion: 'Mahaprasad', MahaprasadPayment: 'Mahaprasad',
  PaymentTemplate: 'Payments', SupplierPayment: 'Payments',
  Product: 'Stock', StockTransaction: 'Stock', PurchaseEntry: 'Purchases',
  Role: 'Roles they created', User: 'Users they created',
  SalaryAdvance: 'Salary', SalaryRun: 'Salary', Staff: 'Payroll profile',
};
const labelFor = (model) => LABELS[model] || model.replace(/([a-z])([A-Z])/g, '$1 $2');

// The paths in a schema that hold a user id (also inside lists and sub-documents)
export function userRefPaths(schema, prefix = '') {
  const out = [];
  schema.eachPath((path, type) => {
    const full = `${prefix}${path}`;
    if (type.options?.ref === 'User' || type.embeddedSchemaType?.options?.ref === 'User') out.push(full);
    if (type.schema) out.push(...userRefPaths(type.schema, `${full}.`));
  });
  return out;
}

/** What the login has done, as screen labels (empty = nothing; safe to delete). */
export async function userHistory(userId) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const found = new Set();
  await Promise.all(mongoose.modelNames()
    .filter((name) => !OWNED_BY_USER.includes(name) && !IGNORED.includes(name))
    .map(async (name) => {
      const Model = mongoose.model(name);
      const paths = userRefPaths(Model.schema);
      if (!paths.length) return;
      const filter = { $or: paths.map((p) => ({ [p]: id })) };
      if (name === 'User') filter._id = { $ne: id };   // its own record
      // Its own sign-ins, sign-outs and password changes are not things it did in the app
      if (name === 'AuditLog') filter.action = { $not: /^auth\./ };
      if (await Model.exists(filter)) found.add(labelFor(name));
    }));
  return [...found].sort();
}
