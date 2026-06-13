import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]+$/,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    permissions: [{ type: String }],
    // System roles (seeded defaults) cannot be deleted
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ALL_PERMISSIONS = [
  'users:read', 'users:write', 'users:delete',
  'masters:read', 'masters:write', 'masters:delete',
  'transactions:read', 'transactions:create', 'transactions:delete',
  'reports:read',
  'assets:read', 'assets:write', 'assets:manage',
  'donations:read', 'donations:write',
  'payments:read', 'payments:write', 'payments:approve',
  'mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem',
];

export const PERMISSION_GROUPS = {
  Users:        ['users:read', 'users:write', 'users:delete'],
  Masters:      ['masters:read', 'masters:write', 'masters:delete'],
  Transactions: ['transactions:read', 'transactions:create', 'transactions:delete'],
  Reports:      ['reports:read'],
  Assets:       ['assets:read', 'assets:write', 'assets:manage'],
  Donations:    ['donations:read', 'donations:write'],
  Payments:     ['payments:read', 'payments:write', 'payments:approve'],
  Mahaprasad:   ['mahaprasad:read', 'mahaprasad:issue', 'mahaprasad:redeem'],
};

const Role = mongoose.model('Role', roleSchema);
export default Role;
