import MahaprasadOrder from '../models/MahaprasadOrder.js';
import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { appUrl, couponPageUrl } from '../utils/publicUrl.js';
import { writeOnlinePoster } from '../services/mahaprasadPoster.service.js';
import * as online from '../services/mahaprasadOnline.service.js';
import { webhookSignatureOk } from '../services/razorpay.service.js';
import { writeOnlineReceipt } from '../services/mahaprasadReceiptPdf.service.js';

// Mahaprasad coupons bought online (services/mahaprasadOnline.service.js): the public page's
// endpoints (no sign-in), Razorpay's webhook, and the staff list of online orders.

const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

// GET /api/public/mahaprasad-online — days on sale, prices, plates left
export const getOnlineInfo = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await online.publicInfo()));
});

// POST /api/public/mahaprasad-online/orders  { date, plates, mobile, name }
export const createOnlineOrder = asyncHandler(async (req, res) => {
  const { date, plates, mobile, name } = req.body;
  res.status(201).json(new ApiResponse(201, await online.createOrder({ date, plates, mobile, name, ip: clientIp(req) })));
});

// GET /api/public/mahaprasad-online/orders/:token  (?check=1 also asks Razorpay when not paid yet)
export const getOnlineOrder = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await online.getOrder(req.params.token, { check: req.query.check === '1' })));
});

// POST /api/public/mahaprasad-online/orders/:token/verify — Razorpay Checkout's success answer
export const verifyOnlineOrder = asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  res.json(new ApiResponse(200, await online.verifyCheckout(req.params.token, { orderId, paymentId, signature })));
});

// POST /api/webhooks/razorpay — mounted before the JSON parser (index.js): the signature is over
// the raw body. Answered at once (Razorpay waits only a few seconds and retries on errors); the
// payment is then handled in the background, and the server's own checks finish anything missed.
export const razorpayWebhook = (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!webhookSignatureOk(raw, req.get('x-razorpay-signature'))) {
    logger.warn('Razorpay webhook: signature did not match (or RAZORPAY_WEBHOOK_SECRET is not set)');
    return res.status(400).json({ success: false, message: 'Signature did not match' });
  }
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ success: false, message: 'Not JSON' }); }
  res.json({ success: true });
  online.handleWebhook(event)
    .catch((err) => logger.error('Razorpay webhook: payment not processed — the checks will finish it', { event: event.event, error: err.message }));
};

// GET /api/public/mahaprasad/:token/receipt.pdf — no sign-in: the payment receipt of a coupon bought
// online, from the devotee's coupon page. Counter sales have no such receipt (the paper slip is it).
export const onlineReceiptPdf = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new ApiError(404, 'Receipt not found');
  const [order, coupon, settings] = await Promise.all([
    MahaprasadOrder.findOne({ shareToken: token, status: 'paid' }).lean(),
    MahaprasadCoupon.findOne({ shareToken: token, channel: 'online' }).select('couponNumber').lean(),
    Settings.getOrCreate(),
  ]);
  if (!order || !coupon) throw new ApiError(404, 'Receipt not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="mahaprasad-receipt-${coupon.couponNumber}.pdf"`);
  writeOnlineReceipt(res, { order: { ...order, couponNumber: coupon.couponNumber }, validityDays: settings.mahaprasadCouponValidityDays ?? 1 });
});

// GET /api/mahaprasad/online-poster.pdf — the A4 poster with the QR to the public page, to print
export const onlinePosterPdf = asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="mahaprasad-online-qr-poster.pdf"');
  await writeOnlinePoster(res, { url: `${appUrl()}/prasad` });
});

// GET /api/mahaprasad/online-orders?from&to&status — every online order, to match with Razorpay
export const listOnlineOrders = asyncHandler(async (req, res) => {
  const { from, to, status } = req.query;
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) { const s = new Date(from); s.setHours(0, 0, 0, 0); filter.createdAt.$gte = s; }
    if (to)   { const e = new Date(to);   e.setHours(23, 59, 59, 999); filter.createdAt.$lte = e; }
  }
  if (status) filter.status = status;

  const [orders, state] = await Promise.all([
    MahaprasadOrder.find(filter).sort({ createdAt: -1 }).limit(1000).lean(),
    online.onlineState(),
  ]);
  const batchIds = orders.map((o) => o.batchId).filter(Boolean);
  const coupons = await MahaprasadCoupon.find({ batchId: { $in: batchIds } }).select('batchId couponNumber status').lean();
  const couponOf = new Map(coupons.map((c) => [c.batchId, c]));

  const totals = { paid: 0, paidCount: 0, refunded: 0, refundedCount: 0, plates: 0 };
  const rows = orders.map((o) => {
    if (o.status === 'paid') { totals.paid += o.amount; totals.paidCount += 1; totals.plates += o.plates; }
    if (o.status === 'refunded') { totals.refunded += o.amount; totals.refundedCount += 1; }
    const coupon = o.status === 'paid' ? couponOf.get(o.batchId) : null;
    return {
      _id: o._id, token: o.token, createdAt: o.createdAt, date: o.date, plates: o.plates, amount: o.amount,
      mobile: o.mobile, name: o.name, status: o.status, paymentId: o.paymentId, method: o.method, paidAt: o.paidAt,
      razorpayOrderId: o.razorpayOrderId, refundId: o.refundId, refundedAt: o.refundedAt, refundReason: o.refundReason,
      couponNumber: coupon?.couponNumber, couponStatus: coupon?.status, testMode: Boolean(o.testMode),
      couponUrl: o.status === 'paid' && o.shareToken ? couponPageUrl(o.shareToken) : null,
    };
  });
  res.json(new ApiResponse(200, { orders: rows, totals, state }));
});
