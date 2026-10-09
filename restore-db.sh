#!/usr/bin/env bash
# Restores a backup made by backup-db.sh.
#
#   ./restore-db.sh verify <archive>   Safe. Restores into a throwaway local MongoDB container,
#                                      prints the document count of every collection, then
#                                      deletes the container. Use it to prove backups work.
#
#   ./restore-db.sh live <archive>     DANGER. Replaces the collections in the live database
#                                      (MONGO_URI in server/.env) with the backup's contents.
#                                      Asks you to type the database name before doing anything.
#
# Archives live in /var/backups/mgm/{daily,weekly}/ by default (see backup-db.sh).
set -euo pipefail

cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi

ENV_FILE="${ENV_FILE:-server/.env}"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:8}"
MODE="${1:-}"
ARCHIVE="${2:-}"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ -n "$MODE" ] && [ -n "$ARCHIVE" ] || usage
[ -f "$ARCHIVE" ] || { echo "Archive not found: $ARCHIVE"; exit 1; }

ARCHIVE_DIR=$(cd "$(dirname "$ARCHIVE")" && pwd)
ARCHIVE_NAME=$(basename "$ARCHIVE")

case "$MODE" in
  verify)
    NAME="mgm_restore_check_$$"
    trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
    echo "Starting a temporary MongoDB…"
    docker run -d --name "$NAME" -v "$ARCHIVE_DIR:/backup:ro" "$MONGO_IMAGE" >/dev/null
    for _ in $(seq 1 30); do
      docker exec "$NAME" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1 && break
      sleep 1
    done
    echo "Restoring $ARCHIVE_NAME…"
    docker exec "$NAME" mongorestore --archive="/backup/$ARCHIVE_NAME" --gzip --quiet
    echo
    echo "Documents per collection in the backup:"
    docker exec "$NAME" mongosh --quiet --eval '
      db.getMongo().getDBNames()
        .filter((d) => !["admin", "config", "local"].includes(d))
        .forEach((d) => {
          const target = db.getSiblingDB(d);
          print(`\n  database: ${d}`);
          target.getCollectionNames().sort().forEach((c) =>
            print(`    ${c.padEnd(32)} ${target.getCollection(c).countDocuments()}`));
        });'
    echo
    echo "OK — the backup restores cleanly. (Temporary database removed.)"
    ;;

  live)
    MONGO_URI=$({ grep -E '^MONGO_URI=' "$ENV_FILE" || true; } | head -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
    [ -n "$MONGO_URI" ] || { echo "MONGO_URI not found in $ENV_FILE"; exit 1; }
    DB_NAME=$(echo "$MONGO_URI" | sed -E 's#^[^/]*//[^/]*/([^?]*).*#\1#')
    [ -n "$DB_NAME" ] || { echo "Could not read the database name from MONGO_URI"; exit 1; }

    echo "This REPLACES every collection in the live database \"$DB_NAME\""
    echo "with the contents of $ARCHIVE_NAME. Anything entered after that backup is lost."
    echo "Take a fresh backup first (./backup-db.sh) if you might need today's data."
    read -r -p "Type the database name ($DB_NAME) to continue: " CONFIRM
    [ "$CONFIRM" = "$DB_NAME" ] || { echo "Cancelled."; exit 1; }

    docker run --rm \
      -e MONGO_URI="$MONGO_URI" \
      -v "$ARCHIVE_DIR:/backup:ro" \
      "$MONGO_IMAGE" \
      sh -c "mongorestore --uri=\"\$MONGO_URI\" --archive=/backup/$ARCHIVE_NAME --gzip --drop --nsInclude='$DB_NAME.*'"
    echo "Restore complete. Restart the app: docker compose restart server"
    ;;

  *) usage ;;
esac
