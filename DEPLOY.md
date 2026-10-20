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

Nothing to set up: renewal runs inside Docker. The `certbot` container checks twice a day and
renews once the certificate has under 30 days left; `nginx` reloads every 6 hours to pick it up
(both in `docker-compose.yml`, started by `docker compose up -d` / `deploy.sh`). If it ever stops
working, the uptime monitor (§15) opens an issue when 21 days are left.

```bash
docker compose ps certbot                       # "Up"
docker compose logs --tail 20 certbot           # "Certificate not yet due for renewal" / "Congratulations"
docker compose exec certbot certbot certificates   # expiry date
docker compose exec certbot certbot renew --webroot -w /var/www/certbot --dry-run   # test against Let's Encrypt staging
```

> **Servers set up from an older copy of this guide** had a cron line for renewal. It used the
> wrong folder (`/home/$USER/…` instead of `/root/…`) and `exec` without `-T`, so it never
> worked. Remove it: `crontab -e` and delete the line with `certbot renew`.

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

**Schedule:** `deploy.sh` adds the nightly run to the server's crontab (1:30 AM India time) if
there's no `backup-db.sh` line yet — check with `crontab -l`. The log is `/var/log/mgm-backup.log`.

**Get told when it fails:** the uptime monitor (§15) opens an issue when the last good backup is
more than 30 hours old, or wasn't copied off the server. Optionally also a free
[healthchecks.io](https://healthchecks.io) check (period 1 day, grace 2 hours): put its ping URL in
the repo-root `.env` as `HEALTHCHECK_URL=https://hc-ping.com/<uuid>`.

### Off-site copy (needed — until it's set up, the monitor keeps a "Backups" issue open)

The archives and the receipt mirror live on this VM. If the VM is lost, so are they — and the
**expense receipts exist nowhere else**. `backup-db.sh` copies both off the server each night with
[rclone](https://rclone.org) once `RCLONE_REMOTE` is set (rclone runs from its Docker image; nothing
to install). Archives older than 90 days are pruned there; receipts are never deleted there.

The database archives hold donors' names, phone numbers and PANs, so put them in an **encrypted**
rclone remote. With a Google Drive account (15 GB free) of the temple's:

```bash
# 1. On a computer with a browser and rclone installed (rclone.org/downloads), get a Drive token:
rclone authorize "drive"                 # sign in with the temple's Google account; copy the token it prints

# 2. On the server — run rclone's setup from its Docker image:
mkdir -p ~/.config/rclone
docker run --rm -it -v ~/.config/rclone:/config/rclone rclone/rclone:1.75.1 config
#   n) New remote → name: gdrive → storage: drive → leave client id/secret empty → scope: 1 (full)
#      → "Use web browser?" n → paste the token from step 1 → shared drive: n → y (keep)
#   n) New remote → name: mgm → storage: crypt → remote: gdrive:mgm-backups
#      → filename encryption: standard → password: g (generate), and a second one: g
#      → SAVE BOTH PASSWORDS in the temple's password manager: without them the backups can't be read
#   q) Quit

# 3. Turn it on and test it
echo 'RCLONE_REMOTE=mgm:' >> .env
./backup-db.sh                           # ends with "Backup complete", no "OFF-SITE … FAILED"
docker run --rm -v ~/.config/rclone:/config/rclone rclone/rclone:1.75.1 ls mgm:   # the archive and uploads/
```

Any rclone storage works the same way (Backblaze B2, Cloudflare R2, another server over SFTP);
keep the `crypt` layer on top. Restoring from it: `rclone copy mgm:<archive> .` (same Docker
command), then `./restore-db.sh verify <archive>`.

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
   Then fill **Allowed network addresses** (the **Use …** button puts in the address the machine
   connected from): punches are accepted only from the temple's internet connection, so someone
   who reads the serial number off the machine can't send punches from elsewhere. If the temple's
   address changes (some broadband connections do), the machine is refused and the screen shows
   the new address — add it. The machine endpoint also refuses floods (over 120 requests a minute
   from one address; `DEVICE_RATE_LIMIT` changes that).
3. Enrol each person's finger/face on the machine and enter the same **Machine number** on their user
   (**Admin → Users**, section *Attendance & payroll*). Punches that arrived before the number was
   entered are linked automatically; unknown numbers are listed on the Staff Register page with an
   "Add" link.

**Team Office machines (Z900 and others whose Comm. menu shows "Server-Client Mode: FkWeb")** use
a different protocol, served at `/fkweb`:
1. On the machine: **Menu → Comm.** — Server-Client Mode **FkWeb**, Web Server URL
   `http://mandir.aumora.io/fkweb` (plain `http://mandir.aumora.io` works too: nginx sends any request
   carrying the machine's `request_code` header to `/fkweb`). Set the machine's clock to India time.
   The machine then sends only to us — the eTimeOffice portal and app stop getting its punches.
2. and 3. as above: approve its serial under **Attendance → Shifts & Machine**, and give each
   person's machine user ID as their **Machine number** (the machine pads it with zeros — `00000012`
   — the app matches it to `12`).

If it doesn't show up within a minute, check the server log: the first request of each kind from
each machine is logged with what it sent (`docker compose logs server | grep FkWeb`), and punches the
app couldn't read are logged as `FkWeb punch not understood` with their contents.
These machines name their requests in headers with underscores (`request_code`, `dev_id`), so nginx
has `underscores_in_headers on` — without it nginx drops them and the app answers 404.

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
PROTOCOL=fkweb BASE_URL=http://localhost:5000 SN=FK-TEST node scripts/simulate-device.mjs --today 101   # as a Team Office machine
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
- **Automatic WhatsApp:** needs WhatsApp set up in Settings → WhatsApp, plus a Meta-approved template
  (default name `booking_confirmation`, in Marathi and / or English, with the slip picture as an image
  header). Booking Setup → Settings shows the exact wording to submit and the name to fill in.
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

## 13. Mahaprasad coupons — devotee's mobile number

Every coupon issue at the Mahaprasad counter needs the devotee's 10-digit mobile number (paid and
free, single or group; one number per issue). It is saved with the coupons, shown in History (search
by coupon number or mobile) and in the Excel export. Coupons issued offline keep the number and
sync it. **Phones still running an older app can't issue coupons** until they install the new APK.

