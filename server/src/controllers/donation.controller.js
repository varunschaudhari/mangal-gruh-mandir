import Donation from '../models/Donation.js';
import Settings from '../models/Settings.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import StockTransaction from '../models/StockTransaction.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateDonationNumber } from '../services/donationNumber.service.js';
import { generateTransactionNumber } from '../services/transactionNumber.service.js';
import { createBatch } from '../services/fifo.service.js';
import { updateBalancesForTransaction } from '../services/stockBalance.service.js';
import { sendDonationThankYou } from '../services/donationWhatsapp.service.js';
import { logAction } from '../services/audit.service.js';

const POPULATE = [
  { path: 'donor',     select: 'name phone panNumber type' },
  { path: 'occasion',  select: 'name' },
  { path: 'receivedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
  { path: 'kindItems.product',    select: 'name code' },
  { path: 'kindItems.unit',       select: 'symbol name' },
  { path: 'kindItems.department', select: 'name code' },
];

// ── Helper: create Stock In for a kind item ──────────────────────────────────
async function createKindStockIn({ product, quantity, department, donorName, date, userId }) {
  const productDoc = await Product.findById(product).populate('unit');
  if (!productDoc) return null;

  const txnNumber = await generateTransactionNumber(date);

  const txn = await StockTransaction.create({
    transactionNumber: txnNumber,
    transactionType:   'STOCK_IN',
    transactionDate:   date,
    product:           productDoc._id,
    toDepartment:      department,
    quantity,
    unit:              productDoc.unit,
    rate:              0,
    totalValue:        0,
    stockInType:       'DONATION',
    donorName:         donorName || 'Anonymous',
    createdBy:         userId,
  });

  await createBatch(txn);
  await updateBalancesForTransaction(txn);

  return txn._id;
}

// ── Find main store department ───────────────────────────────────────────────
async function getDefaultDepartment() {
  const dept = await Department.findOne({ $or: [{ code: 'STR' }, { name: /main store/i }] }).lean();
  return dept?._id || null;
}

// ── List ──────────────────────────────────────────────────────────────────────
export const getDonations = asyncHandler(async (req, res) => {
  const filter = { isVoided: false };
  if (req.query.type)     filter.donationType = req.query.type;
  if (req.query.donor)    filter.donor        = req.query.donor;
  if (req.query.occasion) filter.occasion     = req.query.occasion;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to)   { const d = new Date(req.query.to); d.setHours(23,59,59,999); filter.date.$lte = d; }
  }

  if (req.query.search) {
    const s = req.query.search.trim();
    const donorMatches = await Supplier.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean();
    const orClauses = [
      { donationNumber: { $regex: s, $options: 'i' } },
      { donorName:      { $regex: s, $options: 'i' } },
      { donorPhone:     { $regex: s, $options: 'i' } },
    ];
    if (donorMatches.length) orClauses.push({ donor: { $in: donorMatches.map((d) => d._id) } });
    filter.$or = orClauses;
  }

  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  const [donations, total] = await Promise.all([
    Donation.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Donation.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, { data: donations, total, page, pages: Math.ceil(total / limit) }));
});

// ── Single ────────────────────────────────────────────────────────────────────
export const getDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id).populate(POPULATE);
  if (!donation) throw new ApiError(404, 'Donation not found');
  res.json(new ApiResponse(200, donation));
});

// ── Summary stats ──────────────────────────────────────────────────────────────
export const getDonationStats = asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(new Date().setDate(1));
  const to   = new Date(); to.setHours(23,59,59,999);

  const [stats] = await Donation.aggregate([
    { $match: { isVoided: false, date: { $gte: from, $lte: to } } },
    { $group: {
      _id: null,
      totalCash:      { $sum: '$cashAmount' },
      totalKindValue: { $sum: { $reduce: { input: '$kindItems', initialValue: 0, in: { $add: ['$$value', '$$this.estimatedValue'] } } } },
      namedCount:     { $sum: { $cond: [{ $eq: ['$donationType', 'named'] }, 1, 0] } },
      hundiCount:     { $sum: { $cond: [{ $eq: ['$donationType', 'hundi'] }, 1, 0] } },
      totalCount:     { $sum: 1 },
    }},
  ]);

  res.json(new ApiResponse(200, stats || { totalCash: 0, totalKindValue: 0, namedCount: 0, hundiCount: 0, totalCount: 0 }));
});

