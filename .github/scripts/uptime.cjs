// Uptime monitor, run by .github/workflows/uptime.yml every 10 minutes.
// Checks the live site and its database, the HTTPS certificate, and last night's backup. Keeps one
// GitHub issue per problem: opened when it starts (GitHub emails you), kept up to date while it
// lasts (edits don't email), closed with a comment when it's fixed.
//
// Try it without touching issues:  SITE=https://mandir.aumora.io node .github/scripts/uptime.cjs
const tls = require('tls');

const SITE = (process.env.SITE || 'https://mandir.aumora.io').replace(/\/$/, '');
const CERT_MIN_DAYS = 21;     // renewal starts at 30 days left, so under 21 means it has failed for over a week
const BACKUP_MAX_HOURS = 30;  // nightly, with a few hours' slack
const RETRY_MS = Number(process.env.RETRY_MS ?? 60_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (path) => fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'mgm-uptime-monitor' } });

// The website, the API and its database. Three tries a minute apart, so a deploy or a blip isn't an alarm.
async function checkSite() {
  let problem = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await get('/api/health');
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.db !== 'down') {
        const page = await get('/');
        if (page.ok) return null;
        problem = `The API and database are fine, but the website itself answers **${page.status}** at ${SITE}/.`;
      } else if (res.status === 503 || body.db === 'down') {
        problem = 'The server is up but **its database (MongoDB Atlas) is not answering**. Counters switch to offline mode meanwhile.'
          + ' Check the Atlas cluster, then `docker compose logs --tail 100 server` on the server.';
      } else {
        problem = `The API answers **${res.status}** at ${SITE}/api/health. On the server: \`docker compose ps\` and \`docker compose logs --tail 100 server\`.`;
      }
    } catch (err) {
      problem = `**No answer from ${SITE}** (${err.cause?.code || err.cause?.message || err.message}).`
        + ' The server, nginx or the internet connection to it is down — try `docker compose ps` on the server, or the hosting provider\'s console.';
    }
    if (i < 2) await sleep(RETRY_MS);
  }
  return problem;
}

// Read the certificate even if it's already expired or wrong, to say what's going on
function peerCertificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert);
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
  });
}

async function checkCertificate() {
  const host = new URL(SITE).hostname;
  let cert;
  try { cert = await peerCertificate(host); } catch { return null; } // unreachable — the site check says so
  const expires = new Date(cert.valid_to);
  const days = Math.floor((expires - Date.now()) / 864e5);
  if (days >= CERT_MIN_DAYS) return null;
  const when = expires.toUTCString();
  return (days < 0 ? `The HTTPS certificate for ${host} **expired** on ${when}.` : `The HTTPS certificate for ${host} expires in **${days} day(s)** (${when}).`)
    + ' It renews itself at 30 days left, so renewal is failing. On the server: `docker compose logs --tail 50 certbot`'
    + ' (DEPLOY.md §8). When the certificate expires, the website and the phone and desktop apps all stop connecting.';
}

async function checkBackup() {
  let s;
  try {
    const res = await get('/api/health/backup');
    if (!res.ok) return null; // site down (reported above) or a server from before this check
    s = await res.json();
  } catch { return null; }
  const problems = [];
  if (!s.reporting) {
    problems.push('**No backup has reported yet.** The nightly backup (`backup-db.sh`) hasn\'t run since this check was added, or isn\'t scheduled.'
      + ' On the server: `crontab -l` and `./backup-db.sh` once by hand (DEPLOY.md §10). Right after a first deploy this clears after tonight\'s backup.');
  } else {
    if (s.ageHours > BACKUP_MAX_HOURS) {
      problems.push(`**The last good backup finished ${Math.round(s.ageHours)} hours ago** (${s.at}). The nightly backup is failing or not running.`
        + ' On the server: `tail -50 /var/log/mgm-backup.log` and `crontab -l`.');
    }
    if (!s.offsite || !s.uploadsOffsite) {
      const what = !s.offsite && !s.uploadsOffsite ? 'The database backups and the uploaded expense receipts are'
        : !s.offsite ? 'The database backups are' : 'The uploaded expense receipts are';
      problems.push(`**${what} kept only on the server.** If the server is lost, so are they.`
        + ' Set up the off-site copy (RCLONE_REMOTE) — DEPLOY.md §10. If it is set up, the copy failed: `tail -50 /var/log/mgm-backup.log`.');
    }
  }
  return problems.length ? problems.join('\n\n') : null;
}

const CHECKS = [
  { title: '[monitor] Website or database down', run: checkSite },
  { title: '[monitor] HTTPS certificate not renewing', run: checkCertificate },
  { title: '[monitor] Backups need attention', run: checkBackup },
];

async function runChecks() {
  const results = await Promise.all(CHECKS.map(async (c) => ({ ...c, problem: await c.run() })));
  return results;
}

// From the workflow (actions/github-script): open, update or close the issues
module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const results = await runChecks();
  const open = (await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', per_page: 100 }))
    .filter((i) => !i.pull_request);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

  for (const { title, problem } of results) {
    const issue = open.find((i) => i.title === title);
    if (problem) {
      core.warning(`${title}: ${problem}`);
      const body = `${problem}\n\n_Last checked ${now} UTC (${SITE}). This issue closes itself once the check passes again._\n\ncc @${owner}`;
      if (!issue) await github.rest.issues.create({ owner, repo, title, body });
      else await github.rest.issues.update({ owner, repo, issue_number: issue.number, body });
    } else {
      core.info(`${title}: OK`);
      if (issue) {
        await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: `✅ Back to normal (${now} UTC).` });
        await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
      }
    }
  }
};

// Run directly: print the results only
if (require.main === module) {
  runChecks().then((results) => {
    for (const { title, problem } of results) console.log(`${problem ? '✖' : '✔'} ${title}${problem ? `\n  ${problem}` : ''}`);
  });
}
