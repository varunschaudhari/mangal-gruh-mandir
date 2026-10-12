import { z } from 'zod';
import {
  number, optionalBoolean, optionalDate, optionalNumber, optionalObjectId, optionalOneOf, optionalText, text,
} from './common.js';

// Mahaprasad counter. Kept lenient on optional fields: phones running an older app version
// still sync. Prices, the daily limit and change are worked out by the server.

const couponType = optionalOneOf(['paid', 'free'], 'Coupon type');
const couponNumber = text('Coupon number', { max: 40 });
const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export const issueCoupons = {
  body: z.object({
    quantity: optionalNumber('Quantity', { integer: true, min: 1, max: 200 }),
    type: couponType,
    occasion: optionalText('Occasion', { max: 150 }),
    date: optionalDate('Date'),
    isGroup: optionalBoolean('Group coupon'),
    paymentMode: optionalOneOf(['cash', 'upi'], 'Payment mode'),
    amountReceived: optionalNumber('Amount received', { min: 0, max: 1e7 }),
    receivedNotes: z.array(z.preprocess((v) => (typeof v === 'string' ? Number(v) : v),
      z.number().refine((n) => DENOMS.includes(n), 'Unknown note or coin'))).max(500).optional(),
  }),
};

export const couponByNumber = { params: z.object({ number: couponNumber }) };

export const reserveOffline = {
  body: z.object({ qty: optionalNumber('Quantity', { integer: true, min: 1, max: 500 }), date: optionalDate('Date') }),
};

export const syncOffline = {
  body: z.object({
    issued: z.array(z.object({
      couponNumber,
      type: couponType,
      amount: optionalNumber('Amount', { min: 0, max: 1e7 }),
      occasion: optionalText('Occasion', { max: 150 }),
      issuedById: optionalObjectId('Issued by'),
      issuedAt: optionalDate('Issued at'),
      batchId: optionalText('Batch', { max: 40 }),
    })).max(5000).optional(),
    redeemed: z.array(z.object({
      couponNumber,
      redeemedById: optionalObjectId('Redeemed by'),
      redeemedAt: optionalDate('Redeemed at'),
    })).max(5000).optional(),
  }),
};

const drawerDenoms = [500, 100, 50, 20, 10, 5, 2, 1];
export const setOpeningFloat = {
  body: z.object({
    date: optionalDate('Date'),
    counts: z.record(z.string(), optionalNumber('Count', { integer: true, min: 0, max: 100000 }), { error: 'counts object required' }),
  }),
};
export const adjustDrawer = {
  body: z.object({
    date: optionalDate('Date'),
    denomination: number('Denomination').refine((d) => drawerDenoms.includes(d), 'Invalid denomination'),
    delta: number('Change', { integer: true, min: -100000, max: 100000 }),
  }),
};

export const voidBatch = { params: z.object({ batchId: text('Batch', { max: 40 }) }) };
