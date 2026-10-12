import express, { Router } from 'express';
import AttendanceSettings from '../models/AttendanceSettings.js';
import { cleanIp, handshake, ingestPunches, ipAllowed, parseAttlog } from '../services/attendance/adms.js';
import { deviceLimiter } from '../middleware/rateLimiter.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

// Endpoint the biometric machine talks to (ZKTeco/eSSL ADMS protocol) — mounted at /iclock,
// outside /api, because that path is fixed in the machines' firmware. A machine is only
// trusted once an admin approves its serial number in Settings → Attendance — and, when the
// machine has allowed addresses set, only from those (the serial is printed on the machine).
const router = Router();
router.use(deviceLimiter);
router.use(express.text({ type: () => true, limit: '2mb' }));

const plain = (res, status, text) => res.status(status).type('text/plain').send(text);

const lastSeenWrite = new Map(); // serial → time we last stored lastSeenAt (machines poll every ~10 s)

// Records the machine's visit; returns it if approved, otherwise null (new machines appear
// in Settings as "waiting for approval"). Atomic updates, so an admin editing settings at
// the same moment isn't overwritten.
async function knownDevice(req) {
  const serial = String(req.query.SN || '').trim().slice(0, 64);
  if (!serial) return null;
  const settings = await AttendanceSettings.getOrCreate();
  const device = settings.devices.find((d) => d.serial === serial);
  const now = new Date();
  if (!device) {
    // Cap the waiting list so random serial numbers can't grow the settings document.
    if (settings.devices.filter((d) => !d.approved).length >= 10) return null;
    await AttendanceSettings.updateOne(
      { _id: settings._id, 'devices.serial': { $ne: serial } },
      { $push: { devices: { serial, approved: false, lastSeenAt: now, lastIp: cleanIp(req.ip) } } },
    );
    logger.info('New attendance machine waiting for approval', { serial });
    return null;
  }
  const ip = cleanIp(req.ip);
  if (device.approved && !ipAllowed(ip, device.allowedIps)) {
    // Right serial, wrong place: refused (noted for the settings screen, at most once a minute)
    if (now - (lastSeenWrite.get(`x:${serial}`) || 0) > 60 * 1000) {
      lastSeenWrite.set(`x:${serial}`, now);
      logger.warn('Attendance machine refused: not from an allowed address', { serial, ip });
      await AttendanceSettings.updateOne(
        { _id: settings._id, 'devices.serial': serial },
        { $set: { 'devices.$.blockedIp': ip, 'devices.$.blockedAt': now } },
      );
    }
    return null;
  }
  if (now - (lastSeenWrite.get(serial) || 0) > 60 * 1000) {
    lastSeenWrite.set(serial, now);
    await AttendanceSettings.updateOne(
      { _id: settings._id, 'devices.serial': serial },
      { $set: { 'devices.$.lastSeenAt': now, 'devices.$.lastIp': ip } },
    );
  }
  return device.approved ? device : null;
}

// First contact / periodic config fetch
router.get('/cdata', asyncHandler(async (req, res) => {
  const device = await knownDevice(req);
  if (!device) return plain(res, 403, 'Device not approved');
  plain(res, 200, handshake(device.serial));
}));

// Uploads: ATTLOG = punches; anything else (operation log, user list) is acknowledged.
router.post('/cdata', asyncHandler(async (req, res) => {
  const device = await knownDevice(req);
  // Not OK → the machine keeps the punches and retries, so nothing is lost before approval.
  if (!device) return plain(res, 403, 'Device not approved');
  const lines = String(req.body || '').split(/\r?\n/).filter((l) => l.trim()).length;
  if (String(req.query.table).toUpperCase() !== 'ATTLOG') return plain(res, 200, `OK: ${lines}`);
  const records = parseAttlog(req.body);
  const saved = await ingestPunches(device.serial, records);
  logger.info('Attendance punches received', { serial: device.serial, received: records.length, saved });
  plain(res, 200, `OK: ${records.length}`);
}));

// The machine polls for commands; we have none.
router.get('/getrequest', asyncHandler(async (req, res) => {
  await knownDevice(req);
  plain(res, 200, 'OK');
}));
router.post('/devicecmd', (req, res) => plain(res, 200, 'OK'));

export default router;
