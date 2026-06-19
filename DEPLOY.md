# Deployment Guide — Mangal Grah Mandir

Deploy target: a fresh Linux VM with domain **mandir.aumora.io**, MongoDB on **Atlas** (managed cloud),
app served by **Docker Compose** (server + client + nginx + certbot/Let's Encrypt SSL).

---

## 0. What you need to have ready

| Item | Notes |
|---|---|
| A Linux VM | Ubuntu 22.04/24.04 LTS, 2 vCPU / 4 GB RAM. Note its **public IP**. |
| Domain `mandir.aumora.io` | Access to its DNS settings to add an A record. |
| MongoDB Atlas account | A cluster created (M0 free is fine to start). |
| Atlas connection string | With a **strong** db password (rotate the one shared in chat). |
| An email address | For Let's Encrypt cert registration/expiry notices. |
| WhatsApp / MSG91 keys | Optional — can be filled in later; reports/alerts work once set. |

---

## 1. Provision the VM

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out and back in
```

Open firewall ports **22, 80, 443** only (e.g. via your cloud provider's security group / ufw).

---

## 2. DNS — point the domain at the VM

In your DNS provider for `mandir.aumora.io`, add an **A record**:

```
mandir.aumora.io    A   <VM_PUBLIC_IP>
```

> Use a plain **A record** on the subdomain — no CNAME, no www variant needed.

Wait until it resolves before requesting SSL:

```bash
dig +short mandir.aumora.io      # must return <VM_PUBLIC_IP>
```

> SSL issuance WILL fail if DNS isn't live yet.

---

## 3. MongoDB Atlas

1. **Network Access** → Add IP Address → enter the **VM's public IP** as `<VM_PUBLIC_IP>/32`
   (`/32` = exactly that one IP). Do **not** use `0.0.0.0/0` in production.
2. **Database Access** → create user `mgm_app` with a strong password
   (avoid `@ : / ? # &`, or URL-encode them in the URI). Role: read/write to `mgm_stock`.
3. **Connect → Drivers** → copy the connection string and add the database name `mgm_stock`:

```
mongodb+srv://mgm_app:<password>@cluster0.3bw4jwf.mongodb.net/mgm_stock?retryWrites=true&w=majority&appName=Cluster0
```

> The `mgm_stock` database is created automatically on the first write (the seed step below).

---

## 4. Get the code and configure secrets

```bash
git clone <your-repo-url> mangal-gruh-mandir
cd mangal-gruh-mandir
cp .env.example .env
cp server/.env.example server/.env
```

**Edit `.env`** (used only by the SSL bootstrap script):

```ini
DOMAIN=mandir.aumora.io
CERTBOT_EMAIL=you@example.com
```

**Edit `server/.env`** (the real app config):

```ini
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://mgm_app:<password>@cluster0.3bw4jwf.mongodb.net/mgm_stock?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=<long-random-string>          # generate: openssl rand -base64 48
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d
CLIENT_URL=https://mandir.aumora.io
SEED_ADMIN_EMAIL=admin@mandir.com
SEED_ADMIN_PASSWORD=<strong-password>    # change after first login
SEED_ADMIN_NAME=Super Admin
# WhatsApp / MSG91 keys — fill in when available
```

---

## 5. Build and start the stack

```bash
docker compose config            # validate the file + env substitution
docker compose up -d --build     # builds server + client, starts nginx + certbot
docker compose ps                # all should be "Up"
```

---

## 6. Seed the database (creates mgm_stock + super admin)

```bash
docker compose exec server npm run seed
docker compose logs server | grep -i "MongoDB connected"   # confirm Atlas connection
```

This first write creates the `mgm_stock` database on Atlas. Then log in once at the URL
(after SSL below) with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and **change the password**.

---

## 7. Enable HTTPS (Let's Encrypt)

```bash
chmod +x init-letsencrypt.sh
# uses DOMAIN + CERTBOT_EMAIL from .env; or pass inline:
DOMAIN=mandir.aumora.io EMAIL=you@example.com STAGING=1 ./init-letsencrypt.sh   # test run first
DOMAIN=mandir.aumora.io EMAIL=you@example.com ./init-letsencrypt.sh             # real cert
```

Run with `STAGING=1` first to avoid Let's Encrypt rate limits; once it works, run again
without `STAGING` for the real certificate.

---

## 8. Auto-renew SSL (certs expire in 90 days)

```bash
sudo crontab -e
# add (adjust the path to where you cloned the repo):
0 3,15 * * * cd /home/$USER/mangal-gruh-mandir && docker compose run --rm certbot renew --webroot -w /var/www/certbot && docker compose exec nginx nginx -s reload
```

---

## 9. Verify

- `https://mandir.aumora.io` loads with a valid padlock.
- Login works; `/api/` calls succeed (`docker compose logs -f server`).
- `docker compose ps` → `server`, `client`, `nginx` all `Up`.

---

## Operations cheatsheet

```bash
docker compose logs -f server        # tail server logs
docker compose restart server        # restart after env change
docker compose pull && docker compose up -d --build   # deploy new code (after git pull)
```

**Backups:** Atlas handles backups on paid tiers (M0 free has none). To dump manually:

```bash
docker compose exec server npx --yes mongodb-tools >/dev/null 2>&1 || true
# or run mongodump locally against the Atlas URI
```

## Notes
- MongoDB runs on **Atlas**, not in Docker — there is no `mongodb` container or `mongo_data` volume.
- The client calls the API at the relative path `/api`, proxied by nginx to `server:5000` — no build-time API URL needed.
- Only **nginx** exposes public ports (80/443); server and client are reachable only on the internal `mgm_net` network.
