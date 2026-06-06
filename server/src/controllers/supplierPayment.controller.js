import SupplierPayment from '../models/SupplierPayment.js';
import Supplier from '../models/Supplier.js';
import StockTransaction from '../models/StockTransaction.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generatePaymentNumber } from '../services/paymentNumber.service.js';
import { notifyPaymentSubmitted, notifyPaymentStatusChange } from '../services/paymentNotification.service.js';

const POPULATE = [
  { path: 'supplier',   select: 'name address city gstin phone bankAccounts creditDays' },
  { path: 'approvedBy', select: 'name' },
  { path: 'rejectedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
  { path: 'voidedBy',   select: 'name' },
];

// Aggregate approved payments per invoice for a supplier
async function buildPaidMap(supplierId) {
  const payments = await SupplierPayment.find({ supplier: supplierId, status: 'approved' }).lean();
  const map = {};
  for (const p of payments) {
    for (const inv of p.invoices) {
      const key = inv.invoiceNumber || '__advance__';
      map[key] = (map[key] || 0) + inv.paidAmount;
    }
  }
  return map;
}

// GET /supplier-payments/counts
export const getPaymentCounts = asyncHandler(async (req, res) => {
  const pending = await SupplierPayment.countDocuments({ status: 'pending_approval' });
  res.json(new ApiResponse(200, { pending }));
});

// GET /supplier-payments/invoices/:supplierId
export const getSupplierInvoices = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;

  const purchases = await StockTransaction.find({
    supplier: supplierId,
    stockInType: 'PURCHASE',
    isVoided: false,
  }).select('invoiceNumber invoiceDate transactionDate totalValue dueDate').sort({ invoiceDate: -1 }).lean();

  // Group by invoiceNumber
  const invoiceMap = {};
  for (const t of purchases) {
    const key = t.invoiceNumber || '__no_invoice__';
    if (!invoiceMap[key]) {
      invoiceMap[key] = {
        invoiceNumber: t.invoiceNumber || null,
        invoiceDate:   t.invoiceDate || t.transactionDate,
        dueDate:       t.dueDate || null,
        invoiceTotal:  0,
      };
    }
    invoiceMap[key].invoiceTotal += t.totalValue || 0;
  }

  const paidMap = await buildPaidMap(supplierId);

  const invoices = Object.values(invoiceMap).map((inv) => {
    const key        = inv.invoiceNumber || '__no_invoice__';
    const paidSoFar  = paidMap[key] || 0;
    const remaining  = Math.max(0, inv.invoiceTotal - paidSoFar);
    const isOverdue  = inv.dueDate && new Date(inv.dueDate) < new Date() && remaining > 0;
    return {
      ...inv,
      paidSoFar,
      remaining,
      paymentStatus: paidSoFar === 0 ? 'unpaid' : paidSoFar >= inv.invoiceTotal ? 'paid' : 'partially_paid',
      isOverdue,
    };
  });

  invoices.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
  res.json(new ApiResponse(200, invoices));
});

// GET /supplier-payments/outstanding/:supplierId
export const getSupplierOutstanding = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const [purchases, payments] = await Promise.all([
    StockTransaction.find({ supplier: supplierId, stockInType: 'PURCHASE', isVoided: false }).lean(),
    SupplierPayment.find({ supplier: supplierId, status: 'approved' }).lean(),
  ]);
  const totalPurchased = purchases.reduce((s, t) => s + (t.totalValue || 0), 0);
  const totalPaid      = payments.reduce((s, p) => s + p.totalAmount, 0);
  const outstanding    = Math.max(0, totalPurchased - totalPaid);
  const overdueCount   = purchases.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.totalValue > 0).length;
  res.json(new ApiResponse(200, { totalPurchased, totalPaid, outstanding, overdueCount }));
});

