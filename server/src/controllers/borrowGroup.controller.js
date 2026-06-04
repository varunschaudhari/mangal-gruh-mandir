import BorrowGroup from '../models/BorrowGroup.js';
import AssetTransaction from '../models/AssetTransaction.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateBorrowGroupNumber } from '../services/borrowGroupNumber.service.js';
import { generateAssetTransactionNumber } from '../services/assetTransactionNumber.service.js';
import { recomputeGroupStatus } from '../services/borrowGroupStatus.service.js';
import { sendAssetApprovalNotification } from '../services/assetReminder.service.js';

const GROUP_POPULATE = [
  { path: 'borrower',   select: 'name phone' },
  { path: 'approvedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
  { path: 'extensions.approvedBy', select: 'name' },
  { path: 'extensions.extendedBy', select: 'name' },
];

const TXN_POPULATE = [
  { path: 'asset',      select: 'name category finePerDay totalQuantity' },
  { path: 'approvedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
];

// ── List ─────────────────────────────────────────────────────────────────────
export const getGroups = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status)   filter.status   = req.query.status;
  if (req.query.borrower) filter.borrower = req.query.borrower;

  if (req.query.search) {
    const s = req.query.search.trim();
    const userMatches = await User.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean();
    const orClauses = [{ groupNumber: { $regex: s, $options: 'i' } }];
    if (userMatches.length) orClauses.push({ borrower: { $in: userMatches.map((u) => u._id) } });
    filter.$or = orClauses;
  }

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const [groups, total] = await Promise.all([
    BorrowGroup.find(filter).populate(GROUP_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    BorrowGroup.countDocuments(filter),
  ]);

  // Attach item count to each group
  const groupIds = groups.map((g) => g._id);
  const counts   = await AssetTransaction.aggregate([
    { $match: { group: { $in: groupIds } } },
    { $group: { _id: '$group', itemCount: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.itemCount]));

  const data = groups.map((g) => ({ ...g.toObject(), itemCount: countMap[g._id.toString()] || 0 }));
  res.json(new ApiResponse(200, { data, total, page, pages: Math.ceil(total / limit) }));
});

// ── Detail ────────────────────────────────────────────────────────────────────
export const getGroup = asyncHandler(async (req, res) => {
  const group = await BorrowGroup.findById(req.params.id).populate(GROUP_POPULATE);
  if (!group) throw new ApiError(404, 'Borrow group not found');

  const transactions = await AssetTransaction.find({ group: group._id }).populate(TXN_POPULATE);
  res.json(new ApiResponse(200, { group, transactions }));
});

// ── Create ────────────────────────────────────────────────────────────────────
export const createGroup = asyncHandler(async (req, res) => {
  const { borrower, approvedBy, expectedReturnDate, notes, items } = req.body;

  if (!items || items.length === 0) throw new ApiError(400, 'At least one item is required');

  const [borrowerDoc, approver, settings] = await Promise.all([
    User.findById(borrower),
    User.findById(approvedBy),
    Settings.getOrCreate(),
  ]);

  if (!borrowerDoc)                throw new ApiError(404, 'Borrower not found');
  if (!approver?.canApproveAssets) throw new ApiError(400, 'Selected approver does not have asset approval authority');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const returnDate = new Date(expectedReturnDate);
  const diffDays   = Math.ceil((returnDate - today) / 86400000);
  if (diffDays < 1)                           throw new ApiError(400, 'Return date must be in the future');
  if (diffDays > settings.assetMaxBorrowDays) throw new ApiError(400, `Maximum borrow duration is ${settings.assetMaxBorrowDays} days`);

  // Validate each item + check availability
  for (const item of items) {
    const assetDoc = await Asset.findById(item.asset);
    if (!assetDoc || !assetDoc.isActive) throw new ApiError(404, `Asset not found: ${item.asset}`);

    const borrowed = await AssetTransaction.aggregate([
      { $match: { asset: assetDoc._id, status: { $in: ['approved', 'checked_out', 'overdue'] }, expectedReturnDate: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$quantityBorrowed' } } },
    ]);
    const available = assetDoc.totalQuantity - (borrowed[0]?.total || 0);
    if (item.quantity > available) throw new ApiError(400, `Only ${available} unit(s) of "${assetDoc.name}" available`);
  }

  // Create group
  const groupNumber = await generateBorrowGroupNumber();
  const group = await BorrowGroup.create({
    groupNumber, borrower, approvedBy,
    approvedAt: new Date(), expectedReturnDate,
    status: 'approved',
    notes: notes || undefined,
    createdBy: req.user._id,
  });

  // Create individual transactions
  const transactions = [];
  for (const item of items) {
    const txnNumber = await generateAssetTransactionNumber();
    const txn = await AssetTransaction.create({
      transactionNumber: txnNumber,
      group: group._id,
      asset: item.asset,
      borrower, approvedBy,
      approvedAt: new Date(),
      quantityBorrowed: item.quantity,
      expectedReturnDate,
      status: 'approved',
      createdBy: req.user._id,
    });
    transactions.push(txn);
  }

  const populatedGroup = await BorrowGroup.findById(group._id).populate(GROUP_POPULATE);
  const populatedTxns  = await AssetTransaction.find({ group: group._id }).populate(TXN_POPULATE);

  // Send one approval notification using first transaction's data
  if (populatedTxns.length > 0) {
    const notifTxn = {
      ...populatedTxns[0].toObject(),
      borrower:    populatedGroup.borrower,
      asset:       { name: populatedTxns.map((t) => t.asset?.name).join(', ') },
      quantityBorrowed: populatedTxns.reduce((s, t) => s + t.quantityBorrowed, 0),
      expectedReturnDate,
    };
    sendAssetApprovalNotification(notifTxn).catch(console.error);
  }

  res.status(201).json(new ApiResponse(201, { group: populatedGroup, transactions: populatedTxns }, 'Borrow group created'));
});

// ── Checkout All ──────────────────────────────────────────────────────────────
export const checkoutGroup = asyncHandler(async (req, res) => {
  const { conditionAtCheckout } = req.body;
  if (!conditionAtCheckout) throw new ApiError(400, 'conditionAtCheckout is required');

  const group = await BorrowGroup.findById(req.params.id);
  if (!group) throw new ApiError(404, 'Group not found');
  if (!['approved', 'checked_out'].includes(group.status)) throw new ApiError(400, 'Group is not in a state that allows checkout');

  // Checkout all approved items
  await AssetTransaction.updateMany(
    { group: group._id, status: 'approved' },
    { $set: { status: 'checked_out', checkedOutAt: new Date(), conditionAtCheckout } }
  );

  const newStatus = await recomputeGroupStatus(group._id);
  const [populatedGroup, transactions] = await Promise.all([
    BorrowGroup.findById(group._id).populate(GROUP_POPULATE),
    AssetTransaction.find({ group: group._id }).populate(TXN_POPULATE),
  ]);

  res.json(new ApiResponse(200, { group: populatedGroup, transactions }, 'All assets handed over'));
});

// ── Extend ────────────────────────────────────────────────────────────────────
export const extendGroup = asyncHandler(async (req, res) => {
  const { newReturnDate, approvedBy: approverId, notes } = req.body;

  const [group, approver, settings] = await Promise.all([
    BorrowGroup.findById(req.params.id),
    User.findById(approverId),
    Settings.getOrCreate(),
  ]);

  if (!group)                    throw new ApiError(404, 'Group not found');
  if (group.status === 'returned' || group.status === 'cancelled') throw new ApiError(400, 'Cannot extend a completed group');
  if (!approver?.canApproveAssets) throw new ApiError(400, 'Selected approver does not have asset approval authority');

  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const newDate = new Date(newReturnDate);
  const diffDays = Math.ceil((newDate - today) / 86400000);

  if (newDate <= new Date(group.expectedReturnDate)) throw new ApiError(400, 'New return date must be later than current return date');
  if (diffDays < 1)                                   throw new ApiError(400, 'New return date must be in the future');
  if (diffDays > settings.assetMaxBorrowDays)         throw new ApiError(400, `New return date cannot be more than ${settings.assetMaxBorrowDays} days from today`);

  // Record extension on group
  group.extensions.push({ previousReturnDate: group.expectedReturnDate, newReturnDate: newDate, approvedBy: approverId, approvedAt: new Date(), extendedBy: req.user._id, notes: notes || undefined });
  group.expectedReturnDate = newDate;
  if (group.status === 'overdue') group.status = 'checked_out';
  await group.save();

  // Update all non-returned transactions
  await AssetTransaction.updateMany(
    { group: group._id, status: { $in: ['approved', 'checked_out', 'overdue'] } },
    { $set: { expectedReturnDate: newDate }, $push: { extensions: { previousReturnDate: group.extensions.at(-1).previousReturnDate, newReturnDate: newDate, approvedBy: approverId, approvedAt: new Date(), extendedBy: req.user._id, notes: notes || undefined } } }
  );

  const [populatedGroup, transactions] = await Promise.all([
    BorrowGroup.findById(group._id).populate(GROUP_POPULATE),
    AssetTransaction.find({ group: group._id }).populate(TXN_POPULATE),
  ]);

  res.json(new ApiResponse(200, { group: populatedGroup, transactions }, 'Borrow period extended'));
});

// ── Cancel ────────────────────────────────────────────────────────────────────
export const cancelGroup = asyncHandler(async (req, res) => {
  const { cancellationReason } = req.body;

  const group = await BorrowGroup.findById(req.params.id);
  if (!group) throw new ApiError(404, 'Group not found');

  const hasCheckedOut = await AssetTransaction.exists({ group: group._id, status: { $in: ['checked_out', 'overdue', 'returned'] } });
  if (hasCheckedOut) throw new ApiError(400, 'Cannot cancel — some items are already checked out or returned. Cancel individual items instead.');

  await AssetTransaction.updateMany(
    { group: group._id, status: 'approved' },
    { $set: { status: 'cancelled', cancellationReason } }
  );

  group.status             = 'cancelled';
  group.cancellationReason = cancellationReason || undefined;
  await group.save();

  res.json(new ApiResponse(200, { group }, 'Group cancelled'));
});
