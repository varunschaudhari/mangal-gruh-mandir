import Role from '../models/Role.js';
import User from '../models/User.js';
import { flushRoleCache } from '../middleware/authorize.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logAction } from '../services/audit.service.js';

export const getRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find()
    .populate('createdBy', 'name')
    .sort({ isSystem: -1, name: 1 })
    .lean();

  // Attach user count per role
  const counts = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  const withCounts = roles.map((r) => ({ ...r, userCount: countMap[r.slug] || 0 }));
  res.json(new ApiResponse(200, withCounts));
});

export const getRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id).populate('createdBy', 'name').lean();
  if (!role) throw new ApiError(404, 'Role not found');
  res.json(new ApiResponse(200, role));
});

export const createRole = asyncHandler(async (req, res) => {
  const { slug, name, description, permissions } = req.body;

  if (!slug || !name) throw new ApiError(400, 'slug and name are required');
  if (!/^[a-z0-9_]+$/.test(slug)) throw new ApiError(400, 'Slug must be lowercase letters, numbers, underscores only');

  const existing = await Role.findOne({ slug });
  if (existing) throw new ApiError(409, `Role with slug "${slug}" already exists`);

  const role = await Role.create({
    slug, name, description: description || '',
    permissions: permissions || [],
    isSystem: false,
    createdBy: req.user._id,
  });

  flushRoleCache();
  logAction(req, {
    action: 'role.create', entity: 'Role',
    entityId: role.slug, entityRef: role._id,
    meta: { name: role.name, permissions: role.permissions },
  });
  res.status(201).json(new ApiResponse(201, role, 'Role created'));
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');

  const { name, description, permissions, isActive } = req.body;

  // System roles: only allow editing permissions and isActive (not slug/name)
  if (role.isSystem) {
    if (permissions !== undefined) role.permissions = permissions;
    if (isActive !== undefined) role.isActive = isActive;
  } else {
    if (name !== undefined) role.name = name;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;
    if (isActive !== undefined) role.isActive = isActive;
  }

  await role.save();
  flushRoleCache();
  logAction(req, {
    action: 'role.update', entity: 'Role',
    entityId: role.slug, entityRef: role._id,
    meta: { name: role.name, permissions: role.permissions },
  });
  res.json(new ApiResponse(200, role, 'Role updated'));
});

export const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  if (role.isSystem) throw new ApiError(400, 'System roles cannot be deleted');

  const usersWithRole = await User.countDocuments({ role: role.slug });
  if (usersWithRole > 0) {
    throw new ApiError(400, `Cannot delete: ${usersWithRole} user(s) have this role. Reassign them first.`);
  }

  await role.deleteOne();
  flushRoleCache();
  logAction(req, {
    action: 'role.delete', entity: 'Role',
    entityId: role.slug, entityRef: role._id,
    meta: { name: role.name },
  });
  res.json(new ApiResponse(200, null, 'Role deleted'));
});
