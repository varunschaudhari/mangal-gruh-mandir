import { z } from 'zod';
import { ASSET_CATEGORIES } from '../models/Asset.js';
import {
  clearableText, idParams, nullableNumber, nullableObjectId, nullableText, number, objectId,
  optionalBoolean, optionalDate, optionalNumber, optionalOneOf, optionalPan, text,
} from './common.js';

// Master data (categories, departments, units, occasions, products, suppliers, assets).
// Create and edit take the same fields; on an edit every field is optional and only the
// ones sent change. Fields not listed here (createdBy, codes made by the server…) can't be set.

const code = (label) => z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), text(label, { max: 20 }));
const sortOrder = optionalNumber('Sort order', { integer: true, min: 0, max: 10000 });
const isActive = optionalBoolean('Active');

const pair = (shape, label) => {
  const body = z.object(shape);
  return {
    create: { body },
    update: { params: idParams(`${label} id`), body: body.partial() },
  };
};

export const category = pair({
  name: text('Name', { max: 100 }),
  code: code('Code'),
  parentCategory: nullableObjectId('Parent category'),
  description: clearableText('Description', { max: 500 }),
  isActive,
  sortOrder,
}, 'Category');

export const department = pair({
  name: text('Name', { max: 100 }),
  code: code('Code'),
  description: clearableText('Description', { max: 500 }),
  type: optionalOneOf(['store', 'kitchen', 'puja', 'flower', 'distribution', 'office', 'other'], 'Type'),
  isActive,
  sortOrder,
}, 'Department');

export const unit = pair({
  name: text('Name', { max: 50 }),
  symbol: text('Symbol', { max: 15 }),
  type: optionalOneOf(['weight', 'volume', 'count', 'other'], 'Type'),
  isActive,
}, 'Unit');

// Donation and Mahaprasad occasions
export const occasion = pair({
  name: text('Name', { max: 100 }),
  notes: clearableText('Notes', { max: 500 }),
  isActive,
  sortOrder,
}, 'Occasion');

const productShape = {
  name: text('Name', { max: 150 }),
  code: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined), z.string().max(20, 'Code can be at most 20 characters').optional()),
  aliases: z.array(z.string().trim().max(100), { error: 'Other names must be a list' }).max(30).optional(),
  barcode: nullableText('Barcode', { max: 50 }),
  category: objectId('Category'),
  unit: objectId('Unit'),
  description: clearableText('Description', { max: 1000 }),
  minStockLevel: optionalNumber('Minimum stock', { min: 0 }),
  reorderPoint: optionalNumber('Reorder point', { min: 0 }),
  isPerishable: optionalBoolean('Perishable'),
  shelfLifeDays: nullableNumber('Shelf life (days)', { integer: true, min: 0, max: 36500 }),
  standardRate: optionalNumber('Standard rate', { min: 0 }),
  isPujaItem: optionalBoolean('Puja item'),
  isActive,
};
const productBody = z.object(productShape);
export const product = {
  create: { body: productBody },
  // The code can't change after creation
  update: { params: idParams('Product id'), body: productBody.omit({ code: true }).partial() },
};

const bankAccount = z.object({
  _id: z.preprocess((v) => (v === '' || v === null ? undefined : v), objectId('Bank account').optional()),
  label: clearableText('Account label', { max: 60 }),
  bankName: clearableText('Bank name', { max: 100 }),
  accountNumber: clearableText('Account number', { max: 30 }),
  ifscCode: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), clearableText('IFSC', { max: 11 })),
  accountHolderName: clearableText('Account holder', { max: 100 }),
  upiId: clearableText('UPI ID', { max: 100 }),
  isDefault: optionalBoolean('Default account'),
});

export const supplier = pair({
  name: text('Name', { max: 150 }),
  type: optionalOneOf(['vendor', 'donor', 'both'], 'Type'),
  contactPerson: clearableText('Contact person', { max: 100 }),
  phone: clearableText('Phone', { max: 20 }),
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v === null ? '' : v),
    z.union([z.literal(''), z.email('Email is not valid')]).optional()),
  address: clearableText('Address', { max: 300 }),
  pincode: z.preprocess((v) => (v === null ? '' : typeof v === 'number' ? String(v) : v),
    z.string().trim().regex(/^([1-9]\d{5})?$/, 'PIN code must be 6 digits').optional()),
  area: clearableText('Area', { max: 100 }),
  city: clearableText('City', { max: 100 }),
  district: clearableText('District', { max: 100 }),
  state: clearableText('State', { max: 100 }),
  gstin: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v === null ? '' : v), clearableText('GSTIN', { max: 15 })),
  // Blank clears it; anything else must be a real PAN (80G receipts print it)
  panNumber: z.union([z.literal(''), optionalPan()]).optional(),
  notes: clearableText('Notes', { max: 1000 }),
  isActive,
  bankAccounts: z.array(bankAccount, { error: 'Bank accounts must be a list' }).max(10, 'At most 10 bank accounts').optional(),
  creditDays: optionalNumber('Credit days', { integer: true, min: 0, max: 365 }),
}, 'Supplier');

export const asset = pair({
  name: text('Name', { max: 150 }),
  category: optionalOneOf(ASSET_CATEGORIES, 'Category'),
  description: clearableText('Description', { max: 1000 }),
  totalQuantity: number('Total quantity', { integer: true, min: 1, max: 10000 }),
  purchaseDate: optionalDate('Purchase date'),
  finePerDay: optionalNumber('Fine per day', { min: 0 }),
  isBorrowable: optionalBoolean('Borrowable'),
  isActive,
}, 'Asset');

export const byId = (label) => ({ params: idParams(`${label} id`) });
