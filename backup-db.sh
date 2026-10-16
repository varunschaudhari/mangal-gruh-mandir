#!/usr/bin/env bash
# Backs up the MongoDB Atlas database (MONGO_URI in server/.env) to a compressed archive,
# and mirrors uploaded files (server/uploads). The free Atlas tier keeps no backups, so
# this is the only copy outside Atlas.
#
#   - Keeps the last KEEP_DAILY daily archives and KEEP_WEEKLY Sunday archives.
#   - Off-site copy of the archive and the uploaded files with rclone: set RCLONE_REMOTE
#     (e.g. "gdrive:mgm-backups") — DEPLOY.md §10. Uses rclone if installed, otherwise its
#     Docker image. Until it is set, the uptime monitor reports that backups stay on this server.
#   - Writes $BACKUP_DIR/status/last.json after each good run (time, whether it went off-site);
#     the API shows it at /api/health/backup for the uptime monitor.
#   - Optional failure alerts: set HEALTHCHECK_URL (e.g. a free healthchecks.io check);
#     it is pinged on success and "<url>/fail" on failure.
#
# Usage (repo root on the server):  ./backup-db.sh
# Nightly cron — see DEPLOY.md §10:  0 20 * * * cd /root/mangal-gruh-mandir && ./backup-db.sh >> /var/log/mgm-backup.log 2>&1
# Check a backup is restorable:      ./restore-db.sh verify <archive>
set -Eeuo pipefail   # -E: the ERR trap also fires inside functions

cd "$(dirname "$0")"

# --- load optional settings (BACKUP_DIR, RCLONE_REMOTE, HEALTHCHECK_URL…) from .env ---
if [ -f .env ]; then set -a; . ./.env; set +a; fi

ENV_FILE="${ENV_FILE:-server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mgm}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:8}"   # official image ships mongodump — nothing to install on the host
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RCLONE_KEEP_DAYS="${RCLONE_KEEP_DAYS:-90}"
RCLONE_IMAGE="${RCLONE_IMAGE:-rclone/rclone:1.75.1}"            # used when rclone isn't installed
RCLONE_CONFIG_DIR="${RCLONE_CONFIG_DIR:-$HOME/.config/rclone}"  # where `rclone config` saved the remote
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
UPLOADS_DIR="${UPLOADS_DIR:-server/uploads}"   # expense receipts (bind-mounted into the server container)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ping_health() { [ -n "$HEALTHCHECK_URL" ] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL$1" >/dev/null || true; }

TMP=""
on_error() {
  log "BACKUP FAILED"
  [ -n "$TMP" ] && rm -f "$TMP"
  ping_health /fail
}
trap on_error ERR

