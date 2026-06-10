import PurchaseEntry from '../models/PurchaseEntry.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import StockTransaction from '../models/StockTransaction.js';
import SupplierPayment from '../models/SupplierPayment.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generatePurchaseEntryNumber } from '../services/purchaseEntryNumber.service.js';
import { generateTransactionNumber } from '../services/transactionNumber.service.js';
import { createBatch, restoreBatchesForVoid } from '../services/fifo.service.js';
import { recomputeBalance, updateBalancesForTransaction } from '../services/stockBalance.service.js';
import { logAction } from '../services/audit.service.js';

// POST /purchase-entries
export const createPurchaseEntry = asyncHandler(async (req, res) => {
  const {
    supplier, toDepartment, invoiceNumber, invoiceDate, dueDate,
    receivedDate, items, notes,
  } = req.body;

  if (!supplier)      throw new ApiError(400, 'Supplier is required');
  if (!toDepartment)  throw new ApiError(400, 'toDepartment is required');
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'At least one item is required');
  }

  // Auto-compute dueDate if not provided but invoiceDate is set
  let resolvedDueDate = dueDate || undefined;
  if (!resolvedDueDate && invoiceDate) {
    const supplierDoc = await Supplier.findById(supplier).select('creditDays').lean();
    const creditDays  = supplierDoc?.creditDays || 0;
    if (creditDays > 0) {
      resolvedDueDate = new Date(new Date(invoiceDate).getTime() + creditDays * 86400000);
    }
  }

  const effectiveReceivedDate = receivedDate ? new Date(receivedDate) : new Date();
  const entryNumber = await generatePurchaseEntryNumber(effectiveReceivedDate);

  const processedItems = [];

  for (const item of items) {
    const product = await Product.findById(item.product).lean();
    if (!product) throw new ApiError(404, `Product not found: ${item.product}`);

    const txnNumber = await generateTransactionNumber(effectiveReceivedDate);
    const itemRate      = item.rate || 0;
    const itemTotalValue = itemRate * item.quantity;

    const txn = await StockTransaction.create({
      transactionNumber: txnNumber,
      transactionType:   'STOCK_IN',
      transactionDate:   effectiveReceivedDate,
      product:           product._id,
      toDepartment,
      quantity:          item.quantity,
      unit:              product.unit,
      rate:              itemRate,
      totalValue:        itemTotalValue,
      stockInType:       'PURCHASE',
      supplier,
      invoiceNumber:     invoiceNumber || undefined,
      invoiceDate:       invoiceDate   || undefined,
      dueDate:           resolvedDueDate || undefined,
      expiryDate:        item.expiryDate        || undefined,
      manufacturingDate: item.manufacturingDate  || undefined,
      batchRef:          item.batchRef           || undefined,
      notes:             notes                   || undefined,
      createdBy:         req.user._id,
    });

    await createBatch(txn);
    await recomputeBalance(product._id, toDepartment);

    processedItems.push({
      product:           product._id,
      quantity:          item.quantity,
      unit:              product.unit,
      rate:              itemRate,
      totalValue:        itemTotalValue,
      expiryDate:        item.expiryDate        || undefined,
      manufacturingDate: item.manufacturingDate  || undefined,
      batchRef:          item.batchRef           || undefined,
      stockTransactionId: txn._id,
    });
  }

  const totalValue = processedItems.reduce((s, i) => s + i.totalValue, 0);

  const entry = await PurchaseEntry.create({
    entryNumber,
    supplier,
    invoiceNumber:  invoiceNumber  || undefined,
    invoiceDate:    invoiceDate    || undefined,
    dueDate:        resolvedDueDate || undefined,
    receivedDate:   effectiveReceivedDate,
    toDepartment,
    items:          processedItems,
    totalValue,
    notes:          notes || undefined,
    createdBy:      req.user._id,
  });

  logAction(req, {
    action: 'purchase.create', entity: 'PurchaseEntry',
    entityId: entryNumber, entityRef: entry._id,
    meta: { supplier, invoiceNumber, totalValue, itemCount: processedItems.length },
  });

  const populated = await PurchaseEntry.findById(entry._id)
    .populate('supplier', 'name phone address bankAccounts creditDays')
    .populate('toDepartment', 'name code')
    .populate('items.product', 'name code')
    .populate('items.unit', 'symbol name')
    .populate('createdBy', 'name')
    .lean();

  res.status(201).json(new ApiResponse(201, populated, 'Purchase entry created'));
});

