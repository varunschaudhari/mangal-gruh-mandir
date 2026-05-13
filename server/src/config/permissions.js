export const PERMISSIONS = {
  USERS_READ:           'users:read',
  USERS_WRITE:          'users:write',
  USERS_DELETE:         'users:delete',

  MASTERS_READ:         'masters:read',
  MASTERS_WRITE:        'masters:write',
  MASTERS_DELETE:       'masters:delete',

  TRANSACTIONS_READ:    'transactions:read',
  TRANSACTIONS_CREATE:  'transactions:create',
  TRANSACTIONS_VOID:    'transactions:void',

  REPORTS_READ:         'reports:read',
  REPORTS_EXPORT:       'reports:export',
};

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

export const ROLES = ['super_admin', 'admin', 'store_manager', 'staff', 'viewer'];