Each sale gets a **QR link** (`https://<domain>/m/<code>`): a page with the coupons' QR codes — one per
coupon, one for a whole group — that the food counter scans off the devotee's phone, just like the
paper coupon. No sign-in; it shows no mobile number or amount, and turns to "Served" after the scan.
Each coupon is still served only once. Sales from before this change have no link.

The counter's **WhatsApp** button (after an issue, at the bottom next to Reprint, and on each row
of Today's Batches) opens WhatsApp with the coupon numbers and the QR link ready to send — no setup
needed. **Automatic sending** (optional):

- **WhatsApp:** in Meta WhatsApp Manager → Message templates → Create: category **Utility**, name
  `mahaprasad_coupon_qr`, language **English**, **Header: Image** (the coupons' QR picture goes there,
  so the QR is in the devotee's chat and needs no internet at the hall — for the sample, upload any
  QR picture), body:
  ```
  Namaste! Your Mahaprasad coupon(s) at Shri Mangal Grah Mandir, Amalner for {{1}}: {{2}} ({{3}}). Your coupon QR: {{4}} Please show it at the Mahaprasad hall.
  ```
  Samples for review: `{{1}}` Fri, 16 Oct 2026 · `{{2}}` MP-20261016-007 to 009 (3) · `{{3}}` 3 persons ·
  `{{4}}` https://mandir.aumora.io/m/AbCdEfGh1234. Once it shows **Active**, type its name in
  Settings → WhatsApp → *Mahaprasad coupons*. (The template must have the image header and exactly
  these 4 parts, or Meta refuses each message.) **Marathi:** add Marathi to the same template, with
  the same image header — the Marathi wording is in Settings → WhatsApp → *Mahaprasad coupons* →
  *Wording to submit to Meta*, where you also choose which language goes first; if that one isn't
  approved yet, the other is sent.
- **SMS:** an MSG91 Flow with a DLT-approved template using `##date##`, `##coupons##`, `##persons##`
  and `##link##`; set `MSG91_MAHAPRASAD_TEMPLATE_ID` in `server/.env` (SMS turned on in Settings) and restart the server.

## 13a. Mahaprasad coupons online (Razorpay)

Devotees buy coupons at **`https://<domain>/prasad`**: day (today + the next days), plates, mobile →
pay by UPI / card / net banking through Razorpay → the coupon page (`/m/<code>`) opens, and the coupon
goes to their mobile like a counter sale (section 13). One QR for the whole order. The plates count
against the day's cap while the devotee pays (15 minutes). Staff see every order in **Mahaprasad →
Online orders**, with its Razorpay payment ID. Online sales show as "Online" in History and reports.
The policy pages Razorpay asks for are `/pricing`, `/terms`, `/refund`, plus `/about` and `/privacy`.

