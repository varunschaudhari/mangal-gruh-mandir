import { z } from 'zod';
import { PAYMENT_MODES_LIST } from '../models/SupplierPayment.js';
import {
  clearableText, idParams, number, objectId, optionalBoolean, optionalDate, optionalNumber,
  optionalObjectId, optionalOneOf, optionalText, text,
} from './common.js';

// Supplier payments. Business rules (split must match the amount, no overpaying, approval
// rules) stay in the controller; these check the shape of what is sent.

const params = idParams('Payment id');
const money = (label) => optionalNumber(label, { min: 0, max: 1e9 });

export const createPayment = {
  body: z.object({
    supplier: objectId('Supplier'),
    invoices: z.array(z.object({
      purchaseEntryId: optionalObjectId('Purchase entry'),
      invoiceNumber: optionalText('Invoice number', { max: 60 }),
      invoiceDate: optionalDate('Invoice date'),
      invoiceTotal: money('Invoice total'),
      paidAmount: number('Amount for an invoice', { min: 0, max: 1e9 }),
    }), { error: 'Invoices must be a list' }).max(100, 'At most 100 invoices in one payment').optional(),
    totalAmount: money('Amount'),
    advanceApplied: money('Advance applied'),
    paymentDate: optionalDate('Payment date'),
    paymentMode: optionalOneOf(PAYMENT_MODES_LIST, 'Payment mode'),
    referenceNumber: optionalText('Reference number', { max: 100 }),
    bankName: optionalText('Bank', { max: 200 }),
    selectedBankAccountId: optionalObjectId('Bank account'),
    notes: optionalText('Notes', { max: 1000 }),
    force: optionalBoolean('Confirm duplicate'),
  }),
};

export const paymentById = { params };
export const approvePayment = { params, body: z.object({ approvalNote: optionalText('Approval note', { max: 500 }) }) };
export const bulkApprove = {
  body: z.object({
    ids: z.array(objectId('Payment id'), { error: 'No payment IDs provided' }).min(1, 'No payment IDs provided').max(200, 'At most 200 payments at a time'),
    approvalNote: optionalText('Approval note', { max: 500 }),
  }),
};
export const rejectPayment = { params, body: z.object({ rejectionReason: text('Rejection reason', { max: 500 }) }) };
export const voidPayment = { params, body: z.object({ voidReason: text('Void reason', { max: 500 }) }) };
export const resubmitPayment = {
  params,
  body: z.object({
    totalAmount: money('Amount'),
    paymentDate: optionalDate('Payment date'),
    paymentMode: optionalOneOf(PAYMENT_MODES_LIST, 'Payment mode'),
    referenceNumber: clearableText('Reference number', { max: 100 }),
    bankName: clearableText('Bank', { max: 200 }),
    notes: clearableText('Notes', { max: 1000 }),
  }),
};
export const bySupplier = { params: z.object({ supplierId: objectId('Supplier') }) };