// GET /supplier-payments/ledger/:supplierId
export const getSupplierLedger = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const [purchases, payments] = await Promise.all([
    StockTransaction.find({ supplier: supplierId, stockInType: 'PURCHASE', isVoided: false })
      .populate('product', 'name').sort({ transactionDate: -1 }).lean(),
    SupplierPayment.find({ supplier: supplierId })
      .populate('approvedBy', 'name').populate('createdBy', 'name').sort({ paymentDate: -1 }).lean(),
  ]);

  const purchaseEntries = purchases.map((t) => ({
    _id:           t._id,
    type:          'purchase',
    date:          t.transactionDate,
    number:        t.transactionNumber,
    invoiceNumber: t.invoiceNumber,
    description:   `${t.product?.name || 'Item'} — Inv: ${t.invoiceNumber || 'N/A'}`,
    debit:         t.totalValue || 0,
    credit:        0,
    dueDate:       t.dueDate || null,
    meta:          { quantity: t.quantity, rate: t.rate },
  }));

  const paymentEntries = payments.map((p) => ({
    _id:           p._id,
    type:          'payment',
    date:          p.paymentDate,
    number:        p.paymentNumber,
    description:   `Payment — ${PM_LABEL[p.paymentMode] || p.paymentMode}${p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ''}`,
    debit:         0,
    credit:        p.status === 'approved' ? p.totalAmount : 0,
    pendingAmount: p.status === 'pending_approval' ? p.totalAmount : 0,
    status:        p.status,
    invoices:      p.invoices,
    meta:          { approvedBy: p.approvedBy?.name, paymentMode: p.paymentMode },
  }));

  const allEntries    = [...purchaseEntries, ...paymentEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPurchased = purchaseEntries.reduce((s, e) => s + e.debit, 0);
  const totalPaid      = paymentEntries.filter((e) => e.credit > 0).reduce((s, e) => s + e.credit, 0);

  res.json(new ApiResponse(200, { entries: allEntries, totalPurchased, totalPaid, outstanding: Math.max(0, totalPurchased - totalPaid) }));
});

const PM_LABEL = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

// GET /supplier-payments
export const getPayments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status)   filter.status   = req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.from || req.query.to) {
    filter.paymentDate = {};
    if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
    if (req.query.to)   { const d = new Date(req.query.to); d.setHours(23, 59, 59, 999); filter.paymentDate.$lte = d; }
  }

  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 25);
  const skip  = (page - 1) * limit;

  const [data, total, pendingCount] = await Promise.all([
    SupplierPayment.find(filter).populate(POPULATE).sort({ paymentDate: -1, createdAt: -1 }).skip(skip).limit(limit),
    SupplierPayment.countDocuments(filter),
    SupplierPayment.countDocuments({ status: 'pending_approval' }),
  ]);

  res.json(new ApiResponse(200, { data, total, page, pages: Math.ceil(total / limit), pendingCount }));
});

// GET /supplier-payments/:id
export const getPayment = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findById(req.params.id).populate(POPULATE);
  if (!payment) throw new ApiError(404, 'Payment not found');
  res.json(new ApiResponse(200, payment));
});

