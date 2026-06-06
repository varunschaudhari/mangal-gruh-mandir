import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined)           filter.isActive = req.query.active === 'true';
  if (req.query.canApproveAssets !== undefined) filter.canApproveAssets = req.query.canApproveAssets === 'true';

  const users = await User.find(filter)
    .populate('departments', 'name code')
    .select('-password -refreshToken')
    .sort({ createdAt: -1 });
  res.json(new ApiResponse(200, users));
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
    .select('-password -refreshToken');
  if (!user) throw new ApiError(404, 'User not found');
  res.json(new ApiResponse(200, user));
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, departments, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments } = req.body;

  if (req.user.role !== 'super_admin' && role === 'super_admin') {
    throw new ApiError(403, 'Cannot create super_admin user');
  }

  if (await User.findOne({ email })) throw new ApiError(409, 'Email already in use');

  const user = await User.create({
    name, email, password, phone, role, departments,
    whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments,
    createdBy: req.user._id,
  });

  const populated = await User.findById(user._id).populate('departments', 'name code');
  res.status(201).json(new ApiResponse(201, populated, 'User created successfully'));
});

export const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role, departments, isActive, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments } = req.body;

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found');

  if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
    throw new ApiError(403, 'Cannot modify a super_admin user');
  }
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    throw new ApiError(403, 'Cannot assign super_admin role');
  }

  Object.assign(target, { name, phone, role, departments, isActive, whatsappAlertsEnabled, smsAlertsEnabled, canApproveAssets, canApprovePayments });
  await target.save({ validateBeforeSave: false });

  const populated = await User.findById(target._id).populate('departments', 'name code');
  res.json(new ApiResponse(200, populated, 'User updated successfully'));
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  user.password = newPassword;
  await user.save();
  res.json(new ApiResponse(200, null, 'Password reset successfully'));
});
