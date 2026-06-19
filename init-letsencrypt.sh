#!/usr/bin/env bash
# Bootstraps Let's Encrypt SSL for the Mangal Grah Mandir stack on a fresh VM.
# Solves the chicken-and-egg problem: nginx won't start without a cert, but
# certbot needs nginx running to answer the HTTP-01 challenge.
#
# Usage:  DOMAIN=mandir.yourdomain.com EMAIL=you@example.com ./init-letsencrypt.sh
# Or set DOMAIN / CERTBOT_EMAIL in .env and just run ./init-letsencrypt.sh
set -euo pipefail

# --- load .env if present ---
if [ -f .env ]; then set -a; . ./.env; set +a; fi

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-${CERTBOT_EMAIL:-}}"
STAGING="${STAGING:-0}"   # set STAGING=1 to test against Let's Encrypt staging (avoids rate limits)

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "ERROR: DOMAIN and EMAIL are required."
  echo "  e.g. DOMAIN=mandir.yourdomain.com EMAIL=you@example.com ./init-letsencrypt.sh"
  exit 1
fi

COMPOSE="docker compose"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "==> Substituting domain ($DOMAIN) into nginx config"
sed -i "s/yourdomain.com/$DOMAIN/g" nginx/conf.d/app.conf

echo "==> Creating a temporary self-signed cert so nginx can boot"
$COMPOSE run --rm --entrypoint "\
  sh -c 'mkdir -p $CERT_PATH && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout $CERT_PATH/privkey.pem \
    -out $CERT_PATH/fullchain.pem \
    -subj /CN=localhost'" certbot

echo "==> Starting nginx (and the app) with the dummy cert"
$COMPOSE up -d --build

echo "==> Deleting dummy cert and requesting the real one"
$COMPOSE run --rm --entrypoint "\
  sh -c 'rm -rf /etc/letsencrypt/live/$DOMAIN \
    /etc/letsencrypt/archive/$DOMAIN \
    /etc/letsencrypt/renewal/$DOMAIN.conf'" certbot

STAGING_FLAG=""
if [ "$STAGING" != "0" ]; then STAGING_FLAG="--staging"; fi

$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_FLAG \
    --email $EMAIL --agree-tos --no-eff-email \
    -d $DOMAIN" certbot

echo "==> Reloading nginx with the real certificate"
$COMPOSE exec nginx nginx -s reload

echo "==> Done. https://$DOMAIN should now be live."
echo "    Renewal: certbot renews on demand; see the cron note in the deploy steps."
