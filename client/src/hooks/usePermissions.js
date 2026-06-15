import { useAuth } from './useAuth.js';
import { ROLE_PERMISSIONS } from '../utils/permissions.js';

export const usePermissions = () => {
  const { user } = useAuth();
  const role = user?.role || 'viewer';
  // Prefer server-resolved permissions (supports custom roles); fall back to hardcoded map
  const perms = user?.permissions ?? ROLE_PERMISSIONS[role] ?? [];

  const can = (...required) => {
    if (perms.includes('*')) return true;
    return required.every((p) => perms.includes(p));
  };

  return { can, role, user };
};
