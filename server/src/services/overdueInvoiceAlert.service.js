import StockTransaction from '../models/StockTransaction.js';
import SupplierPayment from '../models/SupplierPayment.js';
import User from '../models/User.js';
import { sendTemplateToAll, whatsappConfig, whatsappReady } from './whatsappClient.service.js';

function fmtCurrency(n) {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
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

    const cfg = await whatsappConfig();
    if (!whatsappReady(cfg) || !cfg.templates.overdueSummary) {
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

    // Template (named in Settings → WhatsApp, with its wording):
    //   {{1}} suppliers  {{2}} invoices  {{3}} total (the template has the ₹)  {{4}} oldest, in days
    const params = [
      String(summary.supplierCount),
      String(summary.invoiceCount),
      fmtCurrency(summary.totalOutstanding),
      String(summary.oldestDays),
    ];

    const sent = await sendTemplateToAll(cfg, approvers, { template: cfg.templates.overdueSummary, body: params, label: 'Overdue invoices' });
    console.log(`[OverdueAlert] Sent to ${sent} of ${approvers.length} approver(s)`);

    console.log(
      `[OverdueAlert] Daily run — ${summary.invoiceCount} overdue invoice(s) across ` +
      `${summary.supplierCount} supplier(s), ₹${fmtCurrency(summary.totalOutstanding)} outstanding, ` +
      `oldest ${summary.oldestDays}d`
    );
  } catch (err) {
    console.error('[OverdueAlert] processOverdueInvoiceAlerts error:', err.message);
  }
}
