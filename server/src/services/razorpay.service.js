import crypto from 'crypto';
import axios from 'axios';

// Razorpay — online payments on the public Mahaprasad page. The keys are the trust's, from its
// Razorpay dashboard, and live only in the server's .env (not in Settings, so not in the database
// or its backups):
//   RAZORPAY_KEY_ID          rzp_test_… while testing, rzp_live_… at go-live
//   RAZORPAY_KEY_SECRET      shown by Razorpay only once, when the key was made
//   RAZORPAY_WEBHOOK_SECRET  the secret typed in when our webhook was added (Account & Settings → Webhooks)
// The trust's account is shared with its website (built by NGOGuru) and Razorpay allows one live key
// per account, so the key must never be regenerated: the website would stop taking payments. Every
// order made here carries notes.source = ORDER_SOURCE; payments on other orders (the website's)
// are left alone by the webhook and the nightly check.

// RAZORPAY_API_URL only for trying the flow against a local stand-in; never set on the server
const API = process.env.RAZORPAY_API_URL?.trim() || 'https://api.razorpay.com/v1';
export const ORDER_SOURCE = 'mgm-mahaprasad';

export const razorpayConfig = () => ({
  keyId: process.env.RAZORPAY_KEY_ID?.trim() || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '',
});

/** Both keys are set */
export const razorpayReady = () => { const c = razorpayConfig(); return Boolean(c.keyId && c.keySecret); };

/** 'live' | 'test' | '' — from the key id */
export const razorpayMode = (keyId = razorpayConfig().keyId) =>
  (keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : '');

function client() {
  const { keyId, keySecret } = razorpayConfig();
  if (!keyId || !keySecret) throw new Error('Razorpay keys are not set (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  return axios.create({ baseURL: API, auth: { username: keyId, password: keySecret }, timeout: 15000 });
}

/** Razorpay's own explanation, for the logs */
export const razorpayErrorText = (err) => err.response?.data?.error?.description || err.message;

export const createOrder = async ({ amountPaise, receipt, notes }) =>
  (await client().post('/orders', { amount: amountPaise, currency: 'INR', receipt, notes })).data;

export const orderPayments = async (orderId) =>
  (await client().get(`/orders/${encodeURIComponent(orderId)}/payments`)).data.items || [];

export const fetchPayment = async (paymentId) =>
  (await client().get(`/payments/${encodeURIComponent(paymentId)}`)).data;

/** Needed only when the account captures payments by hand (otherwise Razorpay captures them itself) */
export const capturePayment = async (paymentId, amountPaise) =>
  (await client().post(`/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' })).data;

/** The whole payment back to the devotee */
export const refundPayment = async (paymentId, { notes } = {}) =>
  (await client().post(`/payments/${encodeURIComponent(paymentId)}/refund`, { notes })).data;

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const sameText = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * The checkout's "paid" answer from the devotee's browser is genuine: Razorpay signs
 * "<order id>|<payment id>" with the key secret.
 */
export const paymentSignatureOk = ({ orderId, paymentId, signature }, secret = razorpayConfig().keySecret) =>
  Boolean(secret && orderId && paymentId && signature) && sameText(hmac(secret, `${orderId}|${paymentId}`), signature);

/** A webhook call really is from Razorpay: it signs the raw request body with the webhook secret. */
export const webhookSignatureOk = (rawBody, signature, secret = razorpayConfig().webhookSecret) =>
  Boolean(secret && rawBody?.length && signature) && sameText(hmac(secret, rawBody), signature);

/** 'ok' | 'bad_key' (Razorpay refuses the key) | 'unreachable' | 'off' (no keys set) */
export async function checkKeys() {
  if (!razorpayReady()) return 'off';
  try {
    await client().get('/orders', { params: { count: 1 } });
    return 'ok';
  } catch (err) {
    return err.response?.status === 401 ? 'bad_key' : 'unreachable';
  }
}
