import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// The status file is chosen when the module loads, so point it at a temporary one first
const dir = mkdtempSync(path.join(tmpdir(), 'mgm-health-'));
const file = path.join(dir, 'last.json');
process.env.BACKUP_STATUS_FILE = file;
const { backupStatus, databaseStatus } = await import('./health.service.js');

test.after(() => rmSync(dir, { recursive: true, force: true }));

test('no backup status yet → not reporting', async () => {
  assert.deepEqual(await backupStatus(), { reporting: false });
});

test('backup status: age in hours and whether it went off the server — nothing else', async () => {
  writeFileSync(file, JSON.stringify({ at: '2026-10-16T20:00:00Z', offsite: true, uploadsOffsite: false, file: 'mgm_x.archive.gz', remote: 'gdrive:secret' }));
  const s = await backupStatus(Date.parse('2026-10-17T02:30:00Z'));
  assert.deepEqual(s, { reporting: true, at: '2026-10-16T20:00:00.000Z', ageHours: 6.5, offsite: true, uploadsOffsite: false });
});

test('a damaged status file → not reporting', async () => {
  writeFileSync(file, '{"at": "not a date"}');
  assert.deepEqual(await backupStatus(), { reporting: false });
  writeFileSync(file, 'half a fi');
  assert.deepEqual(await backupStatus(), { reporting: false });
});

test('database not connected → down', async () => {
  assert.equal(await databaseStatus(), 'down');
});
