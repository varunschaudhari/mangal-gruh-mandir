import axios from 'axios';
import AssetTransaction from '../models/AssetTransaction.js';

async function markOverdueTransactions() {
  const result = await AssetTransaction.updateMany(
    { status: 'checked_out', expectedReturnDate: { $lt: new Date() } },
    { $set: { status: 'overdue' } }
  );
  return result.modifiedCount;
}

const WA_API_URL        = `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;
const WA_TOKEN          = process.env.WA_ACCESS_TOKEN;
const WA_ASSET_TEMPLATE = process.env.WA_ASSET_TEMPLATE_NAME || 'asset_reminder';
const MSG91_AUTH_KEY    = process.env.MSG91_AUTH_KEY;
const MSG91_ASSET_TMPL  = process.env.MSG91_ASSET_TEMPLATE_ID;

function typeLabel(reminderType) {
  if (reminderType === 'due_tomorrow') return 'due tomorrow';
  if (reminderType === 'due_today')    return 'due TODAY';
  if (reminderType === 'collect')      return 'pending collection';
  return 'OVERDUE';
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function sendWhatsApp(phone, { borrowerName, assetName, quantity, returnDate, reminderType }) {
  if (!WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID) return;
  await axios.post(
    WA_API_URL,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: WA_ASSET_TEMPLATE,
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: borrowerName },
            { type: 'text', text: assetName },
            { type: 'text', text: String(quantity) },
            { type: 'text', text: formatDate(returnDate) },
            { type: 'text', text: typeLabel(reminderType) },
          ],
        }],
      },
    },
    { headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

async function sendSms(phone, { borrowerName, assetName, quantity, returnDate, reminderType }) {
  if (!MSG91_AUTH_KEY || !MSG91_ASSET_TMPL) return;
  await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      template_id: MSG91_ASSET_TMPL,
      short_url: '0',
      mobiles: phone,
      borrower: borrowerName,
      asset: assetName,
      quantity: String(quantity),
      return_date: formatDate(returnDate),
      status: typeLabel(reminderType),
    },
    { headers: { authkey: MSG91_AUTH_KEY, 'Content-Type': 'application/json' } }
  );
}

async function sendReminder(txn, reminderType) {
  const { borrower, asset, quantityBorrowed, expectedReturnDate } = txn;
  if (!borrower?.phone) return;

  const payload = { borrowerName: borrower.name, assetName: asset.name, quantity: quantityBorrowed, returnDate: expectedReturnDate, reminderType };

  const results = await Promise.allSettled([
    borrower.whatsappAlertsEnabled !== false ? sendWhatsApp(borrower.phone, payload) : Promise.resolve(),
    sendSms(borrower.phone, payload),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(`[AssetReminder] ${i === 0 ? 'WhatsApp' : 'SMS'} failed for ${borrower.name}:`, r.reason?.message);
  });

  await AssetTransaction.findByIdAndUpdate(txn._id, {
    $push: { remindersSent: { reminderType, sentAt: new Date() } },
  });
  console.log(`[AssetReminder] Sent "${reminderType}" to ${borrower.name} for ${asset.name}`);
}

export async function sendAssetApprovalNotification(txn) {
  const { borrower, asset, quantityBorrowed, expectedReturnDate } = txn;
  if (!borrower?.phone) return;
  const payload = { borrowerName: borrower.name, assetName: asset.name, quantity: quantityBorrowed, returnDate: expectedReturnDate, reminderType: 'approved' };
  const results = await Promise.allSettled([
    WA_TOKEN       ? sendWhatsApp(borrower.phone, payload) : Promise.resolve(),
    MSG91_AUTH_KEY ? sendSms(borrower.phone, payload)      : Promise.resolve(),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[AssetReminder] Approval notification failed (${i === 0 ? 'WA' : 'SMS'}):`, r.reason?.message);
  });
}

// Exported for manual trigger from help desk UI
export async function sendManualAssetReminder(txn) {
  const now = new Date();
  let type;
  if (txn.status === 'overdue')    type = 'overdue';
  else if (txn.status === 'approved') type = 'collect';
  else type = new Date(txn.expectedReturnDate) < now ? 'overdue' : 'due_today';

  await sendReminder(txn, type);
}

export async function processAssetReminders() {
  const overdueCnt = await markOverdueTransactions();
  if (overdueCnt > 0) console.log(`[AssetReminder] Marked ${overdueCnt} transactions as overdue`);

  const now              = new Date();
  const today            = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow         = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const POPULATE = [
    { path: 'asset',    select: 'name' },
    { path: 'borrower', select: 'name phone whatsappAlertsEnabled smsAlertsEnabled' },
  ];

  // T-1: only checked_out (not approved — they haven't collected yet)
  const dueTomorrow = await AssetTransaction.find({
    status: 'checked_out',
    expectedReturnDate: { $gte: tomorrow, $lt: dayAfterTomorrow },
  }).populate(POPULATE);

  for (const txn of dueTomorrow) {
    const alreadySent = txn.remindersSent.some((r) => r.reminderType === 'due_tomorrow' && new Date(r.sentAt) > today);
    if (!alreadySent) await sendReminder(txn, 'due_tomorrow');
  }

  // T-0: only checked_out
  const dueToday = await AssetTransaction.find({
    status: 'checked_out',
    expectedReturnDate: { $gte: today, $lt: tomorrow },
  }).populate(POPULATE);

  for (const txn of dueToday) {
    const alreadySent = txn.remindersSent.some((r) => r.reminderType === 'due_today' && new Date(r.sentAt) > today);
    if (!alreadySent) await sendReminder(txn, 'due_today');
  }

  // Overdue: every 2 days
  const overdue = await AssetTransaction.find({ status: 'overdue' }).populate(POPULATE);
  for (const txn of overdue) {
    const last = txn.remindersSent.filter((r) => r.reminderType === 'overdue').sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];
    const daysSinceLast = last ? Math.floor((now - new Date(last.sentAt)) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSinceLast >= 2) await sendReminder(txn, 'overdue');
  }

  console.log(`[AssetReminder] Daily run complete — T-1: ${dueTomorrow.length}, T-0: ${dueToday.length}, Overdue: ${overdue.length}`);
}
