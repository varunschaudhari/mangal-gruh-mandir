export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'users:read', 'users:write', 'users:delete',
    'masters:read', 'masters:write', 'masters:delete',
    'transactions:read', 'transactions:create', 'transactions:delete',
    'reports:read',
    'assets:read', 'assets:write', 'assets:manage',
    'donations:read', 'donations:write',
    'payments:read', 'payments:write', 'payments:approve',
    'mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem',
  ],
  store_manager: [
    'users:read',
    'masters:read', 'masters:write',
    'transactions:read', 'transactions:create', 'transactions:delete',
    'reports:read',
    'assets:read', 'assets:manage',
    'donations:read', 'donations:write',
    'payments:read', 'payments:write', 'payments:approve',
    'mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem',
  ],
  staff: [
    'masters:read',
    'transactions:read', 'transactions:create',
    'reports:read',
    'assets:read',
    'donations:read',
    'payments:read', 'payments:write',
    'mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem',
  ],
  viewer: [
    'masters:read',
    'reports:read',
    'donations:read',
    'payments:read',
    'mahaprasad:read',
  ],
};

export const ROLE_LABELS = {
  super_admin:   'Super Admin',
  admin:         'Admin',
  store_manager: 'Store Manager',
  staff:         'Staff',
  viewer:        'Viewer',
};
