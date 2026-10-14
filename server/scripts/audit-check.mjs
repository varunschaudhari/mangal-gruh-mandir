// Audit log checks against a running, seeded API: pay and bank details changes are recorded (the
// account number masked), settings record old → new values (secrets only as "(set)"), cash drawer
// adjustments, roster changes and sensitive downloads are recorded, and entries are only shown to
// those who may read their module — record history included. Adds test users and a role, so run
// it on a test database only.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/audit-check.mjs
// Used by CI (.github/workflows/ci.yml).

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${!ok && extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};
const pad = (n) => String(n).padStart(2, '0');
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();

async function signIn(email, password) {
  const res = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })).json();
  const token = res?.data?.accessToken;
  if (!token) throw new Error(`login failed for ${email}: ${res?.message}`);
  return async (method, path, body, { raw = false } = {}) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) { await r.arrayBuffer(); return { status: r.status }; }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}

async function main() {
  const api = await signIn(EMAIL, PASSWORD);
  const stamp = Date.now();
  // The newest entry for an action (entries are written just after the response — give it a moment)
  const latest = async (action, test = () => true) => {
    for (let i = 0; i < 20; i += 1) {
      const logs = (await api('GET', `/audit-logs?action=${encodeURIComponent(action)}&limit=20`)).body.data?.logs || [];
      const hit = logs.find(test);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  };

  // ── Pay and bank details ────────────────────────────────────────────────────
  const body = {
    name: 'Audit Person', email: `audit-${stamp}@test.local`, password: 'Staff-Pass-123!', role: 'employee', phone: '', departments: [], isActive: true,
    staffProfile: { onPayroll: true, joinDate: `${lastMonth}-01`, weeklyOffDay: 0, monthlySalary: 15000, bankAccount: '123456789012', ifsc: 'SBIN0000123' },
  };
  const created = await api('POST', '/users', body);
  const userId = created.body.data?._id;
  const staffId = created.body.data?.staffProfile?._id;
  check(created.status === 201 && staffId, 'a person on payroll', JSON.stringify(created.body).slice(0, 200));
  const first = await latest('salary.pay_details_update', (l) => String(l.entityRef) === String(staffId));
  check(first?.after?.monthlySalary === 15000 && first.after.bankAccount === 'XXXX9012' && !('weeklyOffDay' in (first.after || {})),
    'new pay details are recorded, the bank account as its last 4 digits', JSON.stringify(first?.after));
  await api('PUT', `/users/${userId}`, { ...body, password: undefined, staffProfile: { ...body.staffProfile, monthlySalary: 16500, bankAccount: '999988887777', weeklyOffDay: 2 } });
  const pay = await latest('salary.pay_details_update', (l) => String(l.entityRef) === String(staffId) && l.after?.monthlySalary === 16500);
  check(pay && pay.before.monthlySalary === 15000 && pay.before.bankAccount === 'XXXX9012' && pay.after.bankAccount === 'XXXX7777'
    && !('ifsc' in pay.after) && !('weeklyOffDay' in pay.after), 'a pay or bank change records old → new of just what changed', JSON.stringify(pay));
  const att = await latest('attendance.profile_update', (l) => String(l.entityRef) === String(staffId) && l.after?.weeklyOffDay === 2);
  check(att?.before?.weeklyOffDay === 0 && !('monthlySalary' in att.after), 'attendance details are recorded separately from pay', JSON.stringify(att));

  // ── Settings: old → new, secrets hidden ─────────────────────────────────────
  const settings = (await api('GET', '/settings')).body.data;
  await api('PUT', '/settings', { templeWebsite: `audit-${stamp}.example.org`, waAccessToken: `secret-token-${stamp}` });
  const set = await latest('settings.update', (l) => l.after?.templeWebsite === `audit-${stamp}.example.org`);
  check(set && set.before.templeWebsite === (settings.templeWebsite || '') && set.after.waAccessToken === '(set)' && !JSON.stringify(set).includes(`secret-token-${stamp}`),
    'settings record old → new; an access token only as "(set)"', JSON.stringify(set?.after));
  await api('PUT', '/settings', { templeWebsite: settings.templeWebsite || '' });
  const att0 = (await api('GET', '/attendance/settings')).body.data;
  await api('PUT', '/attendance/settings', { graceMinutes: (att0.graceMinutes || 15) + 5 });
  const attSet = await latest('attendance.settings_update', (l) => l.after?.graceMinutes === (att0.graceMinutes || 15) + 5);
  check(attSet?.before?.graceMinutes === (att0.graceMinutes || 15) && Object.keys(attSet.after).length === 1,
    'attendance settings record just what changed', JSON.stringify(attSet?.after));
  await api('PUT', '/attendance/settings', { graceMinutes: att0.graceMinutes || 15 });

  // ── Roster, cash drawer, downloads ─────────────────────────────────────────
  const dayShift = att0.shifts.find((s) => s.kind === 'day') || att0.shifts[0];
  const rosterDay = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  await api('PUT', '/attendance/roster', { entries: [{ staff: staffId, date: rosterDay, off: true }] });
  const roster = await latest('attendance.roster_save', (l) => (l.meta?.changes || []).some((c) => c.date === rosterDay));
  const change = roster?.meta?.changes?.find((c) => c.date === rosterDay);
  check(change && change.to === 'Off' && change.staff.includes('Audit Person'), 'a roster change records who, which day and from → to', JSON.stringify(change));
  await api('PUT', '/attendance/roster', { entries: [{ staff: staffId, date: rosterDay, shifts: [dayShift._id] }] });

  const adjust = await api('PATCH', '/mahaprasad/cash-drawer/adjust', { date: today, denomination: 100, delta: 2 });
  const drawer = await latest('mahaprasad.drawer_adjust', (l) => l.entityId === today.replace(/-/g, '') && l.meta?.denomination === 100 && l.meta?.change === 2);
  check(adjust.status === 200 && drawer?.user?.name, 'a cash drawer adjustment records who changed which note count', JSON.stringify(drawer?.meta));
  await api('PATCH', '/mahaprasad/cash-drawer/adjust', { date: today, denomination: 100, delta: -2 });

  await api('POST', `/salary/runs/${lastMonth}/prepare`, {});
  const file = await api('GET', `/salary/runs/${lastMonth}/files/register.xlsx`, undefined, { raw: true });
  check(file.status === 200 && await latest('salary.file_download', (l) => l.entityId === lastMonth && l.meta?.file === 'register.xlsx'),
    'downloading a salary file is recorded', String(file.status));
  await api('DELETE', `/salary/runs/${lastMonth}`);
  for (const [path, action] of [['/donations/export/excel', 'donation.export'], ['/bookings/export/excel', 'booking.export'], ['/supplier-payments/export', 'payment.export'], ['/audit-logs/export', 'audit.export']]) {
    const r = await api('GET', path, undefined, { raw: true });
    check(r.status === 200 && await latest(action), `${path} is recorded as ${action}`, String(r.status));
  }

  // ── Who may read what ───────────────────────────────────────────────────────
  const employee = await signIn(body.email, body.password);
  const own = await employee('GET', `/audit-logs/entity/${staffId}`);
  check(own.status === 200 && Array.isArray(own.body.data) && own.body.data.length === 0,
    'an employee sees no history — not even the pay changes on their own record', JSON.stringify(own.body).slice(0, 160));
  check((await employee('GET', '/audit-logs')).status === 403, 'an employee cannot open the audit log');

  const role = await api('POST', '/roles', { slug: `audit_viewer_${stamp}`, name: `Audit viewer ${stamp}`, permissions: ['users:read', 'attendance:read'] });
  const viewerBody = { name: 'Audit Viewer', email: `audit-viewer-${stamp}@test.local`, password: 'Viewer-Pass-123!', role: role.body.data?.slug, phone: '', departments: [], isActive: true };
  const viewerUser = await api('POST', '/users', viewerBody);
  check(role.status === 201 && viewerUser.status === 201, 'a role that can read users and attendance but not salary', `${role.status} ${viewerUser.status} ${viewerUser.body.message || ''}`);
  const viewer = await signIn(viewerBody.email, viewerBody.password);
  const list = (await viewer('GET', '/audit-logs?limit=200')).body.data?.logs || [];
  const actions = new Set(list.map((l) => l.action.split('.')[0]));
  check(list.length > 0 && !actions.has('salary') && !actions.has('booking') && !actions.has('mahaprasad') && actions.has('attendance'),
    'the audit log shows only modules the viewer may read (no salary, bookings or cash)', [...actions].join(','));
  const history = (await viewer('GET', `/audit-logs/entity/${staffId}`)).body.data || [];
  check(history.length > 0 && history.every((l) => !l.action.startsWith('salary.')), 'record history hides the pay changes from them too',
    history.map((l) => l.action).join(','));
  check((await viewer('GET', `/audit-logs?action=salary.pay_details_update`)).body.data?.logs?.length === 0, 'asking for salary entries by name gets none');
  const adminHistory = (await api('GET', `/audit-logs/entity/${staffId}`)).body.data || [];
  check(adminHistory.some((l) => l.action === 'salary.pay_details_update'), 'an administrator sees the full history');
  check((await api('GET', '/audit-logs/entity/not-an-id')).status === 200, 'a malformed record id is answered, not an error');
  const login = await latest('auth.login', (l) => l.entityId === viewerBody.email);
  check(login?.user?.name === 'Audit Viewer', 'a login is recorded under the person who signed in', JSON.stringify(login?.user));

  console.log(failed ? `\n${failed} audit check(s) FAILED` : '\nAudit checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
