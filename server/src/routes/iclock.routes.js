import express, { Router } from 'express';
import { handshake, ingestPunches, parseAttlog } from '../services/attendance/adms.js';
import { knownDevice as knownDeviceFor } from '../services/attendance/machineGate.js';
import { deviceLimiter } from '../middleware/rateLimiter.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

// Endpoint the biometric machine talks to (ZKTeco/eSSL ADMS protocol) — mounted at /iclock,
// outside /api, because that path is fixed in the machines' firmware. Which machines are accepted:
// services/attendance/machineGate.js.
const router = Router();
router.use(deviceLimiter);
router.use(express.text({ type: () => true, limit: '2mb' }));

const plain = (res, status, text) => res.status(status).type('text/plain').send(text);

const knownDevice = (req) => knownDeviceFor(req.query.SN, req.ip);

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
