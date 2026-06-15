import Role from '../models/Role.js';
import ApiError from '../utils/ApiError.js';

// In-memory cache: slug → permissions[]
let roleCache = {};
let cacheExpiresAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPermissionsForRole(slug) {
  const now = Date.now();
  if (now < cacheExpiresAt && roleCache[slug] !== undefined) {
    return roleCache[slug];
  }

  // Refresh entire cache
  const roles = await Role.find({ isActive: true }).lean();
  roleCache = {};
  for (const r of roles) {
    roleCache[r.slug] = r.permissions || [];
  }
  cacheExpiresAt = now + CACHE_TTL;

  return roleCache[slug] || [];
}

// Exported so tests / admin operations can force a cache flush
export function flushRoleCache() {
  roleCache = {};
  cacheExpiresAt = 0;
}

export { getPermissionsForRole };

const authorize = (...requiredPermissions) => async (req, res, next) => {
  try {
    const perms = await getPermissionsForRole(req.user.role);

    if (perms.includes('*')) return next();

    const hasAll = requiredPermissions.every((p) => perms.includes(p));
    if (!hasAll) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  } catch (err) {
    next(err);
  }
};

export default authorize;
