// Which biometric machines may send punches — shared by both machine endpoints (/iclock for
// ZKTeco/eSSL, /fkweb for Team Office and other FkWeb machines). A machine is only trusted once
// an admin approves its serial number in Settings → Attendance, and only from its allowed
// addresses (the serial is printed on the machine). With none set, the first address it
// connects from after approval is locked in.
import AttendanceSettings from '../../models/AttendanceSettings.js';
import { cleanIp, ipAllowed } from './adms.js';
import { logger } from '../../utils/logger.js';

const lastSeenWrite = new Map(); // serial → time we last stored lastSeenAt (machines poll every few seconds)

// Records the machine's visit; returns it if approved, otherwise null (new machines appear
// in Settings as "waiting for approval"). Atomic updates, so an admin editing settings at
// the same moment isn't overwritten.
export async function knownDevice(rawSerial, rawIp) {
  const serial = String(rawSerial || '').trim().slice(0, 64);
  if (!serial) return null;
  const settings = await AttendanceSettings.getOrCreate();
  const device = settings.devices.find((d) => d.serial === serial);
  const now = new Date();
  const ip = cleanIp(rawIp);
  if (!device) {
    // Cap the waiting list so random serial numbers can't grow the settings document.
    if (settings.devices.filter((d) => !d.approved).length >= 10) return null;
    await AttendanceSettings.updateOne(
      { _id: settings._id, 'devices.serial': { $ne: serial } },
      { $push: { devices: { serial, approved: false, lastSeenAt: now, lastIp: ip } } },
    );
    logger.info('New attendance machine waiting for approval', { serial });
    return null;
  }
  if (device.approved && !String(device.allowedIps || '').trim() && ip) {
    // Approved with no address yet: lock it to the one it connects from now (the machine polls
    // every few seconds, so this is the machine itself). From then on its serial number alone —
    // printed on the machine — isn't enough to send punches from anywhere else.
    const locked = await AttendanceSettings.updateOne(
      { _id: settings._id, devices: { $elemMatch: { serial, approved: true, allowedIps: { $in: ['', null] } } } },
      { $set: { 'devices.$.allowedIps': ip } },
    );
    if (locked.modifiedCount) logger.info('Attendance machine locked to its network address', { serial, ip });
    device.allowedIps = (await AttendanceSettings.findById(settings._id).lean())
      ?.devices.find((d) => d.serial === serial)?.allowedIps || ip;
  }
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
