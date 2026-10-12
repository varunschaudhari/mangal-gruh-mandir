import { z } from 'zod';
import { ASSET_CONDITIONS, ID_PROOF_TYPES } from '../models/AssetTransaction.js';
import {
  date, idParams, number, objectId, oneOf, optionalBoolean, optionalDate, optionalNumber,
  optionalObjectId, optionalOneOf, optionalText,
} from './common.js';

// Lending temple items: single borrow requests, group borrows (several items at once) and the
// numbered units of each item. Availability, approver and date limits stay in the controllers.

const params = idParams('Borrow id');
const borrowerType = optionalOneOf(['staff', 'external'], 'Borrower type');
const externalBorrower = z.object({
  name: optionalText('Borrower name', { max: 150 }),
  phone: optionalText('Borrower phone', { max: 20 }),
  address: optionalText('Borrower address', { max: 300 }),
  idProofType: optionalOneOf(ID_PROOF_TYPES, 'ID proof type'),
  idProofNumber: optionalText('ID proof number', { max: 40 }),
}).optional();
const condition = (label) => optionalOneOf(ASSET_CONDITIONS, label);
const notes = optionalText('Notes', { max: 1000 });

export const createBorrowRequest = {
  body: z.object({
    asset: objectId('Item'),
    borrower: optionalObjectId('Borrower'),
    borrowerType,
    externalBorrower,
    quantityBorrowed: number('Quantity', { integer: true, min: 1, max: 1000 }),
    expectedReturnDate: date('Return date'),
    approvedBy: objectId('Approver'),
    notes,
  }),
};

export const checkout = { params, body: z.object({ conditionAtCheckout: oneOf(ASSET_CONDITIONS, 'Condition at handover') }) };

export const returnAsset = {
  params,
  body: z.object({
    conditionAtReturn: oneOf(ASSET_CONDITIONS, 'Condition at return'),
    damageNotes: optionalText('Damage notes', { max: 1000 }),
    fineApplied: optionalBoolean('Fine applied'),
    fineAmount: optionalNumber('Fine amount', { min: 0, max: 1e7 }),
    fineWaived: optionalBoolean('Fine waived'),
    fineWaivedReason: optionalText('Waiver reason', { max: 500 }),
    actualReturnDate: optionalDate('Return date'),
  }),
};

export const extend = {
  params,
  body: z.object({ newReturnDate: date('New return date'), approvedBy: objectId('Approver'), notes }),
};

export const cancel = { params, body: z.object({ cancellationReason: optionalText('Reason', { max: 500 }) }) };
export const markLost = { params, body: z.object({ lostReason: optionalText('Reason', { max: 500 }) }) };
export const settleFine = {
  params,
  body: z.object({ action: oneOf(['paid', 'waived'], 'Action'), waivedReason: optionalText('Waiver reason', { max: 500 }) }),
};
export const damageStatus = {
  params,
  body: z.object({ damageStatus: oneOf(['none', 'reported', 'assessed', 'repaired'], 'Damage status') }),
};
export const borrowById = { params };

// ── Group borrows ───────────────────────────────────────────────────────────
const groupParams = idParams('Borrow group id');

export const createGroup = {
  body: z.object({
    borrower: optionalObjectId('Borrower'),
    borrowerType,
    externalBorrower,
    approvedBy: objectId('Approver'),
    expectedReturnDate: date('Return date'),
    notes,
    items: z.array(z.object({
      asset: objectId('Item'),
      quantity: number('Quantity', { integer: true, min: 1, max: 1000 }),
    }), { error: 'Items must be a list' }).min(1, 'At least one item is required').max(50, 'At most 50 items at a time'),
  }),
};
export const groupById = { params: groupParams };
export const checkoutGroup = { params: groupParams, body: z.object({ conditionAtCheckout: condition('Condition at handover') }) };
export const extendGroup = {
  params: groupParams,
  body: z.object({ newReturnDate: date('New return date'), approvedBy: objectId('Approver'), notes }),
};
export const cancelGroup = { params: groupParams, body: z.object({ cancellationReason: optionalText('Reason', { max: 500 }) }) };

// ── Numbered units ──────────────────────────────────────────────────────────
export const updateUnit = {
  params: idParams('Unit id'),
  body: z.object({
    condition: optionalOneOf(['good', 'fair', 'damaged', 'lost'], 'Condition'),
    conditionNotes: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(500).optional()),
    isActive: optionalBoolean('Active'),
  }),
};
export const unitById = { params: idParams('Unit id') };
export const generateUnits = {
  body: z.object({
    assetId: objectId('Item'),
    startNum: optionalNumber('From number', { integer: true, min: 1, max: 10000 }),
    endNum: optionalNumber('To number', { integer: true, min: 1, max: 10000 }),
  }),
};
