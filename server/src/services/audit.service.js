import AuditLog from '../models/AuditLog.js';
import { getPermissionsForRole } from '../middleware/authorize.js';
import { logger } from '../utils/logger.js';

// A failed write must not fail the action, but it must not go unnoticed either
const saveEntry = (entry) => AuditLog.create(entry).catch((err) => {
  logger.error('Audit log entry could not be saved', { action: entry.action, entity: entry.entity, error: err.message });
});

/**
 * Fire-and-forget audit log entry. Never throws.
 * Call without await so it doesn't block the response. `user` names who did it when the request
 * has no signed-in user yet (signing in).
 */
export function logAction(req, { action, entity, entityId, entityRef, before, after, meta = {}, user: who }) {
  const by = who || req?.user;
  const user = by
    ? { _id: by._id, name: by.name, role: String(by.role || '') }
    : null;

  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip        = forwarded ? forwarded.split(',')[0].trim() : req?.ip;
  const userAgent = req?.headers?.['user-agent'];

  saveEntry({
    user, action, entity,
    entityId:  entityId  || undefined,
    entityRef: entityRef || undefined,
    before:    before    || undefined,
    after:     after     || undefined,
    meta:      meta && Object.keys(meta).length ? meta : undefined,
    ip, userAgent,
  });
}

/**
 * Log a failed login attempt (no req.user available yet).
 */
export function logLoginFailure(req, email) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip        = forwarded ? forwarded.split(',')[0].trim() : req?.ip;

  saveEntry({
    user: null,
    action: 'auth.login_failed',
    entity: 'User',
    meta: { email },
    ip,
    userAgent: req?.headers?.['user-agent'],
  });
}

// ── What changed ──────────────────────────────────────────────────────────────

const BOOKKEEPING = new Set(['_id', '__v', 'createdAt', 'updatedAt']);

/** A value as compared and stored in the log: dates as text, ids as strings, no Mongo bookkeeping. */
export function plainValue(v, drop = BOOKKEEPING) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  if (Array.isArray(v)) return v.map((x) => plainValue(x, drop));
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !drop.has(k)).map(([k, x]) => [k, plainValue(x, drop)]));
  }
  return v;
}

/**
 * The fields that differ between two snapshots (plain objects), as { before, after } holding only
 * those fields — or null when nothing changed. `mask` hides values in the log (a bank account to
 * its last 4 digits, a secret to "(set)"); `drop` names keys left out at any depth.
 */
export function changedValues(before, after, keys, { mask = {}, drop = [] } = {}) {
  const skip = new Set([...BOOKKEEPING, ...drop]);
  const b = {};
  const a = {};
  for (const k of keys || [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]) {
    if (skip.has(k)) continue;
    const x = plainValue(before?.[k], skip);
    const y = plainValue(after?.[k], skip);
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    b[k] = mask[k] ? mask[k](x) : x;
    a[k] = mask[k] ? mask[k](y) : y;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Bank account and the like in the log: only the last 4 digits. */
export const maskTail = (v) => (v ? `XXXX${String(v).slice(-4)}` : '');
/** Access tokens and keys: only whether one is set. */
export const maskSecret = (v) => (v ? '(set)' : '(empty)');

// ── Who may read which entries ────────────────────────────────────────────────

// An entry is shown to those who may read its module: the part of the action before the first
// dot decides which permission. Users, roles, logins and settings need user administration.
const ACTION_READ = {
  asset: 'assets:read',
  attendance: 'attendance:read',
  salary: 'salary:read',
  booking: 'bookings:read',
  donation: 'donations:read',
  mahaprasad: 'mahaprasad:read',
  expense: 'payments:read', payment: 'payments:read', template: 'payments:read', budget: 'payments:read',
  purchase: 'transactions:read', stock: 'transactions:read',
  category: 'masters:read', department: 'masters:read', product: 'masters:read', unit: 'masters:read',
  supplier: 'masters:read', donation_occasion: 'masters:read', mahaprasad_occasion: 'masters:read',
  auth: 'users:read', user: 'users:read', role: 'users:read', settings: 'users:read', audit: 'users:read',
};

/** The audit query condition for what this role may see ({} = everything). */
export async function visibleToRole(role) {
  const perms = await getPermissionsForRole(role);
  if (perms.includes('*')) return {};
  const modules = Object.entries(ACTION_READ).filter(([, p]) => perms.includes(p)).map(([m]) => m);
  return modules.length ? { action: { $regex: `^(${modules.join('|')})\\.` } } : { _id: null };
}
