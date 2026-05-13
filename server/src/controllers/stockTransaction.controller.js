import StockTransaction from '../models/StockTransaction.js';
import Product from '../models/Product.js';
import { generateTransactionNumber } from '../services/transactionNumber.service.js';
import { updateBalancesForTransaction } from '../services/stockBalance.service.js';
import { createBatch, consumeBatches, transferBatches, restoreBatchesForVoid } from '../services/fifo.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

export const createTransaction = asyncHandler(async (req, res) => {
  const {
    transactionType, transactionDate, product: productId,
    fromDepartment, toDepartment, quantity, rate,
    stockInType, supplier, invoiceNumber, invoiceDate, donorName,
    expiryDate, manufacturingDate, batchRef,
    stockOutPurpose, issuedTo, wastageReason, notes,
  } = req.body;

  // Validate required department fields per type
  if (transactionType === 'STOCK_IN' || transactionType === 'OPENING_BALANCE') {
    if (!toDepartment) throw new ApiError(400, 'toDepartment is required for ' + transactionType);
  } else if (transactionType === 'STOCK_OUT' || transactionType === 'WASTAGE') {
    if (!fromDepartment) throw new ApiError(400, 'fromDepartment is required for ' + transactionType);
  } else if (transactionType === 'TRANSFER') {
    if (!fromDepartment || !toDepartment) throw new ApiError(400, 'Both fromDepartment and toDepartment are required for TRANSFER');
    if (fromDepartment === toDepartment) throw new ApiError(400, 'Cannot transfer to the same department');
  }

  // Department access check for staff
  if (req.user.role === 'staff') {
    const userDepts = req.user.departments?.map((d) => d.toString()) || [];
    if (userDepts.length > 0) {
      const deptToCheck = fromDepartment || toDepartment;
      if (!userDepts.includes(deptToCheck?.toString())) {
        throw new ApiError(403, 'You do not have access to this department');
      }
    }
  }

  // Verify product exists
  const product = await Product.findById(productId).lean();
  if (!product) throw new ApiError(404, 'Product not found');

  // For outgoing types, run FIFO first to validate stock (throws if insufficient)
  let consumedBatchesResult = [];
  if (transactionType === 'STOCK_OUT' || transactionType === 'WASTAGE') {
    consumedBatchesResult = await consumeBatches(productId, fromDepartment, quantity);
  }

  const transactionNumber = await generateTransactionNumber(transactionDate || new Date());

  const txn = await StockTransaction.create({
    transactionNumber,
    transactionType,
    transactionDate: transactionDate || new Date(),
    product: productId,
    fromDepartment: fromDepartment || undefined,
    toDepartment: toDepartment || undefined,
    quantity,
    unit: product.unit,
    rate: rate || 0,
    totalValue: (rate || 0) * quantity,
    stockInType: stockInType || undefined,
    supplier: supplier || undefined,
    invoiceNumber: invoiceNumber || undefined,
    invoiceDate: invoiceDate || undefined,
    donorName: donorName || undefined,
    expiryDate: expiryDate || undefined,
    manufacturingDate: manufacturingDate || undefined,
    batchRef: batchRef || undefined,
    stockOutPurpose: stockOutPurpose || undefined,
    issuedTo: issuedTo || undefined,
    wastageReason: wastageReason || undefined,
    consumedBatches: consumedBatchesResult,
    notes: notes || undefined,
    createdBy: req.user._id,
  });

  // Post-create FIFO operations
  if (transactionType === 'STOCK_IN' || transactionType === 'OPENING_BALANCE') {
    await createBatch(txn);
  } else if (transactionType === 'TRANSFER') {
    const consumed = await transferBatches(productId, fromDepartment, toDepartment, quantity, txn);
    txn.consumedBatches = consumed;
    await txn.save();
  }

  await updateBalancesForTransaction(txn);

  const populated = await StockTransaction.findById(txn._id)
    .populate('product', 'name code')
    .populate('fromDepartment', 'name code')
    .populate('toDepartment', 'name code')
    .populate('unit', 'name symbol')
    .populate('supplier', 'name')
    .populate('createdBy', 'name')
    .lean();

  res.status(201).json(new ApiResponse(201, populated, 'Transaction created'));
});

export const getTransactions = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    transactionType, product, fromDepartment, toDepartment,
    department, startDate, endDate, isVoided,
  } = req.query;

  const filter = {};

  if (transactionType) filter.transactionType = transactionType;
  if (product) filter.product = product;
  if (isVoided !== undefined) filter.isVoided = isVoided === 'true';
  else filter.isVoided = false;

  if (department) {
    filter.$or = [{ fromDepartment: department }, { toDepartment: department }];
  } else {
    if (fromDepartment) filter.fromDepartment = fromDepartment;
    if (toDepartment) filter.toDepartment = toDepartment;
  }

  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.transactionDate.$lte = end;
    }
  }

  // Staff: restrict to assigned departments
  if (req.user.role === 'staff') {
    const userDepts = req.user.departments?.map((d) => d.toString()) || [];
    if (userDepts.length > 0) {
      filter.$or = [
        { fromDepartment: { $in: userDepts } },
        { toDepartment: { $in: userDepts } },
      ];
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [total, transactions] = await Promise.all([
    StockTransaction.countDocuments(filter),
    StockTransaction.find(filter)
      .populate('product', 'name code')
      .populate('fromDepartment', 'name code')
      .populate('toDepartment', 'name code')
      .populate('unit', 'name symbol')
      .populate('supplier', 'name')
      .populate('createdBy', 'name')
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
  ]);

  res.json(new ApiResponse(200, {
    transactions,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }));
});

export const getTransaction = asyncHandler(async (req, res) => {
  const txn = await StockTransaction.findById(req.params.id)
    .populate('product', 'name code unit')
    .populate('fromDepartment', 'name code')
    .populate('toDepartment', 'name code')
    .populate('unit', 'name symbol')
    .populate('supplier', 'name')
    .populate('createdBy', 'name')
    .populate('voidedBy', 'name')
    .lean();

  if (!txn) throw new ApiError(404, 'Transaction not found');
  res.json(new ApiResponse(200, txn));
});

export const voidTransaction = asyncHandler(async (req, res) => {
  const { voidReason } = req.body;
  if (!voidReason?.trim()) throw new ApiError(400, 'Void reason is required');

  const txn = await StockTransaction.findById(req.params.id);
  if (!txn) throw new ApiError(404, 'Transaction not found');
  if (txn.isVoided) throw new ApiError(400, 'Transaction is already voided');

  // Restore / void batches (throws if STOCK_IN batch already partially consumed)
  await restoreBatchesForVoid(txn);

  txn.isVoided = true;
  txn.voidedBy = req.user._id;
  txn.voidedAt = new Date();
  txn.voidReason = voidReason;
  await txn.save();

  await updateBalancesForTransaction(txn);

  res.json(new ApiResponse(200, { transactionNumber: txn.transactionNumber }, 'Transaction voided'));
});
