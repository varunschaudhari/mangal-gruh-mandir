import AssetTransaction from '../models/AssetTransaction.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendAssetApprovalNotification, sendManualAssetReminder, processAssetReminders } from '../services/assetReminder.service.js';
import { recomputeGroupStatus } from '../services/borrowGroupStatus.service.js';
import { generateBorrowRequestNumber } from '../services/borrowRequestNumber.service.js';

const POPULATE = [
  { path: 'asset',      select: 'name category finePerDay totalQuantity' },
  { path: 'borrower',   select: 'name phone' },
  { path: 'approvedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
  { path: 'group',      select: 'groupNumber status' },
  { path: 'extensions.approvedBy', select: 'name' },
  { path: 'extensions.extendedBy', select: 'name' },
];

export const getTransactions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status)   filter.status = req.query.status;
  if (req.query.asset)    filter.asset = req.query.asset;
  if (req.query.borrower) filter.borrower = req.query.borrower;

  if (req.query.search) {
    const s = req.query.search.trim();
    const [userMatches, assetMatches] = await Promise.all([
      User.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean(),
      Asset.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean(),
    ]);
    const orClauses = [
      { transactionNumber:           { $regex: s, $options: 'i' } },
      { 'externalBorrower.name':     { $regex: s, $options: 'i' } },
    ];
    if (userMatches.length)  orClauses.push({ borrower: { $in: userMatches.map((u) => u._id) } });
    if (assetMatches.length) orClauses.push({ asset:    { $in: assetMatches.map((a) => a._id) } });
    filter.$or = orClauses;
  }

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const [txns, total] = await Promise.all([
    AssetTransaction.find(filter).populate(POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssetTransaction.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, { data: txns, total, page, pages: Math.ceil(total / limit) }));
});

export const getTransaction = asyncHandler(async (req, res) => {
  const txn = await AssetTransaction.findById(req.params.id).populate(POPULATE);
  if (!txn) throw new ApiError(404, 'Transaction not found');
  res.json(new ApiResponse(200, txn));
});