# Read only MONGO_URI from server/.env (don't source it — it holds other secrets).
MONGO_URI=$({ grep -E '^MONGO_URI=' "$ENV_FILE" || true; } | head -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
if [ -z "$MONGO_URI" ]; then
  log "MONGO_URI not found in $ENV_FILE"
  false
fi

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

# File names use India time so they match the temple's calendar day.
STAMP=$(TZ=Asia/Kolkata date +%Y-%m-%d_%H%M)
FILE="mgm_${STAMP}.archive.gz"
TMP="$BACKUP_DIR/daily/.${FILE}.part"

log "Dumping database to $BACKUP_DIR/daily/$FILE"
# URI goes in via the environment, not the command line, so it never shows up in `ps`.
docker run --rm \
  -e MONGO_URI="$MONGO_URI" \
  -v "$BACKUP_DIR/daily:/out" \
  "$MONGO_IMAGE" \
  sh -c "mongodump --uri=\"\$MONGO_URI\" --archive=/out/.${FILE}.part --gzip --quiet"

# A truncated or empty archive must never replace a good one.
gzip -t "$TMP"
SIZE=$(stat -c %s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  log "Archive is suspiciously small ($SIZE bytes)"
  false
fi
mv "$TMP" "$BACKUP_DIR/daily/$FILE"
TMP=""
chmod 600 "$BACKUP_DIR/daily/$FILE"
log "Saved $FILE ($(du -h "$BACKUP_DIR/daily/$FILE" | cut -f1))"

# Sunday's dump is also kept as a weekly copy (hard link — no extra disk space).
if [ "$(TZ=Asia/Kolkata date +%u)" = "7" ]; then
  ln -f "$BACKUP_DIR/daily/$FILE" "$BACKUP_DIR/weekly/$FILE"
  log "Kept as weekly backup"
fi

# Rotation: newest first, delete everything past the keep count.
prune() { { ls -1t "$1"/mgm_*.archive.gz 2>/dev/null || true; } | tail -n +"$(( $2 + 1 ))" | xargs -r rm -f --; }
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

# Uploaded files (expense receipts) aren't in the database. They never change once
# uploaded, so a growing mirror is enough — only new files are copied each night.
if [ -d "$UPLOADS_DIR" ]; then
  mkdir -p "$BACKUP_DIR/uploads"
  cp -a -u "$UPLOADS_DIR/." "$BACKUP_DIR/uploads/"
  log "Uploads mirrored to $BACKUP_DIR/uploads ($(du -sh "$BACKUP_DIR/uploads" | cut -f1))"
fi

# Off-site: a copy that survives losing this server. The archive goes up each night (older ones
# are pruned after RCLONE_KEEP_DAYS); uploads are copied as they come and never deleted there.
rclone_run() {
  if command -v rclone >/dev/null 2>&1; then rclone "$@"; return; fi
  # Same paths inside the container as outside, so the arguments work unchanged
  docker run --rm \
    -v "$RCLONE_CONFIG_DIR:/config/rclone" \
    -v "$BACKUP_DIR:$BACKUP_DIR:ro" \
    -v "$UPLOADS_ABS:$UPLOADS_ABS:ro" \
    "$RCLONE_IMAGE" "$@"
}
UPLOADS_ABS="$(cd "$(dirname "$UPLOADS_DIR")" && pwd)/$(basename "$UPLOADS_DIR")"
OFFSITE=false
UPLOADS_OFFSITE=false
OFFSITE_FAILED=""
if [ -n "$RCLONE_REMOTE" ]; then
  log "Copying off-site to $RCLONE_REMOTE"
  if rclone_run copy "$BACKUP_DIR/daily/$FILE" "$RCLONE_REMOTE/" --quiet; then
    OFFSITE=true
    rclone_run delete "$RCLONE_REMOTE/" --min-age "${RCLONE_KEEP_DAYS}d" --include "mgm_*.archive.gz" --quiet \
      || log "Could not prune old off-site archives (the copy itself worked)"
  else
    OFFSITE_FAILED=1; log "OFF-SITE COPY OF THE DATABASE FAILED"
  fi
  if [ ! -d "$UPLOADS_DIR" ]; then
    UPLOADS_OFFSITE=true   # nothing uploaded yet
  elif rclone_run copy "$UPLOADS_ABS" "$RCLONE_REMOTE/uploads" --quiet; then
    UPLOADS_OFFSITE=true
  else
    OFFSITE_FAILED=1; log "OFF-SITE COPY OF THE UPLOADS FAILED"
  fi
else
  log "WARNING: RCLONE_REMOTE is not set — this backup and the uploaded receipts exist only on this server (DEPLOY.md §10)"
fi

# What the uptime monitor reads (through /api/health/backup): when, and whether it left the server
mkdir -p "$BACKUP_DIR/status"
chmod 755 "$BACKUP_DIR/status"
printf '{"at":"%s","offsite":%s,"uploadsOffsite":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$OFFSITE" "$UPLOADS_OFFSITE" \
  > "$BACKUP_DIR/status/.last.json" && mv "$BACKUP_DIR/status/.last.json" "$BACKUP_DIR/status/last.json"
chmod 644 "$BACKUP_DIR/status/last.json"

if [ -n "$OFFSITE_FAILED" ]; then
  ping_health /fail
  log "Backup saved on this server, but the off-site copy failed"
  exit 1
fi
ping_health ""
log "Backup complete"
