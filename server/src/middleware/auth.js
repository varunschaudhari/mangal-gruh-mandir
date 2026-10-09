import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'No token provided');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }

  // Only access tokens may call the API. Refresh tokens from before sessions were JWTs
  // signed with the same secret (no `typ`, 7-day life) — never accept those here.
  const lifetime = (decoded.exp || 0) - (decoded.iat || 0);
  if (decoded.typ ? decoded.typ !== 'access' : lifetime > 2 * 24 * 60 * 60) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const user = await User.findById(decoded.id).select('-password -refreshToken');
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User not found or deactivated');
  }

  req.user = user;
  req.auth = { sid: decoded.sid };
  next();
});

export default protect;