// ── Create ────────────────────────────────────────────────────────────────────
export const createDonation = asyncHandler(async (req, res) => {
  const { donationType, date, donor, donorName, donorPhone, panNumber, is80G, occasion, cashAmount, paymentMode, paymentRef, kindItems = [], notes } = req.body;

  if (!cashAmount && kindItems.length === 0) throw new ApiError(400, 'Donation must have cash amount or at least one kind item');

  const defaultDept = await getDefaultDepartment();
  const donationDate = date ? new Date(date) : new Date();
  const donationNumber = await generateDonationNumber();

  // Resolve donor display name for Stock In entries
  let resolvedDonorName = donorName || 'Anonymous';
  if (donor) {
    const supplierDoc = await (await import('../models/Supplier.js')).default.findById(donor).lean();
    if (supplierDoc) resolvedDonorName = supplierDoc.name;
  }

  // Create Stock In for each kind item
  const processedKindItems = [];
  for (const item of kindItems) {
    const dept = item.department || defaultDept;
    if (!dept) throw new ApiError(400, 'No department found for kind item. Please select a department.');

    const stockTxnId = await createKindStockIn({
      product:   item.product,
      quantity:  Number(item.quantity),
      department: dept,
      donorName: resolvedDonorName,
      date:      donationDate,
      userId:    req.user._id,
    });

    processedKindItems.push({
      product:        item.product,
      quantity:       Number(item.quantity),
      unit:           item.unit || undefined,
      department:     dept,
      estimatedValue: Number(item.estimatedValue) || 0,
      stockTransactionId: stockTxnId,
    });
  }

  const totalEstimatedValue = (Number(cashAmount) || 0) + processedKindItems.reduce((s, i) => s + (i.estimatedValue || 0), 0);

  const donation = await Donation.create({
    donationNumber,
    donationType: donationType || 'named',
    date:         donationDate,
    donor:        donor || undefined,
    donorName:    donorName || undefined,
    donorPhone:   donorPhone || undefined,
    panNumber:    panNumber || undefined,
    is80G:        !!(is80G && donationType === 'named' && panNumber),
    occasion:     occasion || undefined,
    cashAmount:   Number(cashAmount) || 0,
    paymentMode:  paymentMode || 'cash',
    paymentRef:   paymentRef || undefined,
    kindItems:    processedKindItems,
    totalEstimatedValue,
    notes:        notes || undefined,
    receivedBy:   req.user._id,
    createdBy:    req.user._id,
  });

  const populated = await Donation.findById(donation._id).populate(POPULATE);

  if (donationType === 'named') sendDonationThankYou(populated).catch(() => {});
  logAction(req, {
    action: 'donation.create', entity: 'Donation',
    entityId: donationNumber, entityRef: donation._id,
    meta: { type: donationType, donor: resolvedDonorName, cashAmount, kindCount: processedKindItems.length },
  });
  res.status(201).json(new ApiResponse(201, populated, 'Donation recorded'));
});

// ── Export helpers ───────────────────────────────────────────────────────────
async function buildExportFilter(query) {
  const filter = { isVoided: false };
  if (query.type)     filter.donationType = query.type;
  if (query.donor)    filter.donor        = query.donor;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to)   { const d = new Date(query.to); d.setHours(23,59,59,999); filter.date.$lte = d; }
  }
  return filter;
}

export const exportDonationsExcel = asyncHandler(async (req, res) => {
  const filter = await buildExportFilter(req.query);
  const donations = await Donation.find(filter).populate(POPULATE).sort({ date: -1 }).lean();
  const { generateDonationExcel } = await import('../services/donationExcel.service.js');
  await generateDonationExcel(res, { donations, from: req.query.from, to: req.query.to });
});

export const exportDonationsPDF = asyncHandler(async (req, res) => {
  const filter = await buildExportFilter(req.query);
  const donations = await Donation.find(filter).populate(POPULATE).sort({ date: -1 }).lean();
  const { generateDonationPDF } = await import('../services/donationPdf.service.js');
  generateDonationPDF(res, { donations, from: req.query.from, to: req.query.to });
});

