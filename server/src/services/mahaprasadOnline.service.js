import { randomBytes } from 'crypto';
import MahaprasadOrder from '../models/MahaprasadOrder.js';
import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import MahaprasadPayment from '../models/MahaprasadPayment.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { localDateStr } from '../utils/dates.js';
import { maskMobile } from '../utils/phone.js';
import { couponImageUrl, couponPageUrl } from '../utils/publicUrl.js';
import { logAction } from './audit.service.js';
import { temple } from './temple.service.js';
import { sendCouponMessage } from './mahaprasadNotify.service.js';
import { sendToPermission } from './push.service.js';
import * as razorpay from './razorpay.service.js';
import {
  adjustPersons, generateCouponNumbers, nanoid, newShareToken, personsTaken, takePersons,
} from './mahaprasadSale.service.js';
import {
  DAY_PROBLEM_TEXT, HOLD_MINUTES, dayProblem, onlineRules, parseDay, priceFor, saleDays,
} from './mahaprasadOnlineRules.js';

// Mahaprasad coupons bought by devotees on the public page (/prasad), paid through Razorpay.
//
//   1. createOrder    the devotee picks a day, plates and mobile: the plates are held on the daily
//                     limit for HOLD_MINUTES and a Razorpay order is made for the amount worked out
//                     here (never the browser's).
//   2. Payment        Razorpay Checkout in the browser. Any of these then confirms it — whichever
//                     comes first; the others find it done:
//                       verifyCheckout       the browser's signed "paid" answer
//                       handleWebhook        Razorpay's own call (our webhook on its dashboard)
//                       sweep / nightly      the server asking Razorpay (browser closed, webhook missed)
//   3. issueForOrder  one coupon for all the plates (one QR — a group coupon when more than one), a
//                     payment record ('online') and the WhatsApp / SMS message, like a counter sale.
// A payment that arrives after the hold ran out still gets its coupon if the day has room and isn't
// over; otherwise the money goes back by itself (refundOrder). Nothing else is refunded — the coupon
// is for its day only (the /refund page).

const ONLINE_USER = { name: 'Online (website)', role: 'devotee' };   // "who" in the audit log
const STUCK_MS = 5 * 60_000;       // an "issuing" this old stopped half-way (server restart)
const GIVE_UP_MS = 30 * 60_000;    // Razorpay not answering: held plates are let go after this anyway
const CHECK_EVERY_MS = 5_000;      // the page asking "paid yet?" reaches Razorpay at most this often
const MAX_OPEN_PER_MOBILE = 3;     // unpaid orders one mobile number can have at once

const newOrderToken = () => randomBytes(12).toString('base64url');
const paise = (rupees) => Math.round(rupees * 100);

/** Switched on in Settings and the keys are on the server; test or live */
export async function onlineState(settings) {
  const s = settings || await Settings.getOrCreate();
  const switchedOn = onlineRules(s).enabled;
  const keysSet = razorpay.razorpayReady();
  return { enabled: switchedOn && keysSet, switchedOn, keysSet, mode: razorpay.razorpayMode(), webhookSet: Boolean(razorpay.razorpayConfig().webhookSecret) };
}

/** The order as the devotee's page sees it (no mobile number in full, no Razorpay ids) */
export function publicOrder(o) {
  return {
    token: o.token,
    status: o.status,
    date: localDateStr(o.date),
    plates: o.plates,
    amount: o.amount,
    mobile: maskMobile(o.mobile),
    expiresAt: o.expiresAt,
    couponPath: o.status === 'paid' && o.shareToken ? `/m/${o.shareToken}` : null,
    refundReason: o.status === 'refunded' ? o.refundReason : undefined,
  };
}

// ── The public page ──────────────────────────────────────────────────────────

/** Days on sale with their price and plates left, the plate limit, and the temple's details */
export async function publicInfo(now = new Date()) {
  const settings = await Settings.getOrCreate();
  const rules = onlineRules(settings);
  const state = await onlineState(settings);
  const cap = settings.mahaprasadDailyCap || 0;
  // The days and prices also when switched off: the /pricing page lists them
  const days = await Promise.all(saleDays(rules, now).map(async (d) => {
    if (!state.enabled || d.problem || !cap) return { ...d, left: null };
    const left = Math.max(0, cap - await personsTaken(parseDay(d.date)));
    return { ...d, left, problem: left === 0 ? 'full' : '' };
  }));
  return {
    enabled: state.enabled,
    mode: state.mode,
    maxPlates: rules.maxPlates,
    holdMinutes: HOLD_MINUTES,
    validityDays: settings.mahaprasadCouponValidityDays ?? 1,
    days: days.map((d) => ({ ...d, problemText: d.problem ? DAY_PROBLEM_TEXT[d.problem] : '' })),
    temple: temple(),
  };
}

