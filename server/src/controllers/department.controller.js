import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';

export const getDepartments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  const depts = await Department.find(filter).sort({ sortOrder: 1, name: 1 });
  res.json(new ApiResponse(200, depts));
});

export const getDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw new ApiError(404, 'Department not found');
  res.json(new ApiResponse(200, dept));
});

export const createDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.create(req.body);
  logAction(req, {
    action: 'department.create', entity: 'Department',
    entityId: dept.name, entityRef: dept._id,
    meta: { code: dept.code },
  });
  res.status(201).json(new ApiResponse(201, dept, 'Department created'));
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after', runValidators: true,
  });
  if (!dept) throw new ApiError(404, 'Department not found');
  logAction(req, {
    action: 'department.update', entity: 'Department',
    entityId: dept.name, entityRef: dept._id,
  });
  res.json(new ApiResponse(200, dept, 'Department updated'));
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findByIdAndDelete(req.params.id);
  if (!dept) throw new ApiError(404, 'Department not found');
  logAction(req, {
    action: 'department.delete', entity: 'Department',
    entityId: dept.name, entityRef: dept._id,
  });
  res.json(new ApiResponse(200, null, 'Department deleted'));
});
