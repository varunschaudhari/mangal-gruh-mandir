import axios from 'axios';
import StockTransaction from '../models/StockTransaction.js';
import SupplierPayment from '../models/SupplierPayment.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

const WA_OVERDUE_TEMPLATE = process.env.WA_OVERDUE_TEMPLATE || 'payment_overdue_summary';

function fmtCurrency(n) {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

async function getWaConfig() {
  const s = await Settings.getOrCreate();
  return {
    phoneNumberId: s.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID,
    accessToken:   s.waAccessToken   || process.env.WA_ACCESS_TOKEN,
    enabled:       s.waEnabled,
  };
}

async function sendWhatsApp(phone, params, cfg) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: WA_OVERDUE_TEMPLATE,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    },
    { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
  );
}

/**
 * Compute overdue invoices summary across all suppliers.
 * Returns { supplierCount, invoiceCount, totalOutstanding, oldestDays }
 * or null if nothing is overdue.
 */
async function computeOverdueSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // All purchases with a due date in the past
  const purchases = await StockTransaction.find({
    stockInType: 'PURCHASE',
    isVoided: false,
    dueDate: { $lt: today },
  }).lean();

  if (!purchases.length) return null;

  // Group by supplier + invoiceNumber to get invoice totals
  const invoiceMap = {}; // `${supplierId}:${invoiceNumber}` -> { supplierId, invoiceTotal, dueDate }
  for (const t of purchases) {
    if (!t.supplier) continue;
    const key = `${t.supplier}:${t.invoiceNumber || '__none__'}`;
    if (!invoiceMap[key]) {
      invoiceMap[key] = { supplierId: t.supplier.toString(), invoiceTotal: 0, dueDate: t.dueDate };
    }
    invoiceMap[key].invoiceTotal += t.totalValue || 0;
  }

  // Build paid map across all approved payments
  const payments = await SupplierPayment.find({ status: 'approved' }).lean();
  const paidMap = {}; // same key format
  for (const p of payments) {
    const sid = p.supplier.toString();
    for (const inv of p.invoices) {
      const key = `${sid}:${inv.invoiceNumber || '__none__'}`;
      paidMap[key] = (paidMap[key] || 0) + inv.paidAmount;
    }
  }

  let supplierSet     = new Set();
  let overdueInvoices = 0;
  let totalOutstanding = 0;
  let oldestDays      = 0;

  for (const [key, inv] of Object.entries(invoiceMap)) {
    const outstanding = Math.max(0, inv.invoiceTotal - (paidMap[key] || 0));
    if (outstanding <= 0) continue;

    supplierSet.add(inv.supplierId);
    overdueInvoices++;
    totalOutstanding += outstanding;

    const days = Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
    if (days > oldestDays) oldestDays = days;
  }

  if (overdueInvoices === 0) return null;

  return {
    supplierCount:    supplierSet.size,
    invoiceCount:     overdueInvoices,
    totalOutstanding,
    oldestDays,
  };
}

export async function processOverdueInvoiceAlerts() {
  try {
    const summary = await computeOverdueSummary();
    if (!summary) {
      console.log('[OverdueAlert] No overdue invoices with outstanding balance — skipping');
      return;
    }

    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.phoneNumberId || !cfg.accessToken) {
      console.log('[OverdueAlert] WhatsApp not configured — skipping notification');
      return;
    }

    const approvers = await User.find({
      canApprovePayments: true,
      phone: { $exists: true, $ne: '' },
      isActive: true,
    }).select('phone name').lean();

    if (!approvers.length) {
      console.log('[OverdueAlert] No approvers with phone numbers found');
      return;
    }

    // WhatsApp template "payment_overdue_summary":
    //   Body: "Mangal Grah Mandir: {{1}} supplier(s) have {{2}} overdue invoice(s)
    //          totalling ₹{{3}}. Oldest overdue: {{4}} day(s). Please review payments."
    const params = [
      String(summary.supplierCount),
      String(summary.invoiceCount),
      fmtCurrency(summary.totalOutstanding),
      String(summary.oldestDays),
    ];

    const results = await Promise.allSettled(
      approvers.map((u) => sendWhatsApp(u.phone, params, cfg))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected')
        console.error(`[OverdueAlert] Failed → ${approvers[i]?.name}:`, r.reason?.message);
      else
        console.log(`[OverdueAlert] Sent → ${approvers[i]?.name}`);
    });

    console.log(
      `[OverdueAlert] Daily run — ${summary.invoiceCount} overdue invoice(s) across ` +
      `${summary.supplierCount} supplier(s), ₹${fmtCurrency(summary.totalOutstanding)} outstanding, ` +
      `oldest ${summary.oldestDays}d`
    );
  } catch (err) {
    console.error('[OverdueAlert] processOverdueInvoiceAlerts error:', err.message);
  }
}