/** Step 1: holds the plates and makes the Razorpay order. Returns the order and the checkout's options. */
export async function createOrder({ date: day, plates, mobile, name = '', ip }, now = new Date()) {
  const settings = await Settings.getOrCreate();
  if (!(await onlineState(settings)).enabled) {
    throw new ApiError(503, 'Online Mahaprasad coupons are not available right now — please buy at the temple counter');
  }
  const rules = onlineRules(settings);
  const problem = dayProblem(day, rules, now);
  if (problem) throw new ApiError(400, DAY_PROBLEM_TEXT[problem], [{ code: problem }]);
  if (!Number.isInteger(plates) || plates < 1 || plates > rules.maxPlates) {
    throw new ApiError(400, `Choose 1 to ${rules.maxPlates} plates`);
  }
  const open = await MahaprasadOrder.countDocuments({ mobile, status: 'pending', expiresAt: { $gt: now } });
  if (open >= MAX_OPEN_PER_MOBILE) {
    throw new ApiError(429, 'This mobile number already has payments waiting — finish one of them, or try again in 15 minutes');
  }

  const date = parseDay(day);
  const pricePerPlate = priceFor(rules, date);
  const amount = pricePerPlate * plates;
  try {
    await takePersons(date, plates, settings.mahaprasadDailyCap || 0);
  } catch (err) {
    if (err.errors?.[0]?.code !== 'cap') throw err;
    const left = err.errors[0].remaining || 0;
    throw new ApiError(409, left > 0 ? `Only ${left} plate${left === 1 ? '' : 's'} left for this day` : DAY_PROBLEM_TEXT.full, [{ code: 'full', left }]);
  }

  let order;
  try {
    order = await MahaprasadOrder.create({
      token: newOrderToken(), date, plates, pricePerPlate, amount, mobile, name,
      status: 'pending', personsHeld: true, expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000), ip,
      ...(razorpay.razorpayMode() === 'test' && { testMode: true }),
    });
    const rz = await razorpay.createOrder({
      amountPaise: paise(amount),
      receipt: `MP-${order.token.slice(0, 16)}`,
      notes: { source: razorpay.ORDER_SOURCE, order: order.token, date: day, plates: String(plates) },
    });
    order.razorpayOrderId = rz.id;
    await order.save();
  } catch (err) {
    logger.error('Mahaprasad online: order not created', { order: order?.token, error: razorpay.razorpayErrorText(err) });
    if (order) await MahaprasadOrder.updateOne({ _id: order._id }, { $set: { status: 'failed', personsHeld: false } }).catch(() => {});
    await adjustPersons(date, -plates).catch((e) => logger.error('Mahaprasad online: plates not given back', { error: e.message }));
    throw new ApiError(502, 'Online payment is not available right now — please try again in a few minutes');
  }

  return { order: publicOrder(order), checkout: checkoutOptions(order, now) };
}

/** Razorpay Checkout's options for an unpaid order (the browser adds its handlers); null once its time is up */
function checkoutOptions(order, now = new Date()) {
  const secondsLeft = Math.floor((order.expiresAt - now) / 1000) - 30;
  if (order.status !== 'pending' || !order.razorpayOrderId || secondsLeft < 60) return null;
  return {
    key: razorpay.razorpayConfig().keyId,
    order_id: order.razorpayOrderId,
    amount: paise(order.amount),
    currency: 'INR',
    name: temple().name,
    description: `Mahaprasad coupon — ${order.plates} plate${order.plates === 1 ? '' : 's'}, ${localDateStr(order.date)}`,
    prefill: { contact: `+91${order.mobile}`, ...(order.name && { name: order.name }) },
    notes: { order: order.token },
    timeout: secondsLeft,   // Checkout closes itself before the hold runs out
  };
}

