export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'users:read', 'users:write', 'users:delete',
    'masters:read', 'masters:write', 'masters:delete',
    'transactions:read', 'transactions:create', 'transactions:void',
    'reports:read', 'reports:export',
    'assets:read', 'assets:write', 'assets:manage',
    'donations:read', 'donations:write',
    'payments:read', 'payments:write', 'payments:approve',
  ],
  store_manager: [
    'users:read',
    'masters:read', 'masters:write',
    'transactions:read', 'transactions:create', 'transactions:void',
    'reports:read', 'reports:export',
    'assets:read', 'assets:manage',
    'donations:read', 'donations:write',
    'payments:read', 'payments:write', 'payments:approve',
  ],
  staff: [
    'masters:read',
    'transactions:read', 'transactions:create',
    'reports:read',
    'assets:read',
    'donations:read',
    'payments:read', 'payments:write',
  ],
  viewer: [
    'masters:read',
    'reports:read',
    'donations:read',
    'payments:read',
  ],
};

export const ROLE_LABELS = {
  super_admin:   'Super Admin',
  admin:         'Admin',
  store_manager: 'Store Manager',
  staff:         'Staff',
  viewer:        'Viewer',
};