// POST /supplier-payments
export const createPayment = asyncHandler(async (req, res) => {
  const { supplier: supplierId, invoices = [], totalAmount, paymentDate, paymentMode, referenceNumber, bankName, selectedBankAccountId, notes, force } = req.body;

  if (!supplierId)            throw new ApiError(400, 'Supplier is required');
  if (!totalAmount || totalAmount <= 0) throw new ApiError(400, 'Total amount must be greater than 0');

  // Duplicate detection — skip if user explicitly forced through
  if (!force && invoices.length > 0) {
    const invNums = invoices.map((i) => i.invoiceNumber).filter(Boolean);
    if (invNums.length > 0) {
      const existing = await SupplierPayment.find({
        supplier: supplierId,
        status:   { $in: ['pending_approval', 'approved'] },
        'invoices.invoiceNumber': { $in: invNums },
      }).populate('createdBy', 'name').lean();

      if (existing.length > 0) {
        const duplicates = existing.map((p) => ({
          paymentNumber:   p.paymentNumber,
          totalAmount:     p.totalAmount,
          paymentDate:     p.paymentDate,
          status:          p.status,
          createdBy:       p.createdBy?.name,
          matchedInvoices: p.invoices
            .filter((i) => invNums.includes(i.invoiceNumber))
            .map((i) => i.invoiceNumber),
        }));
        return res.status(409).json({ status: 'error', message: 'Possible duplicate payment detected', data: { duplicates } });
      }
    }
  }

  const supplierDoc = await Supplier.findById(supplierId);
  if (!supplierDoc?.isActive) throw new ApiError(404, 'Supplier not found or inactive');

  if (invoices.length > 0) {
    const invoiceSum = invoices.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
    if (Math.abs(invoiceSum - Number(totalAmount)) > 0.01) {
      throw new ApiError(400, `Invoice allocation total (₹${invoiceSum}) must equal payment amount (₹${totalAmount})`);
    }
  }

  const paymentNumber = await generatePaymentNumber(paymentDate ? new Date(paymentDate) : new Date());

  const payment = await SupplierPayment.create({
    paymentNumber,
    supplier:        supplierId,
    invoices:        invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber || undefined,
      invoiceDate:   inv.invoiceDate   || undefined,
      invoiceTotal:  Number(inv.invoiceTotal) || 0,
      paidAmount:    Number(inv.paidAmount),
    })),
    totalAmount:     Number(totalAmount),
    paymentDate:     paymentDate ? new Date(paymentDate) : new Date(),
    paymentMode:     paymentMode  || 'cash',
    referenceNumber: referenceNumber || undefined,
    selectedBankAccountId: selectedBankAccountId || undefined,
    bankName: (() => {
      if (bankName) return bankName;
      if (selectedBankAccountId) {
        const acc = supplierDoc.bankAccounts?.find((a) => a._id?.toString() === selectedBankAccountId?.toString());
        return acc ? [acc.bankName, acc.accountNumber ? `A/C ${acc.accountNumber}` : '', acc.ifscCode].filter(Boolean).join(' · ') : undefined;
      }
      return undefined;
    })(),
    notes:           notes           || undefined,
    status:          'pending_approval',
    createdBy:       req.user._id,
  });

  const populated = await SupplierPayment.findById(payment._id).populate(POPULATE);
  notifyPaymentSubmitted({
    payment,
    supplierName:  supplierDoc.name,
    submitterName: req.user.name,
  });
  res.status(201).json(new ApiResponse(201, populated, 'Payment submitted for approval'));
});

// PATCH /supplier-payments/:id/approve
export const approvePayment = asyncHandler(async (req, res) => {
  if (!req.user.canApprovePayments) throw new ApiError(403, 'You are not authorised to approve payments');
  const { approvalNote } = req.body;
  const payment = await SupplierPayment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'pending_approval') throw new ApiError(400, `Payment is already ${payment.status}`);
  if (payment.createdBy.toString() === req.user._id.toString())
    throw new ApiError(403, 'You cannot approve a payment you submitted');
  payment.status     = 'approved';
  payment.approvedBy = req.user._id;
  payment.approvedAt = new Date();
  if (approvalNote?.trim()) payment.approvalNote = approvalNote.trim();
  await payment.save();
  const populated = await SupplierPayment.findById(payment._id).populate(POPULATE);
  notifyPaymentStatusChange({ payment, approverName: req.user.name });
  res.json(new ApiResponse(200, populated, 'Payment approved'));
});

// POST /supplier-payments/bulk-approve
export const bulkApprovePayments = asyncHandler(async (req, res) => {
  if (!req.user.canApprovePayments) throw new ApiError(403, 'You are not authorised to approve payments');
  const { ids, approvalNote } = req.body;
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'No payment IDs provided');

  const payments = await SupplierPayment.find({ _id: { $in: ids }, status: 'pending_approval' });
  if (!payments.length) throw new ApiError(400, 'No pending payments found for the provided IDs');

  const selfCreated = payments.filter((p) => p.createdBy.toString() === req.user._id.toString());
  if (selfCreated.length) {
    throw new ApiError(403, `${selfCreated.length} payment(s) were submitted by you and cannot be self-approved`);
  }

  const now  = new Date();
  const note = approvalNote?.trim() || undefined;
  await SupplierPayment.updateMany(
    { _id: { $in: payments.map((p) => p._id) } },
    { $set: { status: 'approved', approvedBy: req.user._id, approvedAt: now, ...(note ? { approvalNote: note } : {}) } }
  );

  for (const payment of payments) {
    payment.status = 'approved';
    notifyPaymentStatusChange({ payment, approverName: req.user.name });
  }

  res.json(new ApiResponse(200, { approved: payments.length }, `${payments.length} payment(s) approved`));
});

