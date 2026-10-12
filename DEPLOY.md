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

## 11. Attendance module (biometric machine)

**First deploy of the attendance module** — the nginx config has an `/iclock/` route for the
machine (in `nginx/templates/app.conf.template`; see the nginx notes at the bottom of this file):

```bash
cd ~/mangal-gruh-mandir
git pull
docker compose up -d --build
docker compose exec server npm run migrate:attendance   # admin permissions + "Attendance Supervisor" role
```

Check the machine endpoint answers (a 403 "Device not approved" is the expected reply):

```bash
curl -i "http://mandir.aumora.io/iclock/cdata?SN=TEST"
```

Then remove the `TEST` entry it creates under **Attendance → Shifts & Machine**.

**Setting up the machine** (ZKTeco / eSSL with "ADMS" / "Cloud Server" support):
1. On the machine: **Menu → Comm. → Cloud Server Setting** — Server address `mandir.aumora.io`,
   Port `80`, Domain name **ON**, HTTPS **OFF** (most machines can't do HTTPS; nginx serves
   `/iclock/` on port 80 for this). Set the machine's date/time to India time.
2. Within a minute it appears under **Attendance → Shifts & Machine** as *waiting for approval*.
   Name it (e.g. "Main gate"), tick **Approved**, Save. Punches are refused until then — the machine
   keeps them and resends after approval, so nothing is lost.
3. Enrol each person's finger/face on the machine and enter the same **Machine number** on their user
   (**Admin → Users**, section *Attendance & payroll*). Punches that arrived before the number was
   entered are linked automatically; unknown numbers are listed on the Staff Register page with an
   "Add" link.

**People are always added in Admin → Users.** Every worker gets a login; give workers the
**Employee** role (no access to other modules). Tick **On attendance & payroll** to fill in their
machine number, shift, weekly off, joining date and — for `salary:read` — pay, PF/ESI and bank.
**Attendance → Staff Register** lists those users and opens the same form. `npm run migrate:attendance`
also turns any staff entered in the old Staff Register into users (matched by phone number, otherwise a
placeholder login `stf-…@staff.mandir` to be given a real email and password).

**Testing without the machine:** `server/scripts/simulate-device.mjs` talks to the server like a machine:

```bash
BASE_URL=http://localhost:5000 SN=MGM-TEST node scripts/simulate-device.mjs            # first run: shows up for approval
BASE_URL=http://localhost:5000 SN=MGM-TEST node scripts/simulate-device.mjs --today 101 102
```

