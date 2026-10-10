import mongoose from 'mongoose';
import User from '../models/User.js';
import Staff from '../models/Staff.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { endAllSessions } from '../services/session.service.js';
import { profileFor, saveStaffProfile, validateProfile } from '../services/staffProfile.service.js';

// Department ids only — a form can send `false` or a single value for an empty checkbox group
const departmentIds = (v) => [].concat(v || []).filter((d) => mongoose.isValidObjectId(d));

export const getUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined)           filter.isActive = req.query.active === 'true';
  if (req.query.canApproveAssets !== undefined) filter.canApproveAssets = req.query.canApproveAssets === 'true';

  const users = await User.find(filter)
    .populate('departments', 'name code')
    .select('-password -refreshToken -monthlySalary')
    .sort({ createdAt: -1 })
    .lean();
  // Who is on attendance & payroll (staff code only — no pay details here)
  const profiles = await Staff.find({ user: { $in: users.map((u) => u._id) } }).select('user staffCode onPayroll').lean();
  const byUser = new Map(profiles.map((p) => [String(p.user), p]));
  res.json(new ApiResponse(200, users.map((u) => {
    const p = byUser.get(String(u._id));
    return { ...u, onPayroll: Boolean(p?.onPayroll), staffCode: p?.staffCode || '' };
  })));
});

export const getApprovers = asyncHandler(async (req, res) => {
  const users = await User.find({ canApproveAssets: true, isActive: true })
    .select('name')
    .sort({ name: 1 });
  res.json(new ApiResponse(200, users));
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('departments', 'name code')
    .select('-password -refreshToken')
    .lean();
  if (!user) throw new ApiError(404, 'User not found');
  res.json(new ApiResponse(200, { ...user, staffProfile: await profileFor(req, user._id) }));
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, departments, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments, staffProfile } = req.body;

  if (req.user.role !== 'super_admin' && role === 'super_admin') {
    throw new ApiError(403, 'Cannot create super_admin user');
  }

  if (await User.findOne({ email })) throw new ApiError(409, 'Email already in use');
  await validateProfile(req, null, staffProfile);

  const user = await User.create({
    name, email, password, phone, role, departments: departmentIds(departments),
    whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments,
    createdBy: req.user._id,
  });
  let profile;
  try {
    profile = await saveStaffProfile(req, user, staffProfile);
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // don't leave a half-made person behind
    throw err;
  }

  const populated = await User.findById(user._id).populate('departments', 'name code').lean();
  logAction(req, {
    action: 'user.create', entity: 'User',
    entityId: user.email, entityRef: user._id,
    meta: { role: user.role, staffCode: profile?.staffCode },
  });
  res.status(201).json(new ApiResponse(201, { ...populated, staffProfile: profile && await profileFor(req, user._id) }, 'User created successfully'));
});

export const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role, departments, isActive, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments, staffProfile } = req.body;

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');

  if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
    throw new ApiError(403, 'Cannot modify a super_admin user');
  }
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    throw new ApiError(403, 'Cannot assign super_admin role');
  }
  await validateProfile(req, target, staffProfile);

  const before = { role: target.role, isActive: target.isActive, canApprovePayments: target.canApprovePayments, canApproveAssets: target.canApproveAssets };
  Object.assign(target, { name, phone, role, departments: departmentIds(departments), isActive, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments });
  await target.save({ validateBeforeSave: false });
  if (before.isActive && target.isActive === false) await endAllSessions(target._id);
  const profile = await saveStaffProfile(req, target, staffProfile);

  const populated = await User.findById(target._id).populate('departments', 'name code').lean();
  logAction(req, {
    action: 'user.update', entity: 'User',
    entityId: target.email, entityRef: target._id,
    before,
    after: { role: target.role, isActive: target.isActive, canApprovePayments: target.canApprovePayments, canApproveAssets: target.canApproveAssets, onPayroll: profile?.onPayroll },
  });
  res.json(new ApiResponse(200, { ...populated, staffProfile: profile && await profileFor(req, target._id) }, 'User updated successfully'));
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save();
  await endAllSessions(user._id); // the old password's sessions must not keep working
  logAction(req, {
    action: 'user.password_reset', entity: 'User',
    entityId: user.email, entityRef: user._id,
  });
  res.json(new ApiResponse(200, null, 'Password reset successfully'));
});