export const createBorrowRequest = asyncHandler(async (req, res) => {
  const { asset: assetId, borrower: borrowerId, borrowerType = 'staff', externalBorrower, quantityBorrowed, expectedReturnDate, approvedBy: approverId, notes } = req.body;

  const [assetDoc, approver, settings] = await Promise.all([
    Asset.findById(assetId),
    User.findById(approverId),
    Settings.getOrCreate(),
  ]);

  if (!assetDoc || !assetDoc.isActive) throw new ApiError(404, 'Asset not found or inactive');
  if (!approver?.canApproveAssets)     throw new ApiError(400, 'Selected approver does not have asset approval authority');

  if (borrowerType === 'staff') {
    const borrowerDoc = await User.findById(borrowerId);
    if (!borrowerDoc) throw new ApiError(404, 'Borrower not found');
  } else {
    if (!externalBorrower?.name?.trim())  throw new ApiError(400, 'External borrower name is required');
    if (!externalBorrower?.phone?.trim()) throw new ApiError(400, 'External borrower phone is required');
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const returnDate = new Date(expectedReturnDate);
  const diffDays = Math.ceil((returnDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 1)                           throw new ApiError(400, 'Return date must be in the future');
  if (diffDays > settings.assetMaxBorrowDays) throw new ApiError(400, `Maximum borrow duration is ${settings.assetMaxBorrowDays} days`);

  const borrowed = await AssetTransaction.aggregate([
    { $match: { asset: assetDoc._id, status: { $in: ['approved', 'checked_out', 'overdue'] }, expectedReturnDate: { $gte: today } } },
    { $group: { _id: null, total: { $sum: '$quantityBorrowed' } } },
  ]);
  const available = assetDoc.totalQuantity - (borrowed[0]?.total || 0);
  if (quantityBorrowed > available) throw new ApiError(400, `Only ${available} unit(s) available for the requested period`);

  const borrowerFields = borrowerType === 'staff'
    ? { borrower: borrowerId }
    : { externalBorrower: { name: externalBorrower.name.trim(), phone: externalBorrower.phone.trim(), address: externalBorrower.address?.trim(), idProofType: externalBorrower.idProofType || undefined, idProofNumber: externalBorrower.idProofNumber?.trim() } };

  const transactionNumber = await generateBorrowRequestNumber();

  const txn = await AssetTransaction.create({
    transactionNumber,
    asset: assetId, borrowerType, ...borrowerFields, quantityBorrowed,
    expectedReturnDate, approvedBy: approverId, approvedAt: new Date(),
    status: 'approved', notes: notes || undefined,
    createdBy: req.user._id,
  });

  const populated = await AssetTransaction.findById(txn._id).populate(POPULATE);
  sendAssetApprovalNotification(populated).catch(console.error);

  res.status(201).json(new ApiResponse(201, populated, 'Borrow request created'));
});

export const checkoutAsset = asyncHandler(async (req, res) => {
  const { conditionAtCheckout } = req.body;
  if (!conditionAtCheckout) throw new ApiError(400, 'conditionAtCheckout is required');

  const txn = await AssetTransaction.findById(req.params.id);
  if (!txn)                      throw new ApiError(404, 'Transaction not found');
  if (txn.status !== 'approved') throw new ApiError(400, 'Transaction must be in approved status to check out');

  txn.status = 'checked_out';
  txn.checkedOutAt = new Date();
  txn.conditionAtCheckout = conditionAtCheckout;
  await txn.save();

  const populated = await AssetTransaction.findById(txn._id).populate(POPULATE);
  recomputeGroupStatus(txn.group).catch(console.error);
  res.json(new ApiResponse(200, populated, 'Asset checked out successfully'));
});

export const returnAsset = asyncHandler(async (req, res) => {
  const { conditionAtReturn, damageNotes, fineApplied, fineAmount, fineWaived, fineWaivedReason, actualReturnDate } = req.body;

  const txn = await AssetTransaction.findById(req.params.id).populate('asset');
  if (!txn) throw new ApiError(404, 'Transaction not found');
  if (!['checked_out', 'overdue'].includes(txn.status)) throw new ApiError(400, 'Asset is not currently checked out');

  const returnDate   = actualReturnDate ? new Date(actualReturnDate) : new Date();
  const expectedDate = new Date(txn.expectedReturnDate);
  const lateDays     = Math.max(0, Math.ceil((returnDate - expectedDate) / (1000 * 60 * 60 * 24)));

  txn.status            = 'returned';
  txn.actualReturnDate  = returnDate;
  txn.conditionAtReturn = conditionAtReturn;
  txn.damageNotes       = damageNotes || undefined;
  txn.lateDays          = lateDays;
  txn.fineWaived        = fineWaived || false;
  txn.fineWaivedReason  = fineWaivedReason || undefined;

  if (fineApplied) {
    txn.fineApplied = true;
    txn.fineAmount  = fineAmount || 0;
  } else if (!fineWaived && lateDays > 0 && txn.asset.finePerDay > 0) {
    txn.fineApplied = true;
    txn.fineAmount  = lateDays * txn.asset.finePerDay;
  }

  await txn.save();
  const populated = await AssetTransaction.findById(txn._id).populate(POPULATE);
  recomputeGroupStatus(txn.group).catch(console.error);
  res.json(new ApiResponse(200, populated, 'Asset returned successfully'));
});

export const extendBorrow = asyncHandler(async (req, res) => {
  const { newReturnDate, approvedBy: approverId, notes } = req.body;

  const [txn, approver, settings] = await Promise.all([
    AssetTransaction.findById(req.params.id),
    User.findById(approverId),
    Settings.getOrCreate(),
  ]);

  if (!txn)                    throw new ApiError(404, 'Transaction not found');
  if (txn.status === 'returned') throw new ApiError(400, 'Cannot extend a returned transaction');
  if (!approver?.canApproveAssets) throw new ApiError(400, 'Selected approver does not have asset approval authority');

  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const newDate = new Date(newReturnDate);
  const diffDays = Math.ceil((newDate - today) / (1000 * 60 * 60 * 24));

  if (newDate <= new Date(txn.expectedReturnDate)) throw new ApiError(400, 'New return date must be later than current return date');
  if (diffDays < 1)                                throw new ApiError(400, 'New return date must be in the future');
  if (diffDays > settings.assetMaxBorrowDays)      throw new ApiError(400, `New return date cannot be more than ${settings.assetMaxBorrowDays} days from today`);

  txn.extensions.push({
    previousReturnDate: txn.expectedReturnDate,
    newReturnDate:      newDate,
    approvedBy:         approverId,
    approvedAt:         new Date(),
    extendedBy:         req.user._id,
    notes:              notes || undefined,
  });

  txn.expectedReturnDate = newDate;
  if (txn.status === 'overdue') txn.status = 'checked_out';

  await txn.save();
  const populated = await AssetTransaction.findById(txn._id).populate(POPULATE);
  res.json(new ApiResponse(200, populated, 'Borrow period extended successfully'));
});

export const getAvailability = asyncHandler(async (req, res) => {
  const { assetId, returnDate } = req.query;
  if (!assetId) throw new ApiError(400, 'assetId is required');

  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError(404, 'Asset not found');

  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const checkUntil = returnDate ? new Date(returnDate) : today;

  const borrowed = await AssetTransaction.aggregate([
    { $match: { asset: asset._id, status: { $in: ['approved', 'checked_out', 'overdue'] }, expectedReturnDate: { $gte: checkUntil } } },
    { $group: { _id: null, total: { $sum: '$quantityBorrowed' } } },
  ]);

  const available = asset.totalQuantity - (borrowed[0]?.total || 0);
  res.json(new ApiResponse(200, { totalQuantity: asset.totalQuantity, available: Math.max(0, available) }));
});

export const getTransactionCounts = asyncHandler(async (req, res) => {
  const [overdue, approved, checkedOut] = await Promise.all([
    AssetTransaction.countDocuments({ status: 'overdue' }),
    AssetTransaction.countDocuments({ status: 'approved' }),
    AssetTransaction.countDocuments({ status: 'checked_out' }),
  ]);
  res.json(new ApiResponse(200, { overdue, approved, checkedOut, active: overdue + approved + checkedOut }));
});

export const cancelBorrow = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  const txn = await AssetTransaction.findById(req.params.id);
  if (!txn)                      throw new ApiError(404, 'Transaction not found');
  if (txn.status !== 'approved') throw new ApiError(400, 'Only approved (not yet collected) requests can be cancelled');

  txn.status             = 'cancelled';
  txn.cancellationReason = cancellationReason || undefined;
  await txn.save();

  const populated = await AssetTransaction.findById(txn._id).populate(POPULATE);
  recomputeGroupStatus(txn.group).catch(console.error);
  res.json(new ApiResponse(200, populated, 'Borrow request cancelled'));
});

