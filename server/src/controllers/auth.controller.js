import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction, logLoginFailure } from '../services/audit.service.js';
import { getPermissionsForRole } from '../middleware/authorize.js';

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email }).select('+password');
  if (!user || !user.isActive) {
    logLoginFailure(req, email);
    throw new ApiError(401, 'Invalid credentials');
  }
  if (!(await user.matchPassword(password))) {
    logLoginFailure(req, email);
    throw new ApiError(401, 'Invalid credentials');
  }

  const accessToken = signToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  logAction(req, {
    action: 'auth.login', entity: 'User',
    entityId: user.email, entityRef: user._id,
    meta: { role: user.role },
  });
  const permissions = await getPermissionsForRole(user.role);
  res.json(
    new ApiResponse(200, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions,
        departments: user.departments,
        canApproveAssets:   user.canApproveAssets,
        canApprovePayments: user.canApprovePayments,
      },
    }, 'Login successful')
  );
});

export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new ApiError(401, 'Refresh token required');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token || !user.isActive) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const accessToken = signToken(user._id, user.role);
  res.json(new ApiResponse(200, { accessToken }, 'Token refreshed'));
});

export const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  logAction(req, {
    action: 'auth.logout', entity: 'User',
    entityId: req.user.email, entityRef: req.user._id,
  });
  res.json(new ApiResponse(200, null, 'Logged out successfully'));
});

export const getMe = asyncHandler(async (req, res) => {
  const [user, permissions] = await Promise.all([
    User.findById(req.user._id).populate('departments', 'name code'),
    getPermissionsForRole(req.user.role),
  ]);
  const userData = user.toObject();
  userData.permissions = permissions;
  res.json(new ApiResponse(200, userData));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Name is required');

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { name: name.trim(), phone: phone?.trim() || '' } },
    { returnDocument: 'after', runValidators: true }
  ).populate('departments', 'name code');

  logAction(req, {
    action: 'auth.profile_update', entity: 'User',
    entityId: req.user.email, entityRef: req.user._id,
    meta: { name: name.trim() },
  });
  res.json(new ApiResponse(200, user, 'Profile updated'));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Both passwords required');
  if (newPassword.length < 6) throw new ApiError(400, 'New password must be at least 6 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) throw new ApiError(401, 'Current password is incorrect');

  user.password = newPassword;
  await user.save();
  logAction(req, {
    action: 'auth.password_change', entity: 'User',
    entityId: req.user.email, entityRef: req.user._id,
  });
  res.json(new ApiResponse(200, null, 'Password changed successfully'));
});
