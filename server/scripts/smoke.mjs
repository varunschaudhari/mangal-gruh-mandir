// Smoke test for a running API: logs in as the seeded admin and calls every read endpoint
// the client uses. Fails on any 5xx (a crash) or if a core endpoint isn't 200.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=admin@mandir.com ADMIN_PASSWORD=… node scripts/smoke.mjs
//
// Used by CI (.github/workflows/ci.yml) against a fresh, seeded MongoDB.

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const year = now.getFullYear();
const month = now.getMonth() + 1;

// Must return 200 — the screens people open every day.
const CORE = [
  '/auth/me', '/dashboard', '/products', '/departments', '/categories', '/units', '/suppliers',
  '/balances', '/transactions', '/batches', '/batches/expiring',
  `/reports/daily?date=${today}`, '/reports/valuation', '/reports/reorder-suggestions',
  '/supplier-payments', '/supplier-payments/counts', '/supplier-payments/dashboard-summary',
  '/supplier-payments/invoice-register', '/supplier-payments/upcoming-dues', '/supplier-payments/aging',
  '/purchase-entries', '/expenses', `/expenses/summary?year=${year}&month=${month}`,
  `/pnl?year=${year}&month=${month}`, `/pnl/trend?year=${year}`, `/budgets?year=${year}&month=${month}`,
  '/donations', '/donations/stats', '/donation-occasions',
  `/mahaprasad/summary?date=${today}`, `/mahaprasad/cash-drawer?date=${today}`, '/mahaprasad/coupons',
  '/mahaprasad/batches', `/mahaprasad/report?from=${monthStart}&to=${today}`, '/mahaprasad-occasions',
  '/assets', '/asset-transactions', '/asset-transactions/counts', '/borrow-groups',
  '/asset-reports/utilization', '/users', '/roles', '/settings', '/audit-logs', '/payment-templates',
  '/client-errors',
];

// Allowed to answer 4xx (e.g. need extra filters) — but must never crash with a 5xx.
const EXTRA = [
  `/reports/daily/whatsapp?date=${today}`, '/reports/low-stock/whatsapp', '/reports/expiring/whatsapp',
  '/reports/consumption-trend', '/reports/festival-cost', `/reports/suppliers?startDate=${monthStart}&endDate=${today}`,
  `/mahaprasad/report/monthly?year=${year}`, `/mahaprasad/report/staff?from=${monthStart}&to=${today}`,
  `/mahaprasad/report/wastage?from=${monthStart}&to=${today}`, `/mahaprasad/report/whatsapp?date=${today}`,
  `/mahaprasad/offline/today?date=${today}`, '/ledger', '/asset-units', '/products/lookup?code=NO-SUCH-CODE', '/asset-units/lookup?code=MGM-AST-NOPE',
  '/asset-reports/fines', '/asset-transactions/availability', '/users/approvers',
];

async function main() {
  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error(`/api/health → ${health.status}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await login.json().catch(() => ({}));
  const token = loginBody?.data?.accessToken;
  if (!login.ok || !token) throw new Error(`login → ${login.status} ${JSON.stringify(loginBody).slice(0, 200)}`);
  console.log('✔ health + admin login');

  const failures = [];
  for (const [list, mustBeOk] of [[CORE, true], [EXTRA, false]]) {
    for (const path of list) {
      const res = await fetch(`${BASE}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
      const bad = res.status >= 500 || (mustBeOk && res.status !== 200);
      console.log(`${bad ? '✖' : '✔'} ${res.status} GET ${path}`);
      if (bad) failures.push(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // Crash report from an app (no sign-in needed) shows up for admins
  const crash = await fetch(`${BASE}/api/client-errors`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Smoke test error', stack: 'Error: Smoke test error\n    at smoke', app: 'android', path: '/smoke' }),
  });
  const listed = await (await fetch(`${BASE}/api/client-errors`, { headers: { authorization: `Bearer ${token}` } })).json();
  const reported = crash.status === 201 && listed.data?.some((e) => e.message === 'Smoke test error');
  console.log(`${reported ? '✔' : '✖'} ${crash.status} POST /client-errors (listed for admins)`);
  if (!reported) failures.push(`${crash.status} POST /client-errors`);

  // Push registration round-trip (works even when push sending is off)
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const reg = await fetch(`${BASE}/api/devices`, { method: 'POST', headers: auth, body: JSON.stringify({ token: 'smoke-test-token', platform: 'android' }) });
  const unreg = await fetch(`${BASE}/api/devices/smoke-test-token`, { method: 'DELETE', headers: auth });
  for (const [label, r] of [['POST /devices', reg], ['DELETE /devices/:token', unreg]]) {
    console.log(`${r.ok ? '✔' : '✖'} ${r.status} ${label}`);
    if (!r.ok) failures.push(`${r.status} ${label}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nAll ${CORE.length + EXTRA.length + 3} checks OK`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
