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

## 9a. Uploaded files (expense receipts)

Receipts are stored in `server/uploads/` **on the host** (bind-mounted into the server container),
so rebuilding the container no longer deletes them, and the nightly backup (§10) copies them.

> **One-time, when first deploying this change:** older deployments kept receipts *inside* the
> container, and `docker compose up --build` would delete them. Copy them out **before** rebuilding:
>
> ```bash
> docker cp mgm_server:/app/uploads/. server/uploads/   # run while the old container still exists
> docker compose up -d --build
> ```

Android app updates are published the same way, in `mobile-releases/` on the host — see MOBILE.md.

---

## 10. Nightly database backups

The free Atlas tier (M0) keeps **no backups**. `backup-db.sh` dumps the whole database
(using `MONGO_URI` from `server/.env`) to a compressed archive on this VM every night, keeps the
last **14 daily + 8 weekly (Sunday)** copies in `/var/backups/mgm/`, and never replaces a good
archive with a failed or empty one. `mongodump` runs inside the official `mongo` Docker image,
so nothing needs installing on the host.

**Set up (once):**

```bash
cd /root/mangal-gruh-mandir          # adjust to where the repo is cloned
git pull
chmod +x backup-db.sh restore-db.sh
./backup-db.sh                       # first run pulls the mongo image (~1 min) and makes a backup
ls -lh /var/backups/mgm/daily/
./restore-db.sh verify /var/backups/mgm/daily/<file>.archive.gz   # proves it restores; prints counts
```

**Schedule it** — `crontab -e` and add (server clock in UTC → 20:00 UTC = 1:30 AM India time;
check with `date`, and use `30 1 * * *` instead if the server is set to IST):

```
0 20 * * * cd /root/mangal-gruh-mandir && ./backup-db.sh >> /var/log/mgm-backup.log 2>&1
```

**Get told when it fails (recommended):** create a free check at [healthchecks.io](https://healthchecks.io)
(period 1 day, grace 2 hours), and put its ping URL in the repo-root `.env`:
`HEALTHCHECK_URL=https://hc-ping.com/<uuid>`. You get an email if a night's backup fails or doesn't run.

**Off-site copy (optional):** the archives live on this VM, separate from Atlas. To also survive
losing the VM, install [rclone](https://rclone.org/install/), run `rclone config` to add e.g. a Google
Drive remote, and set `RCLONE_REMOTE=gdrive:mgm-backups` in `.env`. Copies older than 90 days are pruned.

**Restore:**

```bash
./restore-db.sh verify <archive>     # safe — restores into a temporary container and prints counts
./backup-db.sh                       # take a fresh backup of the current state first
./restore-db.sh live <archive>       # DANGER — replaces the live database; asks you to type its name
docker compose restart server
```

Do a `verify` every month or two — an untested backup isn't a backup.

---

## Operations cheatsheet

```bash
docker compose logs -f server        # tail server logs
docker compose restart server        # restart after env change
docker compose pull && docker compose up -d --build   # deploy new code (after git pull)
```

**Backups:** see section 10 — `./backup-db.sh` (manual run), `./restore-db.sh verify|live <archive>`.

**App crashes:** the website, desktop and mobile apps report crashes to the server automatically.
See them under **Admin → App Errors** (grouped, with a count, the screen, app version and user).

**Time zone:** the server runs on India time (`TZ=Asia/Kolkata`), so "today", daily reports and the
9:00 / 9:30 alerts and the 8:30 push summary follow the IST calendar.

## Notes
- **nginx config is edited in place by `init-letsencrypt.sh`** (it replaces `yourdomain.com` in
  `nginx/conf.d/app.conf`). That makes the server's copy differ from git, so any future change to
  `app.conf` in the repo will block `git pull` there. Before pulling such a change, run
  `git checkout -- nginx/conf.d/app.conf` on the server, pull, then re-apply the domain with
  `sed -i "s/yourdomain.com/mandir.aumora.io/g" nginx/conf.d/app.conf` and `docker compose restart nginx`.
- MongoDB runs on **Atlas**, not in Docker — there is no `mongodb` container or `mongo_data` volume.
- The client calls the API at the relative path `/api`, proxied by nginx to `server:5000` — no build-time API URL needed.
- Only **nginx** exposes public ports (80/443); server and client are reachable only on the internal `mgm_net` network.
