#!/usr/bin/env bash
# Deploys the code checked out here on the server: rebuilds and restarts the containers, waits
# for the API, then runs the permission migrations (each only adds permissions — safe to repeat).
#
# Run automatically by .github/workflows/ci.yml after the tests pass on main (DEPLOY.md §14),
# or by hand on the server:   cd ~/mangal-gruh-mandir && git pull && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Building and restarting the containers"
docker compose up -d --build --remove-orphans

echo "▶ Waiting for the API to answer"
ok=""
for _ in $(seq 1 60); do
  if docker compose exec -T server node -e \
    "fetch('http://localhost:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "✖ The API did not start — last server log lines:"
  docker compose logs --tail 80 server
  exit 1
fi

echo "▶ Permission migrations (add-only)"
# Not migrate:roles — it resets built-in roles and would undo permissions changed in the app.
for m in migrate:assets migrate:mahaprasad migrate:attendance migrate:bookings; do
  docker compose exec -T server npm run --silent "$m"
done

echo "▶ Nightly backup"
# backup-db.sh (DEPLOY.md §10) at 1:30 AM India time, whatever the server's clock is set to.
# Added once when no backup line exists; an existing one is left as it is.
if ! command -v crontab >/dev/null 2>&1; then
  echo "  ⚠ cron isn't installed — nightly backups are not scheduled (DEPLOY.md §10)"
elif crontab -l 2>/dev/null | grep -q 'backup-db\.sh'; then
  echo "  scheduled"
else
  when="$(date -d 'TZ="Asia/Kolkata" 01:30' '+%-M %-H') * * *"
  { crontab -l 2>/dev/null || true; echo "$when cd $PWD && bash ./backup-db.sh >> /var/log/mgm-backup.log 2>&1"; } | crontab -
  echo "  scheduled now: $when (server time)"
fi
if ! grep -qs '^RCLONE_REMOTE=.' .env; then
  echo "  ⚠ RCLONE_REMOTE isn't set in .env — backups and receipts stay on this server only (DEPLOY.md §10)"
fi

echo "▶ Removing old images"
docker image prune -f >/dev/null || true

echo "✔ Deployed $(git log -1 --format='%h %s')"
