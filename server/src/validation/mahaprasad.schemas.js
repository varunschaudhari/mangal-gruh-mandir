import { z } from 'zod';
import {
  number, optionalBoolean, optionalDate, optionalNumber, optionalObjectId, optionalOneOf, optionalText, text,
} from './common.js';
import { normaliseMobile } from '../utils/phone.js';

// Mahaprasad counter. Kept lenient on optional fields: phones running an older app version
// still sync. Prices, the daily limit and change are worked out by the server.

const couponType = optionalOneOf(['paid', 'free'], 'Coupon type');
const couponNumber = text('Coupon number', { max: 40 });
const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
// The devotee's mobile number — required for every issue; cleaned to 10 digits.
const mobile = z.preprocess((v) => normaliseMobile(v), z.string().min(1, 'Enter the devotee’s 10-digit mobile number'));

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
    mobile,
    // Free Seva: the devotee's name. The counter screen requires it; optional here so counters
    // still on an older app version can issue until they update.
    name: optionalText('Name', { max: 80 }),
  }),
};

export const couponByNumber = { params: z.object({ number: couponNumber }) };

// ── The public page (/prasad): devotees buying online. The price, plates left and which days are
// on sale are the server's (services/mahaprasadOnline.service.js).
const orderToken = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/, 'Order not found') });

export const onlineOrder = {
  body: z.object({
    date: text('Date', { max: 10 }),
    plates: number('Plates', { integer: true, min: 1, max: 50 }),
    mobile: z.preprocess((v) => normaliseMobile(v), z.string().min(1, 'Enter your 10-digit mobile number')),
    name: optionalText('Name', { max: 60 }),
  }),
};

export const onlineOrderByToken = { params: orderToken };

export const onlineVerify = {
  params: orderToken,
  body: z.object({
    razorpay_order_id: text('Order', { max: 64 }),
    razorpay_payment_id: text('Payment', { max: 64 }),
    razorpay_signature: text('Signature', { max: 128 }),
  }),
};

export const onlineOrderList = {
  query: z.object({
    from: optionalDate('From'),
    to: optionalDate('To'),
    status: optionalOneOf(['pending', 'issuing', 'paid', 'expired', 'refunded', 'failed'], 'Status'),
  }),
};

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
      paymentMode: optionalOneOf(['cash', 'upi'], 'Payment mode'),
      // Optional here: coupons issued offline on an older app version have none.
      mobile: z.preprocess((v) => normaliseMobile(v), z.string()).optional(),
      name: optionalText('Name', { max: 80 }),
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
    basedOn: optionalDate('Drawer version'),   // the drawer's updatedAt when the form was filled in
  }),
};
export const adjustDrawer = {
  body: z.object({
    date: optionalDate('Date'),
    denomination: number('Denomination').refine((d) => drawerDenoms.includes(d), 'Invalid denomination'),
    delta: number('Change', { integer: true, min: -100000, max: 100000 }),
  }),
};

export const batchById = { params: z.object({ batchId: text('Batch', { max: 40 }) }) };

export const voidBatch = {
  params: z.object({ batchId: text('Batch', { max: 40 }) }),
  body: z.object({ reason: text('Reason', { max: 200 }) }),
};