**Leave, late penalty and double shifts** (Attendance → Leave & Overtime) need the
`attendance:approve` permission for management decisions — run `npm run migrate:attendance` again
after deploying this (safe to repeat; it only adds what's missing). When adding people, set each
person's **joining date**: days before it are not counted, otherwise they show as absences.

**Salary** (Salary menu) needs `salary:read` / `salary:manage` — the same `npm run migrate:attendance`
adds them (admin gets both, accountant gets read). Pay and bank details are hidden from anyone
without `salary:read`. Before the first salary month:
1. **Salary → Salary Settings:** PF establishment code and ESI employer code; check the PF / ESI rates
   and the Professional Tax slabs (Maharashtra is filled in).
2. **Admin → Users → (person) → Attendance & payroll:** monthly salary, basic salary (PF is on basic),
   gender (PT slabs), PF / ESI applicable with UAN / ESIC number, bank account and IFSC.
3. Each month: **Salary → Monthly Salary → Work out salary**, adjust, **Finalise**, download the bank
   sheet / ECR / ESI files and payslips, then **Mark as paid** (records it in Expenses).

The bank sheet uses standard columns (name, account, IFSC, amount, narration); banks with their own
bulk-upload layout need that format added.

**Demo data** (for showing the module before real staff are entered): 12 demo staff with codes
`DEMO-01…12` and machine numbers 9001+, with punches from the 1st of last month, double shifts,
corrections, planned leave and an advance. It changes no settings, writes no expenses and saves no
salary month. Remove it before real use — only `DEMO-` staff and their records are deleted:

```bash
docker compose exec server npm run seed:attendance-demo            # add
docker compose exec server npm run seed:attendance-demo -- --fresh # replace with a fresh copy
docker compose exec server npm run seed:attendance-demo:remove     # remove
```

**A whole demo day (all modules):** `npm run seed:demo` adds a busy day today plus the last 30 days
(bookings, Mahaprasad, donations, stock, payments, expenses, lending, attendance) on top of the real
setup; `npm run seed:demo:remove` takes it all out again, including stock, seat counts and numbering.
Run it the morning of the demo — today's entries stop at the moment it runs.

**Logins per job (salary, attendance, pooja booking):**

```bash
docker compose exec server npm run migrate:roles      # adds Payroll, Attendance Manager, Booking Manager roles
docker compose exec server npm run users:modules      # salary@, attendance@, booking@, hall@, booking.manager@
```

The passwords are printed once; each person must choose their own at first sign-in. Running it
again skips logins that exist. Salary amounts and shift details of staff are still edited by an
admin in Users (that screen needs user rights).

---

## 12. Abhishek / puja bookings

**One-time, after deploying:**

```bash
docker compose exec server npm run migrate:bookings
```

This adds the `bookings:*` permissions to the existing roles, creates the **Booking Counter**
role, and — only the first time — the 6 seva types and 14 batches from the temple website.
Running it again never overwrites changes made in the app. **Run it again after each update that
adds booking permissions:** shift close / cash handover adds `bookings:cash` (see and verify
everyone's cash handovers) to Admin and Cashier; hall check-in adds `bookings:checkin` to Admin,
Staff and Booking Counter and creates the **Hall Check-in** role (scanning only).

Then, in **Bookings → Booking Setup**:
1. **Batches:** set the real capacity of each batch. 50 is a placeholder; the website didn't publish
   the number. Choose under Settings whether capacity counts bookings or people.
2. **Settings:** printer name and paper width for the counter's thermal slip (blank = the Mahaprasad
   printer), receipt footer.
3. **Users:** give counter staff the *Booking Counter* role (or Staff), each with their own login, so
   the reports show who took which booking and how much cash each person should hand over.

**Receipts to the devotee's phone** link to `https://<domain>/r/<code>`. The address comes from
`PUBLIC_APP_URL` in `server/.env`, or else the first `CLIENT_URL`.
- **Automatic WhatsApp:** needs WhatsApp set up in Settings, plus a Meta-approved template named
  `booking_confirmation` with this body:
  `Namaste {{1}}, your {{2}} at Shri Mangal Grah Mandir, Amalner is booked for {{3}}. Receipt {{4}}: {{5}}`.
  Until then, the counter's **Send on WhatsApp** button opens WhatsApp with the message ready.
- **Automatic SMS (optional):** an MSG91 flow with a DLT-approved template using `##name##`, `##seva##`,
  `##when##`, `##receipt##` and `##link##`. Its id goes in Booking Setup → Settings.

**Fixing mistakes:** a booking's details (name, gotra, people, address, notes) can be edited and it
can be moved to another batch or date from its details sheet; the receipt number and amount stay
the same and every change is kept in the booking's history and the audit log. The payment mode can
be corrected only by the person who took the booking (or someone who can void) and only until their
shift is closed. The counter warns before booking the same seva for the same mobile number twice
on one day.

**Shift close & cash handover:** at the end of a shift each counter person closes their shift from
the counter (count the cash by notes or as one total; a shortfall or excess needs a note) and prints
the handover slip. A cashier or admin checks the cash and marks it verified in
**Bookings → Cash Handover**. A person's first ever close counts their bookings from the start of
that day; after that, each close covers everything since their previous one.

**Hall check-in:** at the hall entrance, staff open **Bookings → Hall Check-in** (or the app-bar
scanner in the phone app) and scan the QR on the devotee's slip — phone camera, webcam or a USB
handheld scanner, or type the receipt number. A valid slip is marked checked in once; a reused,
cancelled or wrong-day slip is refused, and a slip for another hall or a finished batch can be let
in anyway (recorded). The day sheet shows who has arrived. Give hall volunteers the *Hall Check-in*
role: it can scan, but cannot see the booking register or devotees' phone numbers.

**Hall screen (TV):** on a TV, tablet or PC at each hall, sign in as a hall user and open
`https://<domain>/hall-screen?hall=H1` (or **Bookings → Hall Screen**). It shows the batch running
now with every serial number — green once that devotee has checked in — and the next batch, and
refreshes itself. Add `&names=0` to show serial numbers only. Use the browser's full-screen / kiosk
mode; the screen stays on while the page is open.

**Fill rate and no-shows:** **Bookings → Booking Reports → Attendance** — seats booked against
batch capacity (as set in Booking Setup), and devotees who booked but never checked in, by batch,
seva, weekday and day. Only days on which the hall scanned slips count for no-shows. The register's
*Hall check-in → Did not come* filter lists them for follow-up calls (and exports to Excel).

Booking income is counted in **Monthly P&L** on the day it's paid. The old admin panel at
admin.mangalagrahmandir.in stays as it is for older bookings.

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
- **nginx config is a template**: `nginx/templates/app.conf.template` contains `${DOMAIN}`, and the
  nginx container fills it in from `DOMAIN` in the root `.env` each time it starts. Nothing on the
  server is edited, so `git pull` never conflicts. Change the domain = edit `.env`, then
  `docker compose up -d nginx`.
- **One-time step when first pulling the template change** (servers set up before it had the domain
  written into `nginx/conf.d/app.conf`, which blocks the pull):
  ```bash
  cd ~/mangal-gruh-mandir
  grep DOMAIN .env                                  # must show DOMAIN=mandir.aumora.io
  git checkout -- nginx/conf.d/app.conf             # drop the old local domain edit
  git pull
  docker compose up -d --build
  curl -sI https://mandir.aumora.io | head -1       # expect HTTP/2 200
  ```
- MongoDB runs on **Atlas**, not in Docker — there is no `mongodb` container or `mongo_data` volume.
- The client calls the API at the relative path `/api`, proxied by nginx to `server:5000` — no build-time API URL needed.
- Only **nginx** exposes public ports (80/443); server and client are reachable only on the internal `mgm_net` network.