// PATCH /supplier-payments/:id/reject
export const rejectPayment = asyncHandler(async (req, res) => {
  if (!req.user.canApprovePayments) throw new ApiError(403, 'You are not authorised to reject payments');
  const { rejectionReason } = req.body;
  if (!rejectionReason?.trim()) throw new ApiError(400, 'Rejection reason is required');
  const payment = await SupplierPayment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'pending_approval') throw new ApiError(400, `Payment is already ${payment.status}`);
  if (payment.createdBy.toString() === req.user._id.toString())
    throw new ApiError(403, 'You cannot reject a payment you submitted');
  payment.status          = 'rejected';
  payment.rejectionReason = rejectionReason;
  payment.rejectedBy      = req.user._id;
  payment.rejectedAt      = new Date();
  await payment.save();
  const populated = await SupplierPayment.findById(payment._id).populate(POPULATE);
  notifyPaymentStatusChange({ payment, approverName: req.user.name });
  res.json(new ApiResponse(200, populated, 'Payment rejected'));
});

// GET /supplier-payments/export
export const exportPayments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status)   filter.status   = req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  if (req.query.from || req.query.to) {
    filter.paymentDate = {};
    if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
    if (req.query.to)   { const d = new Date(req.query.to); d.setHours(23, 59, 59, 999); filter.paymentDate.$lte = d; }
  }

  const payments = await SupplierPayment.find(filter)
    .populate(POPULATE)
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();

  const { generatePaymentExcel } = await import('../services/paymentExcel.service.js');
  await generatePaymentExcel(res, { payments, from: req.query.from, to: req.query.to });
});

// PATCH /supplier-payments/:id/void
export const voidPayment = asyncHandler(async (req, res) => {
  if (!req.user.canApprovePayments) throw new ApiError(403, 'You are not authorised to void payments');
  const { voidReason } = req.body;
  if (!voidReason?.trim()) throw new ApiError(400, 'Void reason is required');
  const payment = await SupplierPayment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'approved') throw new ApiError(400, `Only approved payments can be voided (current status: ${payment.status})`);
  payment.status   = 'voided';
  payment.voidedBy = req.user._id;
  payment.voidedAt = new Date();
  payment.voidReason = voidReason.trim();
  await payment.save();
  const populated = await SupplierPayment.findById(payment._id).populate(POPULATE);
  res.json(new ApiResponse(200, populated, 'Payment voided'));
});

// GET /supplier-payments/dashboard-summary
export const getPaymentDashboardSummary = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCount, purchases, payments] = await Promise.all([
    SupplierPayment.countDocuments({ status: 'pending_approval' }),
    StockTransaction.find({ stockInType: 'PURCHASE', isVoided: false })
      .select('supplier invoiceNumber totalValue dueDate')
      .lean(),
    SupplierPayment.find({ status: 'approved' })
      .select('supplier invoices totalAmount')
      .lean(),
  ]);

  const paidMap = {};
  for (const p of payments) {
    const sid = p.supplier.toString();
    for (const inv of p.invoices) {
      const key = `${sid}:${inv.invoiceNumber || '__none__'}`;
      paidMap[key] = (paidMap[key] || 0) + inv.paidAmount;
    }
  }

  const invoiceMap = {};
  for (const t of purchases) {
    if (!t.supplier) continue;
    const sid = t.supplier.toString();
    const key = `${sid}:${t.invoiceNumber || '__none__'}`;
    if (!invoiceMap[key]) invoiceMap[key] = { total: 0, dueDate: t.dueDate || null };
    invoiceMap[key].total += t.totalValue || 0;
    if (t.dueDate && !invoiceMap[key].dueDate) invoiceMap[key].dueDate = t.dueDate;
  }

  let totalOutstanding = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  for (const [key, inv] of Object.entries(invoiceMap)) {
    const outstanding = Math.max(0, inv.total - (paidMap[key] || 0));
    if (outstanding <= 0) continue;
    totalOutstanding += outstanding;
    if (inv.dueDate && new Date(inv.dueDate) < today) {
      overdueAmount += outstanding;
      overdueCount++;
    }
  }

  res.json(new ApiResponse(200, {
    pendingCount,
    totalOutstanding: +totalOutstanding.toFixed(2),
    overdueAmount:    +overdueAmount.toFixed(2),
    overdueCount,
  }));
});