/** Step 2a: the browser's "paid" answer. Never fails for a genuine payment — the checks finish it later. */
export async function verifyCheckout(token, { orderId, paymentId, signature }) {
  const order = await MahaprasadOrder.findOne({ token });
  if (!order) throw new ApiError(404, 'Order not found');
  if (['paid', 'refunded'].includes(order.status)) return publicOrder(order);
  if (orderId !== order.razorpayOrderId || !razorpay.paymentSignatureOk({ orderId, paymentId, signature })) {
    logger.warn('Mahaprasad online: payment answer did not verify', { order: token, paymentId });
    throw new ApiError(400, 'The payment could not be verified. If money was taken, your coupon will still come — or call the temple office.');
  }
  try {
    return publicOrder(await confirmPayment(order, paymentId, 'checkout'));
  } catch (err) {
    logger.error('Mahaprasad online: confirming a paid order failed — the check will finish it', { order: token, paymentId, error: razorpay.razorpayErrorText(err) });
    return publicOrder(await MahaprasadOrder.findById(order._id));
  }
}

/** The page asking about its order. With `check`, an unpaid order is looked up at Razorpay (a few seconds apart at most). */
export async function getOrder(token, { check = false } = {}) {
  let order = await MahaprasadOrder.findOne({ token });
  if (!order) throw new ApiError(404, 'Order not found');
  if (check && ['pending', 'expired'].includes(order.status) && order.razorpayOrderId && razorpay.razorpayReady()) {
    const now = new Date();
    const mine = await MahaprasadOrder.findOneAndUpdate(
      { _id: order._id, $or: [{ checkedAt: { $exists: false } }, { checkedAt: { $lt: new Date(now - CHECK_EVERY_MS) } }] },
      { $set: { checkedAt: now } },
    );
    if (mine) {
      try {
        order = await syncOrder(order, 'page');
      } catch (err) {
        logger.warn('Mahaprasad online: could not ask Razorpay about an order', { order: token, error: razorpay.razorpayErrorText(err) });
      }
    }
  }
  // Still unpaid with time left: the page can open the payment again (after a reload)
  return { ...publicOrder(order), checkout: checkoutOptions(order) };
}

/** Step 2b: Razorpay's webhook (already checked as genuine). The website's payments come here too and are skipped. */
export async function handleWebhook(event) {
  if (!['payment.captured', 'payment.authorized', 'order.paid'].includes(event?.event)) return 'ignored';
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id || event.payload?.order?.entity?.id;
  if (!orderId || !payment?.id) return 'ignored';
  const order = await MahaprasadOrder.findOne({ razorpayOrderId: orderId });
  if (!order) return 'not_ours';
  await confirmPayment(order, payment.id, 'webhook');
  return 'done';
}

// ── Confirming a payment ─────────────────────────────────────────────────────

/** The payment, captured — or null when it didn't go through. Captures it if the account doesn't do that by itself. */
async function capturedPayment(order, paymentId) {
  let p = await razorpay.fetchPayment(paymentId);
  if (p.order_id !== order.razorpayOrderId) throw new Error(`payment ${paymentId} is for another order`);
  if (p.status === 'authorized') p = await razorpay.capturePayment(p.id, p.amount);
  if (p.status !== 'captured') return null;
  if (p.amount !== paise(order.amount)) {
    logger.error('Mahaprasad online: paid amount differs from the order', { order: order.token, paid: p.amount, expected: paise(order.amount) });
    return null;
  }
  return p;
}

/** Issues the coupon for a genuine payment (any source). Safe to call twice: only one call issues. */
export async function confirmPayment(order, paymentId, source) {
  if (!['pending', 'expired'].includes(order.status)) return order;
  const payment = await capturedPayment(order, paymentId);
  if (!payment) return order;
  return issueForOrder(order, payment, source);
}

async function syncOrder(order, source) {
  const payments = await razorpay.orderPayments(order.razorpayOrderId);
  const paid = payments.find((p) => p.status === 'captured') || payments.find((p) => p.status === 'authorized');
  return paid ? confirmPayment(order, paid.id, source) : order;
}

const reopen = (order, status) =>
  MahaprasadOrder.updateOne({ _id: order._id, status: 'issuing' }, { $set: { status }, $unset: { issuingSince: 1 } });

function sendCoupon(order, number) {
  sendCouponMessage({
    mobile: order.mobile, numbers: [number], date: order.date, persons: order.plates,
    link: couponPageUrl(order.shareToken), image: couponImageUrl(order.shareToken),
  });
}

