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
  '/bookings/options', '/bookings', '/booking-setup', '/bookings/reports/summary', `/bookings/reports/day-sheet?date=${today}`,
  '/attendance/settings', '/attendance/staff', '/attendance/staff/unmapped',
  '/salary/settings', '/salary/runs', '/salary/advances', '/salary/runs/2099-12',
  `/attendance/roster?from=${today}&to=${today}`, `/attendance/days?from=${monthStart}&to=${today}`,
  `/attendance/month?month=${today.slice(0, 7)}`, `/attendance/register/excel?month=${today.slice(0, 7)}`,
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

  const attendanceChecks = await attendanceFlow(auth, failures);

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nAll ${CORE.length + EXTRA.length + 3 + attendanceChecks} checks OK`);
}

// Biometric machine → punches → attendance: a new machine waits for approval, its punches
// are linked to the staff member by machine number, and yesterday's day shift shows present.
async function attendanceFlow(auth, failures) {
  let count = 0;
  const check = (label, ok, detail = '') => {
    count += 1;
    console.log(`${ok ? '✔' : '✖'} ${label}`);
    if (!ok) failures.push(`${label} ${detail}`.trim());
  };
  const api = async (method, path, body) => {
    const res = await fetch(`${BASE}/api${path}`, { method, headers: auth, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const machine = (method, path, body) => fetch(`${BASE}/iclock${path}`, { method, body, headers: { 'content-type': 'text/plain' } })
    .then(async (r) => ({ status: r.status, text: await r.text() }));

  const sn = `SMOKE-${Date.now()}`;
  const pin = String(900000 + Math.floor(Math.random() * 99999));
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;

  const settings = (await api('GET', '/attendance/settings')).body.data;
  const day = settings?.shifts?.find((s) => s.kind === 'day');
  check('attendance settings have a day shift', Boolean(day));
  if (!day) return count;

  // People are added in Users; "on attendance & payroll" gives them an attendance profile.
  // Joined three days ago, so earlier days don't count as absences.
  const joined = new Date(y.getFullYear(), y.getMonth(), y.getDate() - 2);
  const stamp = Date.now();
  const person = { name: 'Smoke Test Staff', phone: '', role: 'employee', departments: [], isActive: true };
  const staff = await api('POST', '/users', {
    ...person, email: `smoke-${stamp}@test.local`, password: 'Smoke-Pass-123!',
    staffProfile: {
      onPayroll: true, designation: 'Guard', machineId: pin, weeklyOffDay: (y.getDay() + 3) % 7, doubleShiftEligible: true,
      joinDate: `${joined.getFullYear()}-${pad(joined.getMonth() + 1)}-${pad(joined.getDate())}`,
    },
  });
  const staffId = staff.body.data?.staffProfile?._id;
  const userId = staff.body.data?._id;
  check(`${staff.status} user added with attendance profile`, staff.status === 201 && Boolean(staffId) && staff.body.data.staffProfile.staffCode?.startsWith('STF-'),
    JSON.stringify(staff.body).slice(0, 200));
  if (!staffId) return count;
  const dupeEmail = `smoke-dupe-${stamp}@test.local`;
  const dupe = await api('POST', '/users', { ...person, name: 'Duplicate', email: dupeEmail, password: 'Smoke-Pass-123!', staffProfile: { onPayroll: true, machineId: pin } });
  const users = (await api('GET', '/users')).body.data || [];
  check(`${dupe.status} duplicate machine number refused (no user left behind)`, dupe.status === 409 && !users.some((u) => u.email === dupeEmail));
  check('user list shows who is on payroll', users.some((u) => u._id === userId && u.onPayroll && u.staffCode));

  const roster = await api('PUT', '/attendance/roster', { entries: [{ staff: staffId, date: yesterday, shifts: [day._id] }] });
  check(`${roster.status} PUT /attendance/roster`, roster.status === 200);

  const first = await machine('GET', `/cdata?SN=${sn}&options=all`);
  check(`${first.status} unknown machine refused until approved`, first.status === 403);
  const devices = (await api('GET', '/attendance/settings')).body.data?.devices || [];
  check('machine listed as waiting for approval', devices.some((d) => d.serial === sn && !d.approved));
  const approve = await api('PUT', '/attendance/settings', { devices: devices.map((d) => (d.serial === sn ? { ...d, approved: true, name: 'Smoke gate' } : d)) });
  check(`${approve.status} machine approved`, approve.status === 200);

  const hello = await machine('GET', `/cdata?SN=${sn}&options=all`);
  check(`${hello.status} machine handshake`, hello.status === 200 && hello.text.startsWith(`GET OPTION FROM: ${sn}`));

  const at = (hhmm, addMin) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(y.getFullYear(), y.getMonth(), y.getDate(), h, m + addMin);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };
  const attlog = `${pin}\t${at(day.start, 3)}\t0\t1\t0\t0\n${pin}\t${at(day.end, 12)}\t1\t15\t0\t0\n`;
  const upload = await machine('POST', `/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`, attlog);
  check(`${upload.status} machine punches uploaded`, upload.status === 200 && upload.text === 'OK: 2', upload.text);
  const again = await machine('POST', `/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`, attlog);
  check(`${again.status} resent punches accepted (no duplicates)`, again.status === 200);

  const days = await api('GET', `/attendance/days?from=${yesterday}&to=${yesterday}&staff=${staffId}`);
  const result = days.body.data?.days?.[staffId]?.[yesterday];
  check(`${days.status} yesterday's day shift is present`, result?.status === 'present' && result.punches?.length === 2, JSON.stringify(result).slice(0, 300));

  const fix = await api('PUT', '/attendance/overrides', { staff: staffId, date: yesterday, status: 'on_duty', note: 'Smoke test' });
  const fixed = (await api('GET', `/attendance/days/${staffId}/${yesterday}`)).body.data;
  check(`${fix.status} supervisor override applied`, fixed?.day?.status === 'on_duty' && fixed?.override?.note === 'Smoke test');
  const unfix = await api('DELETE', `/attendance/overrides/${staffId}/${yesterday}`);
  check(`${unfix.status} override removed`, unfix.status === 200);

  // Double shift two days ago (day + same night) → management gives extra leave;
  // three days ago nobody came → that absence uses paid leave.
  const night = settings.shifts.find((s) => s.kind === 'night');
  const back = (n) => { const d = new Date(y.getFullYear(), y.getMonth(), y.getDate() - n); return { d, s: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }; };
  const d2 = back(1);
  const d3 = back(2);
  if (night) {
    await api('PUT', '/attendance/roster', { entries: [{ staff: staffId, date: d2.s, shifts: [day._id, night._id] }, { staff: staffId, date: d3.s, shifts: [day._id] }] });
    const stampOn = (d, hhmm, addMin) => {
      const [h, m] = hhmm.split(':').map(Number);
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m + addMin);
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
    };
    const nightEnd = new Date(d2.d.getFullYear(), d2.d.getMonth(), d2.d.getDate() + 1);
    await machine('POST', `/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`, `${pin}\t${stampOn(d2.d, day.start, 1)}\t0\t1\t0\t0\n${pin}\t${stampOn(nightEnd, night.end, 8)}\t1\t1\t0\t0\n`);
    const decide = await api('PUT', '/attendance/doubles', { staff: staffId, date: d2.s, decision: 'extra_leave' });
    check(`${decide.status} double shift rewarded with extra leave`, decide.status === 200, JSON.stringify(decide.body).slice(0, 200));
    const notDouble = await api('PUT', '/attendance/doubles', { staff: staffId, date: d3.s, decision: 'overtime', amount: 200 });
    check(`${notDouble.status} reward refused for a day that is not a double shift`, notDouble.status === 400);
    const m = await api('GET', `/attendance/month?month=${d2.s.slice(0, 7)}&staff=${staffId}`);
    const md = m.body.data;
    check(`${m.status} month shows the double shift and its extra leave`,
      md?.days?.[staffId]?.[d2.s]?.double === true && md.days[staffId][d2.s].decision?.decision === 'extra_leave' && md.leave[staffId].credits.length === 1,
      JSON.stringify(md?.leave?.[staffId]).slice(0, 300));
    if (d3.s.slice(0, 7) === d2.s.slice(0, 7)) {
      check('an absence uses paid leave first', md?.days?.[staffId]?.[d3.s]?.cover?.paid === 1, JSON.stringify(md?.days?.[staffId]?.[d3.s]).slice(0, 200));
    }
    await api('DELETE', `/attendance/doubles/${staffId}/${d2.s}`);
  }

  // Salary — worked out for a far-future month so no real month is touched
  const M = '2099-12';
  const pay = await api('PUT', `/users/${userId}`, {
    ...person,
    staffProfile: {
      onPayroll: true, monthlySalary: 15500, basicSalary: 9000, gender: 'male', pfApplicable: true, esiApplicable: true,
      uan: '100900800700', esicNo: '3199999999', bankAccount: '001234567890', ifsc: 'SBIN0000001',
    },
  });
  check(`${pay.status} salary details saved on the user`, pay.body.data?.staffProfile?.monthlySalary === 15500 && pay.body.data.staffProfile.machineId === pin);
  const adv = await api('POST', '/salary/advances', { staff: staffId, date: yesterday, amount: 1000, installment: 500, mode: 'cash', recordExpense: false });
  check(`${adv.status} salary advance recorded`, adv.status === 201);
  const prep = await api('POST', `/salary/runs/${M}/prepare`);
  const line = prep.body.data?.run?.lines?.find((l) => String(l.staff) === String(staffId));
  check(`${prep.status} salary worked out (PF on basic, ESI, PT, advance)`,
    line && line.gross === 15500 && line.pfEmployee === 1080 && line.esiEmployee === 117 && line.pt === 200 && line.advanceRecovery === 500 && line.netPay === 15500 - 1080 - 117 - 200 - 500,
    JSON.stringify(line && { gross: line.gross, pf: line.pfEmployee, esi: line.esiEmployee, pt: line.pt, adv: line.advanceRecovery, net: line.netPay }));
  const edit = await api('PATCH', `/salary/runs/${M}/lines/${staffId}`, { otherEarning: 300, otherEarningNote: 'Festival bonus' });
  const edited = edit.body.data?.run?.lines?.find((l) => String(l.staff) === String(staffId));
  check(`${edit.status} hand change to a salary line`, edited?.gross === 15800 && edited.otherEarningNote === 'Festival bonus');
  const early = await fetch(`${BASE}/api/salary/runs/${M}/files/ecr.txt`, { headers: auth });
  check(`${early.status} PF file refused while still a draft`, early.status === 400);
  const fin = await api('POST', `/salary/runs/${M}/finalize`);
  check(`${fin.status} salary finalised`, fin.body.data?.run?.status === 'finalized');
  for (const kind of ['register.xlsx', 'bank.xlsx', 'bank.csv', 'ecr.txt', 'esi.xlsx']) {
    const r = await fetch(`${BASE}/api/salary/runs/${M}/files/${kind}`, { headers: auth });
    const text = kind.endsWith('.txt') || kind.endsWith('.csv') ? await r.text() : '';
    const ok = r.status === 200 && (kind !== 'ecr.txt' || text.includes('100900800700#~#SMOKE TEST STAFF#~#15800#~#9000#~#9000#~#9000#~#1080#~#750#~#330#~#0#~#0'))
      && (kind !== 'bank.csv' || text.includes('001234567890'));
    check(`${r.status} salary file ${kind}`, ok, text.slice(0, 200));
  }
  const locked = await api('PATCH', `/salary/runs/${M}/lines/${staffId}`, { otherEarning: 0 });
  check(`${locked.status} finalised salary cannot be changed`, locked.status === 400);
  await api('POST', `/salary/runs/${M}/reopen`);
  const del = await api('DELETE', `/salary/runs/${M}`);
  check(`${del.status} draft deleted`, del.status === 200);
  const delAdv = await api('DELETE', `/salary/advances/${adv.body.data?._id}`);
  check(`${delAdv.status} advance deleted`, delAdv.status === 200);

  // Leave the database tidy for the next run
  await api('PUT', `/users/${userId}`, { ...person, isActive: false, staffProfile: { onPayroll: false, machineId: '' } });
  await api('PUT', '/attendance/settings', { devices: devices.filter((d) => d.serial !== sn) });
  return count;
}

main().catch((err) => { console.error(err.message); process.exit(1); });