// GET /purchase-entries
export const getPurchaseEntries = asyncHandler(async (req, res) => {
  const {
    supplier, from, to, search, isVoided = 'false',
    status, page = 1, limit = 30,
  } = req.query;

  const filter = { isVoided: isVoided === 'true' };
  if (supplier) filter.supplier = supplier;
  if (from || to) {
    filter.invoiceDate = {};
    if (from) filter.invoiceDate.$gte = new Date(from);
    if (to)   { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.invoiceDate.$lte = d; }
  }
  if (search) {
    const re = { $regex: search.trim(), $options: 'i' };
    filter.$or = [{ invoiceNumber: re }, { entryNumber: re }];
  }

  const entries = await PurchaseEntry.find(filter)
    .populate('supplier', 'name phone')
    .populate('toDepartment', 'name code')
    .populate('items.product', 'name code')
    .sort({ receivedDate: -1, createdAt: -1 })
    .lean();

  // Build paid map from approved SupplierPayments
  const entryIds = entries.map((e) => e._id);
  const payments = await SupplierPayment.find({
    status: 'approved',
    'invoices.purchaseEntryId': { $in: entryIds },
  }).select('invoices').lean();

  const paidMap = {};
  for (const p of payments) {
    for (const inv of p.invoices) {
      if (inv.purchaseEntryId) {
        const key = inv.purchaseEntryId.toString();
        paidMap[key] = (paidMap[key] || 0) + (inv.paidAmount || 0);
      }
    }
  }

  const now = new Date();
  let enriched = entries.map((e) => {
    const paidSoFar     = paidMap[e._id.toString()] || 0;
    const remaining     = Math.max(0, e.totalValue - paidSoFar);
    const paymentStatus = paidSoFar === 0 ? 'unpaid' : paidSoFar >= e.totalValue ? 'paid' : 'partial';
    const isOverdue     = !!(e.dueDate && new Date(e.dueDate) < now && remaining > 0);
    return { ...e, paidSoFar, remaining, paymentStatus, isOverdue };
  });

  // Filter by payment status after enrichment
  if (status) enriched = enriched.filter((e) => e.paymentStatus === status);

  const total      = enriched.length;
  const skip       = (Number(page) - 1) * Number(limit);
  const paginated  = enriched.slice(skip, skip + Number(limit));

  res.json(new ApiResponse(200, {
    entries: paginated,
    pagination: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }));
});

// GET /purchase-entries/:id
export const getPurchaseEntry = asyncHandler(async (req, res) => {
  const entry = await PurchaseEntry.findById(req.params.id)
    .populate('supplier', 'name phone address bankAccounts creditDays')
    .populate('toDepartment', 'name code')
    .populate('items.product', 'name code')
    .populate('items.unit', 'symbol name')
    .populate('createdBy', 'name')
    .populate('voidedBy', 'name')
    .lean();

  if (!entry) throw new ApiError(404, 'Purchase entry not found');

  const relatedPayments = await SupplierPayment.find({
    status: 'approved',
    'invoices.purchaseEntryId': entry._id,
  }).populate('createdBy', 'name').lean();

  const paidSoFar = relatedPayments.reduce((s, p) => {
    const alloc = p.invoices.find((i) => i.purchaseEntryId?.toString() === entry._id.toString());
    return s + (alloc?.paidAmount || 0);
  }, 0);

  const remaining     = Math.max(0, entry.totalValue - paidSoFar);
  const paymentStatus = paidSoFar === 0 ? 'unpaid' : paidSoFar >= entry.totalValue ? 'paid' : 'partial';
  const isOverdue     = !!(entry.dueDate && new Date(entry.dueDate) < new Date() && remaining > 0);

  res.json(new ApiResponse(200, {
    ...entry,
    paidSoFar,
    remaining,
    paymentStatus,
    isOverdue,
    payments: relatedPayments,
  }));
});

