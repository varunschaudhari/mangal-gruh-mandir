import express, { Router } from 'express';
import { ingestPunches } from '../services/attendance/adms.js';
import { parseGlog, readFkJson } from '../services/attendance/fkweb.js';
import { knownDevice } from '../services/attendance/machineGate.js';
import { deviceLimiter } from '../middleware/rateLimiter.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

// Endpoint for FkWeb machines (Team Office Z900 and others — services/attendance/fkweb.js has the
// protocol). On the machine: Server-Client Mode "FkWeb", Web Server URL http://<domain>/fkweb.
// nginx also sends here any request to the domain that carries a request_code header, for
// machines that only take an address without a path. Same approval and address rules as
// /iclock (services/attendance/machineGate.js).
const router = Router();
router.use(deviceLimiter);
router.use(express.raw({ type: () => true, limit: '2mb' }));

// FkWeb headers have underscores; accept the dashed spelling too in case a proxy rewrote them
const header = (req, name) => req.get(name) ?? req.get(name.replace(/_/g, '-'));

function reply(res, code, transId) {
  res.status(200).set({ 'Content-Type': 'application/octet-stream', 'Content-Length': '0', response_code: code });
  if (transId) res.set('trans_id', transId);
  res.end();
}

// The first request of each kind from each machine is logged with its JSON, so a machine whose
// firmware words things differently can be diagnosed from the server log.
const seen = new Set();
function noteFirst(serial, requestCode, json) {
  const key = `${serial}|${requestCode}`;
  if (seen.has(key) || seen.size > 200) return;
  seen.add(key);
  logger.info('FkWeb machine request', { serial, requestCode, json: JSON.stringify(json)?.slice(0, 600) });
}

router.all('/', asyncHandler(async (req, res) => {
  const requestCode = String(header(req, 'request_code') || '').trim();
  const serial = String(header(req, 'dev_id') || '').trim();
  const transId = String(header(req, 'trans_id') || '').trim().slice(0, 64);
  if (!requestCode || !serial) return res.status(404).type('text/plain').send('Not found');

  const device = await knownDevice(serial, req.ip);
  // ERROR → the machine keeps the punch and sends it again later, so nothing is lost before approval
  if (!device) return reply(res, 'ERROR', transId);

  const json = readFkJson(req.body);
  if (json) noteFirst(device.serial, requestCode, json);

  if (requestCode === 'realtime_glog') {
    const blk = header(req, 'blk_no');
    // A punch sent in parts (a photo attached) has its JSON in the first part; later parts are
    // only the photo
    if (blk && blk !== '1' && !json) return reply(res, 'OK', transId);
    const punch = parseGlog(json);
    if (!punch) {
      // Acknowledged anyway — refusing would make the machine resend it forever and hold back the
      // punches behind it. The log keeps what it sent, so it can be added by hand.
      logger.warn('FkWeb punch not understood', { serial: device.serial, json: JSON.stringify(json)?.slice(0, 600) });
      return reply(res, 'OK', transId);
    }
    const saved = await ingestPunches(device.serial, [punch]);
    logger.info('Attendance punches received', { serial: device.serial, received: 1, saved });
    return reply(res, 'OK', transId);
  }

  // receive_cmd (we have no commands for it), send_cmd_result, realtime_enroll_data…: acknowledged
  reply(res, 'OK', transId);
}));

export default router;
