import AuditLog from '../models/AuditLog.js';

/**
 * Fire-and-forget audit log entry. Never throws.
 * Call without await so it doesn't block the response.
 */
export function logAction(req, { action, entity, entityId, entityRef, before, after, meta = {} }) {
  const user = req?.user
    ? { _id: req.user._id, name: req.user.name, role: String(req.user.role || '') }
    : null;

  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip        = forwarded ? forwarded.split(',')[0].trim() : req?.ip;
  const userAgent = req?.headers?.['user-agent'];

  AuditLog.create({
    user, action, entity,
    entityId:  entityId  || undefined,
    entityRef: entityRef || undefined,
    before:    before    || undefined,
    after:     after     || undefined,
    meta:      Object.keys(meta).length ? meta : undefined,
    ip, userAgent,
  }).catch(() => {});
}

/**
 * Log a failed login attempt (no req.user available yet).
 */
export function logLoginFailure(req, email) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip        = forwarded ? forwarded.split(',')[0].trim() : req?.ip;

  AuditLog.create({
    user: null,
    action: 'auth.login_failed',
    entity: 'User',
    meta: { email },
    ip,
    userAgent: req?.headers?.['user-agent'],
  }).catch(() => {});
}