// PATCH /purchase-entries/:id/void
export const voidPurchaseEntry = asyncHandler(async (req, res) => {
  const { voidReason } = req.body;
  if (!voidReason?.trim()) throw new ApiError(400, 'Void reason is required');

  const entry = await PurchaseEntry.findById(req.params.id);
  if (!entry) throw new ApiError(404, 'Purchase entry not found');
  if (entry.isVoided) throw new ApiError(400, 'Purchase entry is already voided');

  // Block if any approved payments reference this entry
  const approvedPayments = await SupplierPayment.find({
    status: 'approved',
    'invoices.purchaseEntryId': entry._id,
  }).lean();

  if (approvedPayments.length > 0) {
    throw new ApiError(
      400,
      `Cannot void: ${approvedPayments.length} approved payment(s) reference this entry. Void those payments first.`
    );
  }

  // Void each linked StockTransaction and restore batches
  for (const item of entry.items) {
    if (!item.stockTransactionId) continue;
    const txn = await StockTransaction.findById(item.stockTransactionId);
    if (!txn || txn.isVoided) continue;

    await restoreBatchesForVoid(txn);

    txn.isVoided  = true;
    txn.voidedBy  = req.user._id;
    txn.voidedAt  = new Date();
    txn.voidReason = voidReason;
    await txn.save();

    await updateBalancesForTransaction(txn);
  }

  entry.isVoided  = true;
  entry.voidReason = voidReason;
  entry.voidedBy  = req.user._id;
  entry.voidedAt  = new Date();
  await entry.save();

  logAction(req, {
    action: 'purchase.void', entity: 'PurchaseEntry',
    entityId: entry.entryNumber, entityRef: entry._id,
    meta: { voidReason, itemCount: entry.items.length },
  });

  res.json(new ApiResponse(200, { entryNumber: entry.entryNumber }, 'Purchase entry voided'));
});

// GET /purchase-entries/pending/:supplierId
export const getPendingEntries = asyncHandler(async (req, res) => {
  const { supplierId } = req.params;

  const entries = await PurchaseEntry.find({ supplier: supplierId, isVoided: false })
    .sort({ invoiceDate: -1 })
    .lean();

  const entryIds = entries.map((e) => e._id);
  const payments = await SupplierPayment.find({
    status: 'approved',
    'invoices.purchaseEntryId': { $in: entryIds },
  }).select('invoices').lean();

  const paidMap = {};
  for (const p of payments) {
    for (const inv of p.invoices) {
      if (inv.purchaseEntryId) {
        const key = inv.purchaseEntryId.toString();
        paidMap[key] = (paidMap[key] || 0) + (inv.paidAmount || 0);
      }
    }
  }

  const now = new Date();
  const pending = entries
    .map((e) => {
      const paidSoFar     = paidMap[e._id.toString()] || 0;
      const remaining     = Math.max(0, e.totalValue - paidSoFar);
      const paymentStatus = paidSoFar === 0 ? 'unpaid' : paidSoFar >= e.totalValue ? 'paid' : 'partial';
      const isOverdue     = !!(e.dueDate && new Date(e.dueDate) < now && remaining > 0);
      return { ...e, paidSoFar, remaining, paymentStatus, isOverdue };
    })
    .filter((e) => e.remaining > 0);

  res.json(new ApiResponse(200, pending));
});