**The Razorpay account is the trust's and is shared with the temple website (built by NGOGuru).**
Razorpay allows one live key per account. **Never press "Regenerate" on the key**: the website would
stop taking payments. The live key secret comes from NGOGuru; Razorpay shows it only once, when the
key is made. The server checks the key every night at 02:45 and alerts admins (app notification,
Settings → Mahaprasad) if Razorpay starts refusing it.

1. **Test first.** Use test keys (`rzp_test_…`) from an Ashaparth AI Razorpay account. Test mode
   needs no KYC. In `server/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=any-long-random-text
   ```
   `docker compose up -d server` (not `restart`: that keeps the old `.env` values), then turn on **Settings → Mahaprasad → Sell coupons online**. Set
   the days ahead, plates per order and the last time for today there. The page shows "Test mode";
   pay with Razorpay's test UPI ID `success@razorpay` or a test card.
2. **Webhook** (on the Razorpay dashboard of the account whose keys are in use, computer only, not
   the phone app): Account & Settings → Webhooks → Add new webhook.
   - URL: `https://<domain>/api/webhooks/razorpay`
   - Secret: the same text as `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.authorized`, `order.paid`

   The website's payments also reach this URL and are ignored. Without a webhook, payments are
   still confirmed: by the devotee's browser, by the page asking again, by a check every 2 minutes,
   and by the nightly check.
3. **Add the website to the trust's account** (web dashboard): Account & Settings → Business website
   detail → **Add additional website/app details**. Do **not** use "Update website/app details":
   that changes the main website, `mangalagrahmandir.in`, which the NGOGuru website needs. Give:
   - website `https://<domain>/prasad`
   - About & Contact `https://<domain>/about`
   - Pricing `/pricing`, Terms `/terms`, Privacy `/privacy`, Cancellation/Refund `/refund`
   - the sample invoice `docs/razorpay/sample-invoice-mahaprasad.pdf`
   - the reason text in `docs/razorpay/README.md`

   Razorpay reviews it by hand. The option exists only for the "e-commerce" business category; if
   it's missing, ask Razorpay support to add the domain.
4. **Go live** once the website is approved: put the live key ID and secret (from NGOGuru) and the
   webhook secret in `server/.env`, add the webhook on the trust's dashboard (step 2), and run
   `docker compose up -d server`.
   Settings → Mahaprasad should then show "LIVE". Do one real purchase and check that it appears in
   Online orders and in the Razorpay dashboard. Then share the link.

**Refunds:** none by staff action. A payment is refunded automatically only when it arrives after
its 15 minutes and the day has filled up or is over (Online orders shows "Refunded" and why).
Cancelling an online sale in History does **not** return the money; refund it from the Razorpay
dashboard if the trust agrees.

## 14. Automatic deploys from GitHub

Every push to `main` runs the checks in `.github/workflows/ci.yml` (web app, server, Android test
APK). When the web app and server checks pass, the **Deploy** job logs in to the server over SSH,
moves the code to exactly the commit that was tested (`git merge --ff-only`), and runs
[`deploy.sh`](deploy.sh): rebuild and restart the containers, wait for the API, restart nginx if its
settings changed (after checking them), run the add-only permission migrations, remove old images. It then checks `https://<domain>/api/health`.
A failed check means nothing is deployed; a push with failing tests never reaches the server.

**One-time setup** (deploys stay off until step 2 is done):

1. On the server, make a key just for GitHub and allow it to log in:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N "" -C "github-actions-deploy"
   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/github_actions          # the private key — copy all of it, BEGIN to END
   ```
2. In GitHub: the repository → **Settings → Secrets and variables → Actions**:
   - **Secrets** → `DEPLOY_SSH_KEY` = that private key.
   - **Secrets** → `DEPLOY_KNOWN_HOSTS` (recommended) = the output of `ssh-keyscan <server-ip>`, so
     GitHub only ever talks to your server.
   - **Variables** → `DEPLOY_HOST` = the server's IP or name. **This switches deploys on.**
   - Optional variables: `DEPLOY_USER` (default `root`), `DEPLOY_PATH` (default
     `/root/mangal-gruh-mandir`), `DEPLOY_URL` (default `https://mandir.aumora.io`).
3. Optional: **Settings → Environments → production → Required reviewers** to approve each deploy
   with a click before it runs (GitHub offers this on public repositories and paid plans).

The server's copy must stay a clean checkout of `main` — if files were edited directly on the
server, the deploy stops instead of overwriting them (`git status` on the server shows what).
To redeploy without a new commit: **Actions → CI → Run workflow** on `main`. By hand on the server:
`cd ~/mangal-gruh-mandir && git pull && ./deploy.sh`.

