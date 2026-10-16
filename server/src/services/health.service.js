import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// What /api/health and /api/health/backup report. Used by deploy.sh, the desktop counters
// (offline mode when the server can't serve them) and the uptime monitor
// (.github/workflows/uptime.yml).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 'ok' when the database answers a ping within `ms`, otherwise 'down'. */
export async function databaseStatus(ms = 3000) {
  const conn = mongoose.connection;
  if (conn.readyState !== 1 || !conn.db) return 'down';
  let timer;
  try {
    await Promise.race([
      conn.db.admin().ping(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
    ]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

// Written by backup-db.sh after each good backup and mounted read-only into the container
// (docker-compose.yml). Not there in development, or before the first backup.
const BACKUP_STATUS = process.env.BACKUP_STATUS_FILE || path.join(__dirname, '../../backup-status/last.json');

/**
 * When the last backup finished and whether it was copied off the server. No file names,
 * sizes or places — this is answered to anyone.
 */
export async function backupStatus(now = Date.now()) {
  let s;
  try { s = JSON.parse(await readFile(BACKUP_STATUS, 'utf8')); } catch { return { reporting: false }; }
  const at = new Date(s.at);
  if (Number.isNaN(at.getTime())) return { reporting: false };
  return {
    reporting:      true,
    at:             at.toISOString(),
    ageHours:       Math.round(((now - at.getTime()) / 36e5) * 10) / 10,
    offsite:        s.offsite === true,          // the database archive
    uploadsOffsite: s.uploadsOffsite === true,   // expense receipts and other uploaded files
  };
}