async function issueForOrder(order, payment, source) {
  const batchId = `on-${nanoid()}`;
  const shareToken = newShareToken();
  // One confirmation at a time: the others find the order no longer pending / expired
  const prev = await MahaprasadOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ['pending', 'expired'] } },
    { $set: {
      status: 'issuing', issuingSince: new Date(), batchId, shareToken,
      paymentId: payment.id, method: payment.method || '',
      paidAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
    } },
    { returnDocument: 'before' },
  );
  if (!prev) return MahaprasadOrder.findById(order._id);

  if (!prev.personsHeld) {
    // Paid after its hold ran out: the plates are taken again if the day is still ahead and has room
    const settings = await Settings.getOrCreate();
    try {
      if (localDateStr(prev.date) < localDateStr()) throw new ApiError(400, 'The Mahaprasad day had already passed when the payment arrived');
      await takePersons(prev.date, prev.plates, settings.mahaprasadDailyCap || 0);
    } catch (err) {
      if (!(err instanceof ApiError)) { await reopen(prev, 'expired'); throw err; }
      const reason = err.errors?.[0]?.code === 'cap' ? 'All coupons for the day were sold before the payment arrived' : err.message;
      return refundOrder(prev, payment, reason);
    }
    await MahaprasadOrder.updateOne({ _id: prev._id }, { $set: { personsHeld: true } });
  }

  let number;
  let coupon;
  try {
    [number] = await generateCouponNumbers(prev.date, 1);
    const issuedAt = new Date();
    // Paid with test keys: marked, so the hall refuses it (refuseUnredeemable) and it's told apart
    const test = prev.testMode ? { testMode: true } : {};
    coupon = await MahaprasadCoupon.create({
      couponNumber: number, date: prev.date, type: 'paid', amount: prev.amount, occasion: '',
      mobile: prev.mobile, status: 'issued', channel: 'online', issuedAt, batchId,
      groupSize: prev.plates, isGroup: prev.plates > 1, shareToken, ...test,
    });
    await MahaprasadPayment.create({
      batchId, date: prev.date, couponNumbers: [number], qty: prev.plates, mobile: prev.mobile,
      totalDue: prev.amount, paymentMode: 'online', amountReceived: prev.amount, issuedAt,
      razorpayPaymentId: payment.id, razorpayOrderId: prev.razorpayOrderId, ...test,
    });
  } catch (err) {
    logger.error('Mahaprasad online: coupon not issued for a paid order — will try again', { order: prev.token, error: err.message });
    await MahaprasadCoupon.deleteMany({ batchId }).catch(() => {});
    await MahaprasadPayment.deleteMany({ batchId }).catch(() => {});
    await reopen(prev, 'pending');   // plates still held; the next check retries
    throw err;
  }

  const done = await MahaprasadOrder.findOneAndUpdate(
    { _id: prev._id },
    { $set: { status: 'paid' }, $unset: { issuingSince: 1 } },
    { returnDocument: 'after' },
  );
  logAction(null, {
    user: ONLINE_USER, action: 'mahaprasad.online_sale', entity: 'MahaprasadCoupon', entityId: batchId, entityRef: coupon._id,
    after: { coupon: number, persons: prev.plates, date: localDateStr(prev.date), mobile: prev.mobile, amount: prev.amount, paymentMode: 'online' },
    meta: { razorpayPaymentId: payment.id, method: payment.method, confirmedBy: source },
  });
  sendCoupon(done, number);
  return done;
}

async function refundOrder(order, payment, reason) {
  try {
    const refund = await razorpay.refundPayment(payment.id, { notes: { reason: reason.slice(0, 250), order: order.token } });
    const done = await MahaprasadOrder.findOneAndUpdate(
      { _id: order._id },
      { $set: { status: 'refunded', refundId: refund.id, refundedAt: new Date(), refundReason: reason }, $unset: { issuingSince: 1 } },
      { returnDocument: 'after' },
    );
    logger.warn('Mahaprasad online: payment refunded', { order: order.token, reason, refundId: refund.id });
    logAction(null, {
      user: ONLINE_USER, action: 'mahaprasad.online_refund', entity: 'MahaprasadOrder', entityId: order.token, entityRef: order._id,
      meta: { reason, amount: order.amount, razorpayPaymentId: payment.id, refundId: refund.id },
    });
    return done;
  } catch (err) {
    logger.error('Mahaprasad online: refund failed — the nightly check tries again', { order: order.token, error: razorpay.razorpayErrorText(err) });
    await reopen(order, 'expired');
    throw err;
  }
}

