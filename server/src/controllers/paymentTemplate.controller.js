import PaymentTemplate from '../models/PaymentTemplate.js';
import Supplier from '../models/Supplier.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';

const POPULATE = [
  { path: 'supplier',  select: 'name bankAccounts' },
  { path: 'createdBy', select: 'name' },
];

// GET /payment-templates
export const getTemplates = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.supplier) filter.supplier = req.query.supplier;
  const templates = await PaymentTemplate.find(filter)
    .populate(POPULATE)
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .lean();
  res.json(new ApiResponse(200, templates));
});

// POST /payment-templates
export const createTemplate = asyncHandler(async (req, res) => {
  const { name, supplier: supplierId, paymentMode, bankName, selectedBankAccountId, notes } = req.body;
  if (!name?.trim())  throw new ApiError(400, 'Template name is required');
  if (!supplierId)    throw new ApiError(400, 'Supplier is required');

  const supplierDoc = await Supplier.findById(supplierId);
  if (!supplierDoc?.isActive) throw new ApiError(404, 'Supplier not found or inactive');

  const template = await PaymentTemplate.create({
    name:                  name.trim(),
    supplier:              supplierId,
    paymentMode:           paymentMode  || 'cash',
    bankName:              bankName     || undefined,
    selectedBankAccountId: selectedBankAccountId || undefined,
    notes:                 notes        || undefined,
    createdBy:             req.user._id,
  });

  const populated = await PaymentTemplate.findById(template._id).populate(POPULATE).lean();
  logAction(req, {
    action: 'template.create', entity: 'PaymentTemplate',
    entityId: template.name, entityRef: template._id,
    meta: { supplier: supplierDoc.name },
  });
  res.status(201).json(new ApiResponse(201, populated, 'Template saved'));
});

// DELETE /payment-templates/:id
export const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await PaymentTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  template.isActive = false;
  await template.save();
  logAction(req, {
    action: 'template.delete', entity: 'PaymentTemplate',
    entityId: template.name, entityRef: template._id,
  });
  res.json(new ApiResponse(200, null, 'Template deleted'));
});

// PATCH /payment-templates/:id/use — increment usage counter and return the template
export const markTemplateUsed = asyncHandler(async (req, res) => {
  const template = await PaymentTemplate.findById(req.params.id).populate(POPULATE);
  if (!template) throw new ApiError(404, 'Template not found');
  template.usageCount = (template.usageCount || 0) + 1;
  template.lastUsedAt = new Date();
  await template.save();
  res.json(new ApiResponse(200, template.toObject()));
});