// ── 80G Receipt ───────────────────────────────────────────────────────────────
export const get80GReceipt = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id).populate(POPULATE);
  if (!donation)        throw new ApiError(404, 'Donation not found');
  if (!donation.is80G)  throw new ApiError(400, 'This donation is not marked as 80G eligible');
  if (donation.isVoided) throw new ApiError(400, 'Cannot generate receipt for a voided donation');

  const settings = await Settings.getOrCreate();
  const { generate80GReceipt } = await import('../services/donationPdf.service.js');
  generate80GReceipt(res, { donation: donation.toObject(), settings: settings.toObject() });
});

// ── Donation Receipt PDF ──────────────────────────────────────────────────────
export const getDonationReceipt = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id).populate(POPULATE);
  if (!donation)         throw new ApiError(404, 'Donation not found');
  if (donation.isVoided) throw new ApiError(400, 'Cannot generate receipt for a voided donation');

  const settings = await Settings.getOrCreate();
  const { generateDonationReceipt } = await import('../services/donationPdf.service.js');
  generateDonationReceipt(res, { donation: donation.toObject(), settings: settings.toObject() });
});

// ── Donor Statement PDF ───────────────────────────────────────────────────────
export const getDonorStatement = asyncHandler(async (req, res) => {
  const { donorId } = req.params;
  const donor = await Supplier.findById(donorId).lean();
  if (!donor) throw new ApiError(404, 'Donor not found');

  const donations = await Donation.find({ donor: donorId, isVoided: false })
    .populate(POPULATE)
    .sort({ date: -1 })
    .lean();

  const settings = await Settings.getOrCreate();
  const { generateDonorStatement } = await import('../services/donationPdf.service.js');
  generateDonorStatement(res, { donor, donations, settings: settings.toObject() });
});

// ── Donor Lookup (walk-in phone search) ───────────────────────────────────────
export const lookupDonor = asyncHandler(async (req, res) => {
  const { phone } = req.query;
  if (!phone?.trim()) return res.json(new ApiResponse(200, null));
  const phoneClean = phone.trim();

  // Walk-in donors: donorPhone stored directly on Donation
  const walkInDonations = await Donation.find({ donorPhone: phoneClean, isVoided: false })
    .sort({ date: -1 })
    .select('donorName donorPhone panNumber cashAmount date')
    .lean();

  if (walkInDonations.length) {
    const latest = walkInDonations[0];
    return res.json(new ApiResponse(200, {
      donorName:     latest.donorName || null,
      donorPhone:    phoneClean,
      panNumber:     latest.panNumber || null,
      donorId:       null,
      donationCount: walkInDonations.length,
      totalAmount:   walkInDonations.reduce((s, d) => s + (d.cashAmount || 0), 0),
      lastDate:      latest.date,
      isLinked:      false,
    }));
  }

  // Linked Supplier-donor whose phone matches
  const supplierMatch = await Supplier.findOne({
    phone: { $regex: phoneClean, $options: 'i' },
    type:  { $in: ['donor', 'both'] },
  }).lean();

  if (supplierMatch) {
    const supplierDonations = await Donation.find({ donor: supplierMatch._id, isVoided: false })
      .sort({ date: -1 })
      .select('cashAmount date')
      .lean();
    if (supplierDonations.length) {
      return res.json(new ApiResponse(200, {
        donorName:     supplierMatch.name,
        donorPhone:    supplierMatch.phone,
        panNumber:     supplierMatch.panNumber || null,
        donorId:       supplierMatch._id,
        donationCount: supplierDonations.length,
        totalAmount:   supplierDonations.reduce((s, d) => s + (d.cashAmount || 0), 0),
        lastDate:      supplierDonations[0]?.date,
        isLinked:      true,
      }));
    }
  }

  return res.json(new ApiResponse(200, null));
});

// ── Void ──────────────────────────────────────────────────────────────────────
export const voidDonation = asyncHandler(async (req, res) => {
  const { voidReason } = req.body;
  const donation = await Donation.findById(req.params.id);
  if (!donation)         throw new ApiError(404, 'Donation not found');
  if (donation.isVoided) throw new ApiError(400, 'Already voided');

  donation.isVoided   = true;
  donation.voidReason = voidReason || undefined;
  await donation.save();
  logAction(req, {
    action: 'donation.void', entity: 'Donation',
    entityId: donation.donationNumber, entityRef: donation._id,
    meta: { voidReason },
  });
  res.json(new ApiResponse(200, donation, 'Donation voided'));
});
