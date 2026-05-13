export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'users:read', 'users:write', 'users:delete',
    'masters:read', 'masters:write', 'masters:delete',
    'transactions:read', 'transactions:create', 'transactions:void',
    'reports:read', 'reports:export',
  ],
  store_manager: [
    'users:read',
    'masters:read', 'masters:write',
    'transactions:read', 'transactions:create', 'transactions:void',
    'reports:read', 'reports:export',
  ],
  staff: [
    'masters:read',
    'transactions:read', 'transactions:create',
    'reports:read',
  ],
  viewer: [
    'masters:read',
    'reports:read',
  ],
};

export const ROLE_LABELS = {
  super_admin:   'Super Admin',
  admin:         'Admin',
  store_manager: 'Store Manager',
  staff:         'Staff',
  viewer:        'Viewer',
};