// ── The server's own checks ──────────────────────────────────────────────────

async function expireOrder(order) {
  const prev = await MahaprasadOrder.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    { $set: { status: 'expired', personsHeld: false } },
    { returnDocument: 'before' },
  );
  if (prev?.personsHeld) {
    await adjustPersons(prev.date, -prev.plates)
      .catch((err) => logger.error('Mahaprasad online: plates of an expired order not given back', { order: prev.token, error: err.message }));
  }
}

// An "issuing" that stopped half-way: finished if its payment record was saved, otherwise undone for a retry
async function recoverStuck(order) {
  if (order.batchId && await MahaprasadPayment.exists({ batchId: order.batchId })) {
    const done = await MahaprasadOrder.findOneAndUpdate(
      { _id: order._id, status: 'issuing' },
      { $set: { status: 'paid' }, $unset: { issuingSince: 1 } },
      { returnDocument: 'after' },
    );
    const coupon = done && await MahaprasadCoupon.findOne({ batchId: order.batchId }).select('couponNumber').lean();
    if (coupon) sendCoupon(done, coupon.couponNumber);
    return;
  }
  if (order.batchId) await MahaprasadCoupon.deleteMany({ batchId: order.batchId });
  await reopen(order, order.personsHeld ? 'pending' : 'expired');
}

let sweeping = false;

/** Every few minutes: holds that ran out (paid after all? else plates given back) and stuck confirmations */
export async function sweepOnlineOrders(now = new Date()) {
  if (sweeping) return;
  sweeping = true;
  try {
    const stuck = await MahaprasadOrder.find({ status: 'issuing', issuingSince: { $lt: new Date(now - STUCK_MS) } }).limit(20);
    for (const order of stuck) {
      await recoverStuck(order).catch((err) => logger.error('Mahaprasad online: stuck order not recovered', { order: order.token, error: err.message }));
    }

    const stale = await MahaprasadOrder.find({ status: 'pending', expiresAt: { $lt: now } }).limit(100);
    for (const order of stale) {
      if (order.razorpayOrderId && razorpay.razorpayReady()) {
        try {
          const after = await syncOrder(order, 'check');
          if (after.status !== 'pending') continue;
        } catch (err) {
          if (now - order.expiresAt < GIVE_UP_MS) {
            logger.warn('Mahaprasad online: could not check an unpaid order — trying again shortly', { order: order.token, error: razorpay.razorpayErrorText(err) });
            continue;
          }
        }
      }
      await expireOrder(order);
    }
  } finally {
    sweeping = false;
  }
}

let lastKeyCheck = null;
/** { result: 'ok' | 'bad_key' | 'unreachable' | 'off', at } of the last nightly check — for Settings */
export const lastRazorpayCheck = () => lastKeyCheck;

/**
 * Nightly: is the key still accepted (the website's builder could regenerate it), and did any
 * order of the last two days get paid without its coupon (browser closed and the webhook missed)?
 */
export async function nightlyOnlineCheck(now = new Date()) {
  const result = await razorpay.checkKeys();
  lastKeyCheck = { result, at: now };
  if (result === 'off') return;
  if (result === 'bad_key') {
    logger.error('Razorpay refuses the key in the server settings — online Mahaprasad payments are failing. Was the key regenerated on the Razorpay dashboard?');
    await sendToPermission('masters:write', {
      title: 'Online Mahaprasad payments stopped',
      body: 'Razorpay no longer accepts the key on the server. If the key was regenerated on the Razorpay dashboard, the new key must be put on the server.',
      url: '/settings?tab=mahaprasad',
    }).catch(() => {});
    return;
  }
  if (result !== 'ok') {
    logger.warn('Razorpay could not be reached for the nightly check');
    return;
  }

  const open = await MahaprasadOrder.find({
    createdAt: { $gte: new Date(now.getTime() - 2 * 86_400_000) },
    status: { $in: ['pending', 'expired'] },
    razorpayOrderId: { $exists: true },
  });
  const found = [];
  for (const order of open) {
    try {
      const after = await syncOrder(order, 'nightly');
      if (after.status !== order.status) found.push(`${order.token} → ${after.status}`);
    } catch (err) {
      logger.error('Mahaprasad online: nightly check of an order failed', { order: order.token, error: razorpay.razorpayErrorText(err) });
    }
  }
  if (found.length) logger.warn('Mahaprasad online: payments found by the nightly check', { found });
}