export const bulkSendReminders = asyncHandler(async (req, res) => {
  const POPULATE = [
    { path: 'asset',    select: 'name' },
    { path: 'borrower', select: 'name phone whatsappAlertsEnabled smsAlertsEnabled' },
  ];

  const overdue = await AssetTransaction.find({ status: 'overdue' }).populate(POPULATE);
  if (!overdue.length) {
    return res.json(new ApiResponse(200, { sent: 0, failed: 0, total: 0 }, 'No overdue transactions found'));
  }

  let sent = 0; let failed = 0;
  for (const txn of overdue) {
    try { await sendManualAssetReminder(txn); sent++; }
    catch { failed++; }
  }

  res.json(new ApiResponse(200, { sent, failed, total: overdue.length }, `Reminders sent to ${sent} borrower(s)`));
});

export const sendManualReminderEndpoint = asyncHandler(async (req, res) => {
  const txn = await AssetTransaction.findById(req.params.id).populate(POPULATE);
  if (!txn) throw new ApiError(404, 'Transaction not found');
  if (['returned', 'cancelled'].includes(txn.status)) throw new ApiError(400, 'Cannot send reminder for this transaction');

  await sendManualAssetReminder(txn);
  res.json(new ApiResponse(200, null, 'Reminder sent successfully'));
});