Not automatic: app installers. Android APKs and desktop installers are still copied to
`mobile-releases/` as described in MOBILE.md.

## 15. Uptime monitor (GitHub)

`.github/workflows/uptime.yml` runs every 10 minutes on GitHub (free for a public repository;
nothing to sign up for) and checks:

| Check | Problem when |
|---|---|
| Website or database down | `/api/health` doesn't answer 200 three times in a row a minute apart — it answers 503 when MongoDB Atlas doesn't — or the website doesn't load |
| HTTPS certificate not renewing | under 21 days left (it renews itself at 30, §8) |
| Backups need attention | last good backup over 30 hours old, or not copied off the server (§10) |

Each problem opens **one GitHub issue** that mentions the repository owner, so GitHub emails you
and the GitHub mobile app notifies you. While it lasts the issue is updated quietly; when the check
passes again it's closed with a comment (another notification). Make sure **Settings → Notifications
→ Email** is on in your GitHub account.

- **Run it now:** Actions → Uptime monitor → Run workflow. From a computer:
  `node .github/scripts/uptime.cjs` prints the results without touching issues.
- The repository is public, so these issues are too. They hold only what failed and what to check.
  For private alerts, also add a free [UptimeRobot](https://uptimerobot.com) monitor for
  `https://mandir.aumora.io/api/health` (keyword `"db":"ok"`).
- GitHub switches scheduled workflows off after 60 days without a commit in a public repository; it
  emails a warning first, and one click on the Actions tab turns it back on.
- Different address: set the repository variable `SITE_URL` (defaults to `DEPLOY_URL`, then
  `https://mandir.aumora.io`).

## 16. Going live — clearing the test data

Once, before the temple starts using the app for real. `server/src/seeds/goLive.js` removes every
test and demo record and keeps the setup:

- **Kept:** Settings (temple details, prices, WhatsApp / SMS / payment keys), roles, departments,
  categories, units, donation and Mahaprasad occasions, seva types, halls, batches, booking setup
  and closed dates, attendance settings (shifts, holidays, approved machines), payroll settings, the
  usual daily Mahaprasad total — and the **super admin** login(s).
- **Emptied:** products, suppliers, assets, all stock (it starts at zero), purchases, supplier
  payments, expenses and budgets (with their receipt files), donations, pooja bookings, Mahaprasad
  coupons, payments and online orders, attendance and salary, **every other login** with its staff
  profile, the numbering (every receipt, coupon and booking number starts again from 1), and the
  audit and app-error logs.

```bash
cd /root/mangal-gruh-mandir
docker compose exec server npm run golive                   # preview: what goes, what stays — changes nothing
./backup-db.sh                                             # required: it refuses without a backup from the last 2 hours
docker compose exec server npm run golive -- --confirm=<database name the preview shows>
docker compose restart server
docker compose exec server npm run users:temple             # preview the temple's staff logins
docker compose exec server npm run users:temple -- --confirm  # create them — note the passwords shown
```

`users:temple` creates the agreed staff logins (trust viewers, accounts, booking counter, hall achari
and hall managers, purchase managers — the list, with each person's simple password (first name +
`@123`), is in `server/src/seeds/templeUsers.js`). Nobody is asked to change it; a login that
already exists keeps its own password.

Only some super admins to stay? Add `--keep-users=first@x.org,second@y.org`. Then, in the app: enter
the products and suppliers, the opening stock (a purchase entry or stock-in per product), the staff
logins (Admin → Users), and check Settings. If anything was removed by mistake, the backup restores
it: `./restore-db.sh live <archive>` (§10).

## Operations cheatsheet

```bash
docker compose logs -f server        # tail server logs
docker compose restart server        # restart (keeps the old server/.env values)
docker compose up -d server          # after changing server/.env — recreates the container with the new values
git pull && ./deploy.sh             # deploy by hand (normally GitHub does it — section 14)
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
- **Rebuilding the app doesn't need an nginx restart**: nginx looks the `client` / `server`
  containers up on each request (Docker's DNS, cached 10 s), so new container addresses after
  `docker compose up -d --build` are picked up by themselves. (Before this, a rebuild could leave
  nginx calling the old address — **502 Bad Gateway** until `docker compose restart nginx`.)
  nginx itself reads the template only when it starts, so `deploy.sh` restarts it when
  `nginx/nginx.conf` or `nginx/templates/` changed (it remembers the last applied version in
  `.nginx-applied`). It first runs `nginx -t` on the new settings in a throwaway container: if that
  fails the deploy stops with nginx's error and the site keeps running on the old settings. By hand:
  `docker compose restart nginx`.
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
