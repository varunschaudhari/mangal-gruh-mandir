import { z } from 'zod';
import { STOCK_IN_TYPES_LIST, STOCK_OUT_PURPOSES_LIST, WASTAGE_REASONS_LIST } from '../models/StockTransaction.js';
import {
  clearableText, date, idParams, number, objectId, oneOf, optionalDate, optionalNumber,
  optionalObjectId, optionalOneOf, optionalText, paging, text,
} from './common.js';

// Types a person can record (ADJUSTMENT exists in old data only)
const ENTRY_TYPES = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE', 'OPENING_BALANCE'];

const quantity = (label = 'Quantity') => number(label, { positive: true, max: 1e7 });
const rate = optionalNumber('Rate', { min: 0, max: 1e7 });
// Edits: blank clears the field
const clearableDate = (label) => z.union([z.literal(''), z.null(), date(label)]).optional();

// ── Stock transactions ──────────────────────────────────────────────────────

export const createTransaction = {
  body: z.object({
    transactionType: oneOf(ENTRY_TYPES, 'Transaction type'),
    transactionDate: optionalDate('Date'),
    product: objectId('Product'),
    fromDepartment: optionalObjectId('From department'),
    toDepartment: optionalObjectId('To department'),
    quantity: quantity(),
    rate,
    stockInType: optionalOneOf(STOCK_IN_TYPES_LIST, 'Stock-in type'),
    supplier: optionalObjectId('Supplier'),
    invoiceNumber: optionalText('Invoice number', { max: 60 }),
    invoiceDate: optionalDate('Invoice date'),
    donorName: optionalText('Donor name', { max: 150 }),
    expiryDate: optionalDate('Expiry date'),
    manufacturingDate: optionalDate('Manufacturing date'),
    batchRef: optionalText('Batch number', { max: 60 }),
    stockOutPurpose: optionalOneOf(STOCK_OUT_PURPOSES_LIST, 'Purpose'),
    issuedTo: optionalText('Issued to', { max: 150 }),
    wastageReason: optionalOneOf(WASTAGE_REASONS_LIST, 'Wastage reason'),
    notes: optionalText('Notes', { max: 1000 }),
  }),
};

export const createBatchTransactions = {
  body: z.object({
    transactionDate: optionalDate('Date'),
    stockInType: optionalOneOf(STOCK_IN_TYPES_LIST, 'Stock-in type'),
    toDepartment: objectId('Department'),
    supplier: optionalObjectId('Supplier'),
    invoiceNumber: optionalText('Invoice number', { max: 60 }),
    invoiceDate: optionalDate('Invoice date'),
    donorName: optionalText('Donor name', { max: 150 }),
    notes: optionalText('Notes', { max: 1000 }),
    items: z.array(z.object({
      product: objectId('Product'),
      quantity: quantity(),
      rate,
      batchRef: optionalText('Batch number', { max: 60 }),
      expiryDate: optionalDate('Expiry date'),
      manufacturingDate: optionalDate('Manufacturing date'),
    }), { error: 'Items must be a list' }).min(1, 'At least one item is required').max(100, 'At most 100 items at a time'),
  }),
};

export const listTransactions = {
  query: z.object({
    ...paging,
    transactionType: optionalOneOf([...ENTRY_TYPES, 'ADJUSTMENT'], 'Transaction type'),
    product: optionalObjectId('Product'),
    fromDepartment: optionalObjectId('From department'),
    toDepartment: optionalObjectId('To department'),
    department: optionalObjectId('Department'),
    startDate: optionalDate('From date'),
    endDate: optionalDate('To date'),
    isVoided: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  }),
};

export const checkInvoice = {
  query: z.object({ supplier: optionalObjectId('Supplier'), invoiceNumber: optionalText('Invoice number', { max: 60 }) }),
};

export const transactionById = { params: idParams('Transaction id') };
export const voidTransaction = { params: idParams('Transaction id'), body: z.object({ voidReason: text('Void reason', { max: 500 }) }) };

// ── Purchase entries ────────────────────────────────────────────────────────

export const createPurchaseEntry = {
  body: z.object({
    supplier: objectId('Supplier'),
    toDepartment: objectId('Department'),
    invoiceNumber: optionalText('Invoice number', { max: 60 }),
    invoiceDate: optionalDate('Invoice date'),
    dueDate: optionalDate('Due date'),
    receivedDate: optionalDate('Received date'),
    notes: optionalText('Notes', { max: 1000 }),
    items: z.array(z.object({
      product: objectId('Product'),
      quantity: quantity(),
      rate,
      expiryDate: optionalDate('Expiry date'),
      manufacturingDate: optionalDate('Manufacturing date'),
      batchRef: optionalText('Batch number', { max: 60 }),
    }), { error: 'Items must be a list' }).min(1, 'At least one item is required').max(100, 'At most 100 items in one purchase'),
  }),
};

// Edit: invoice details and per-item rate / batch / expiry (not quantities or products)
export const updatePurchaseEntry = {
  params: idParams('Purchase entry id'),
  body: z.object({
    supplier: optionalObjectId('Supplier'),
    invoiceNumber: clearableText('Invoice number', { max: 60 }),
    invoiceDate: clearableDate('Invoice date'),
    receivedDate: clearableDate('Received date'),
    dueDate: clearableDate('Due date'),
    notes: clearableText('Notes', { max: 1000 }),
    items: z.array(z.object({
      rate,
      batchRef: clearableText('Batch number', { max: 60 }),
      expiryDate: clearableDate('Expiry date'),
    })).max(100).optional(),
  }),
};

export const listPurchaseEntries = {
  query: z.object({
    supplier: optionalObjectId('Supplier'),
    from: optionalDate('From date'),
    to: optionalDate('To date'),
    status: optionalOneOf(['unpaid', 'partial', 'paid'], 'Payment status'),
    search: optionalText('Search', { max: 100 }),
    isVoided: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
    ...paging,
  }),
};

export const purchaseEntryById = { params: idParams('Purchase entry id') };
export const voidPurchaseEntry = { params: idParams('Purchase entry id'), body: z.object({ voidReason: text('Void reason', { max: 500 }) }) };
export const pendingEntries = { params: z.object({ supplierId: objectId('Supplier') }) };