// GET /supplier-payments/aging
export const getSupplierAging = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const purchases = await StockTransaction.find({ stockInType: 'PURCHASE', isVoided: false })
    .populate('supplier', 'name')
    .lean();

  // Group into invoice map: supplierId:invoiceKey -> { supplierId, supplierName, invoiceTotal, dueDate }
  const invoiceMap = {};
  for (const t of purchases) {
    if (!t.supplier) continue;
    const sid = t.supplier._id.toString();
    const key = `${sid}:${t.invoiceNumber || '__none__'}`;
    if (!invoiceMap[key]) {
      invoiceMap[key] = { supplierId: sid, supplierName: t.supplier.name, invoiceTotal: 0, dueDate: t.dueDate || null };
    }
    invoiceMap[key].invoiceTotal += t.totalValue || 0;
    if (t.dueDate && !invoiceMap[key].dueDate) invoiceMap[key].dueDate = t.dueDate;
  }

  // Build paid map from approved payments only
  const payments = await SupplierPayment.find({ status: 'approved' }).lean();
  const paidMap = {};
  for (const p of payments) {
    const sid = p.supplier.toString();
    for (const inv of p.invoices) {
      const key = `${sid}:${inv.invoiceNumber || '__none__'}`;
      paidMap[key] = (paidMap[key] || 0) + inv.paidAmount;
    }
  }

  // Bucket outstanding per supplier
  const supplierBuckets = {};
  for (const [key, inv] of Object.entries(invoiceMap)) {
    const outstanding = Math.max(0, inv.invoiceTotal - (paidMap[key] || 0));
    if (outstanding <= 0) continue;

    const sid = inv.supplierId;
    if (!supplierBuckets[sid]) {
      supplierBuckets[sid] = { _id: sid, name: inv.supplierName, current: 0, d0_30: 0, d31_60: 0, d60plus: 0, noDate: 0, total: 0 };
    }
    const b = supplierBuckets[sid];

    if (!inv.dueDate) {
      b.noDate += outstanding;
    } else {
      const due = new Date(inv.dueDate); due.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      if      (daysOverdue < 0)  b.current += outstanding;
      else if (daysOverdue <= 30) b.d0_30   += outstanding;
      else if (daysOverdue <= 60) b.d31_60  += outstanding;
      else                        b.d60plus += outstanding;
    }
    b.total += outstanding;
  }

  const rows = Object.values(supplierBuckets).sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      d0_30:   acc.d0_30   + r.d0_30,
      d31_60:  acc.d31_60  + r.d31_60,
      d60plus: acc.d60plus + r.d60plus,
      noDate:  acc.noDate  + r.noDate,
      total:   acc.total   + r.total,
    }),
    { current: 0, d0_30: 0, d31_60: 0, d60plus: 0, noDate: 0, total: 0 }
  );

  res.json(new ApiResponse(200, { rows, grandTotal, asOf: today }));
});

// GET /supplier-payments/:id/voucher  (approved only)
export const getPaymentVoucher = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findById(req.params.id).populate(POPULATE);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'approved') throw new ApiError(400, 'Voucher is only available for approved payments');
  const settings = await Settings.getOrCreate();
  const { generatePaymentVoucher } = await import('../services/paymentPdf.service.js');
  generatePaymentVoucher(res, {
    payment:  payment.toObject(),
    supplier: payment.supplier,
    settings: settings.toObject(),
  });
});
