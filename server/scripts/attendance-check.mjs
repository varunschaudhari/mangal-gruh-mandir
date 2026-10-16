// End-to-end checks for attendance and salary against a running, seeded API: joining date
// required, last working day when switching someone off, taking someone back (their old days stay
// counted), a month frozen once its salary is finalised, finalising only after the month is over
// (open issues confirmed), the salary files, shift timings that apply from a date, shifts in use
// not removable, and the biometric machine endpoint (allowed addresses, rate limit). Adds test
// users, a salary run and a machine, so run it on a test database only.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/attendance-check.mjs
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
const monthOf = (back) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const M2 = monthOf(3);   // the first stint
const M1 = monthOf(2);   // back again; its salary gets finalised (well over, whatever day this runs)
const shiftDay = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addOne = (date) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

async function main() {
  const res = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  const token = res?.data?.accessToken;
  if (!token) throw new Error('admin login failed');
  const api = async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const stamp = Date.now();
  const person = (name, profile) => ({
    name, email: `${name.toLowerCase().replace(/\W+/g, '-')}-${stamp}@test.local`, password: 'Staff-Pass-123!', role: 'employee',
    phone: '', departments: [], isActive: true,
    staffProfile: { onPayroll: true, machineId: String(90000 + (stamp % 9000) + Math.floor(Math.random() * 900)), weeklyOffDay: 0, monthlySalary: 15000, ...profile },
  });

  // ── Joining date ────────────────────────────────────────────────────────────
  const noJoin = await api('POST', '/users', person('No Join Date', { joinDate: '' }));
  check(noJoin.status === 400 && /joining date/i.test(noJoin.body.message), 'putting someone on payroll needs a joining date', noJoin.body.message);
  const body = person('Stint Person', { joinDate: `${M2}-01` });
  const created = await api('POST', '/users', body);
  const userId = created.body.data?._id;
  const staffId = created.body.data?.staffProfile?._id;
  check(created.status === 201 && staffId, 'on payroll with a joining date', JSON.stringify(created.body).slice(0, 200));
  const update = (changes, profile) => api('PUT', `/users/${userId}`, {
    name: body.name, phone: '', role: 'employee', departments: [], ...changes,
    staffProfile: { ...body.staffProfile, ...profile },
  });
  const statusOn = async (month, date) => {
    const m = (await api('GET', `/attendance/month?month=${month}&staff=${staffId}`)).body.data;
    return m?.days?.[staffId]?.[date]?.status;
  };

  // ── Leaving ─────────────────────────────────────────────────────────────────
  const offNoDate = await update({ isActive: false }, { joinDate: `${M2}-01`, leftOn: '' });
  check(offNoDate.status === 400 && /last working day/i.test(offNoDate.body.message), 'switching off someone on payroll needs their last working day', offNoDate.body.message);
  const left = await update({ isActive: false }, { joinDate: `${M2}-01`, leftOn: `${M2}-15` });
  check(left.status === 200, 'switched off with a last working day');
  check(await statusOn(M2, `${M2}-10`) !== 'not_employed' && await statusOn(M2, `${M2}-20`) === 'not_employed',
    'the month they left still counts their days up to the last working day');
  const m1List = (await api('GET', `/attendance/month?month=${M1}`)).body.data;
  check(!m1List.staff.some((s) => s._id === staffId), 'after leaving they drop out of later months');

  // ── Taken back ──────────────────────────────────────────────────────────────
  const backNoDate = await update({ isActive: true }, { joinDate: `${M2}-01`, leftOn: `${M2}-15` });
  check(backNoDate.status === 400 && /rejoin/i.test(backNoDate.body.message), 'switching someone back on asks for the rejoining date (or clearing the last day)', backNoDate.body.message);
  const back = await update({ isActive: true }, { joinDate: `${M1}-01`, leftOn: `${M2}-15` });
  const profile = (await api('GET', `/users/${userId}`)).body.data?.staffProfile;
  check(back.status === 200 && !profile?.leftOn && profile?.pastPeriods?.length === 1, 'rejoining starts a new stint and keeps the old one', JSON.stringify(profile?.pastPeriods));
  check(await statusOn(M2, `${M2}-10`) !== 'not_employed' && await statusOn(M2, `${M2}-20`) === 'not_employed' && await statusOn(M1, `${M1}-05`) !== 'not_employed',
    'old stint days still count, the gap does not, the new stint does');

  // ── Salary: open issues, finalising, files ──────────────────────────────────
  const pay = await update({}, {
    joinDate: `${M1}-01`, leftOn: '', basicSalary: 9000, gender: 'male', pfApplicable: true, uan: '100900800711',
    bankAccount: '009988776655', ifsc: 'SBIN0000001',
  });
  check(pay.status === 200, 'salary details saved', pay.body.message);
  // A single punch on a working day = missing punch, which finalising has to confirm
  let oneDay = `${M1}-12`;
  while (new Date(`${oneDay}T12:00:00`).getDay() === 0) oneDay = `${M1}-${pad(Number(oneDay.slice(-2)) + 1)}`;
  await api('POST', '/attendance/punches', { staff: staffId, time: `${oneDay}T08:00:00+05:30`, reason: 'Check: forgot to punch out', day: oneDay });
  const prepared = await api('POST', `/salary/runs/${M1}/prepare`, {});
  const unconfirmed = await api('POST', `/salary/runs/${M1}/finalize`, {});
  check(unconfirmed.status === 400 && unconfirmed.body.errors?.[0]?.code === 'CHECKLIST', 'finalising with a missing punch needs a confirmation', `${unconfirmed.status} ${unconfirmed.body.message}`);
  const finalized = await api('POST', `/salary/runs/${M1}/finalize`, { confirmIssues: true });
  check(prepared.status < 300 && finalized.status < 300, `salary for ${M1} prepared and finalised (issues confirmed)`, `${prepared.status} ${finalized.status} ${finalized.body.message || ''}`);
  const auth = { authorization: `Bearer ${token}` };
  for (const kind of ['register.xlsx', 'bank.xlsx', 'bank.csv', 'ecr.txt', 'esi.xlsx']) {
    const r = await fetch(`${BASE}/api/salary/runs/${M1}/files/${kind}`, { headers: auth });
    const text = kind.endsWith('.txt') || kind.endsWith('.csv') ? await r.text() : '';
    const ok = r.status === 200 && (kind !== 'ecr.txt' || text.includes('100900800711')) && (kind !== 'bank.csv' || text.includes('009988776655'));
    check(ok, `salary file ${kind}`, `${r.status} ${text.slice(0, 120)}`);
  }
  check((await api('PATCH', `/salary/runs/${M1}/lines/${staffId}`, { otherEarning: 100 })).status === 400, 'a finalised salary cannot be changed');
  const thisMonth = today.slice(0, 7);
  await api('POST', `/salary/runs/${thisMonth}/prepare`, {});
  const early = await api('POST', `/salary/runs/${thisMonth}/finalize`, { confirmIssues: true });
  check(early.status === 400 && /isn’t over/.test(early.body.message || ''), 'this month’s salary can’t be finalised before the month is over', early.body.message);
  await api('DELETE', `/salary/runs/${thisMonth}`);

  // ── Salary finalised → attendance frozen ────────────────────────────────────
  const fix = { staff: staffId, date: `${M1}-05`, status: 'present', note: 'Check' };
  const blocked = await api('PUT', '/attendance/overrides', fix);
  check(blocked.status === 409 && blocked.body.errors?.[0]?.code === 'MONTH_LOCKED', 'a correction in a finalised month is refused', `${blocked.status} ${blocked.body.message}`);
  check((await api('POST', '/attendance/leave', { staff: staffId, from: `${M1}-06`, to: `${M1}-07`, note: 'Check' })).status === 409, 'leave in a finalised month is refused');
  check((await api('PUT', '/attendance/roster', { entries: [{ staff: staffId, date: `${M1}-08`, off: true }] })).status === 409, 'roster changes in a finalised month are refused');
  check((await api('POST', '/attendance/punches', { staff: staffId, time: `${M1}-09T08:00:00+05:30`, reason: 'Check' })).status === 409, 'a missed punch in a finalised month is refused');
  check((await api('GET', `/attendance/month?month=${M1}`)).body.data?.locked === 'finalized', 'the month view says it is locked');
  const settings0 = (await api('GET', '/attendance/settings')).body.data;
  const backdated = await api('PUT', '/attendance/settings', { graceMinutes: settings0.graceMinutes + 5, effectiveFrom: `${M1}-10` });
  check(backdated.status === 409, 'a rule change reaching back into a finalised month is refused', `${backdated.status} ${backdated.body.message}`);
  const reopened = await api('POST', `/salary/runs/${M1}/reopen`, {});
  check(reopened.status < 300 && (await api('PUT', '/attendance/overrides', fix)).status === 200, 'after reopening the salary, the correction goes through');

  // Tidy up: the draft salary run and the test person's correction
  await api('DELETE', `/attendance/overrides/${staffId}/${M1}-05`);
  await api('DELETE', `/salary/runs/${M1}`);

  // ── Shift timings apply from a date; shifts in use stay ─────────────────────
  const before = (await api('GET', '/attendance/settings')).body.data;
  const dayShift = before.shifts.find((x) => x.kind === 'day');
  const moved = await api('PUT', '/attendance/settings', {
    shifts: before.shifts.map((x) => (x._id === dayShift._id ? { ...x, start: '07:30' } : x)), effectiveFrom: today,
  });
  const saved = moved.body.data?.shifts?.find((x) => x._id === dayShift._id);
  check(moved.status === 200 && saved?.start === '07:30' && saved.past?.at(-1)?.start === dayShift.start && saved.past.at(-1).until < today,
    'a new shift timing is kept apart from the old one, which still applies to earlier days', JSON.stringify(saved?.past));
  await api('PUT', '/attendance/settings', { shifts: moved.body.data.shifts.map((x) => (x._id === dayShift._id ? { ...x, start: dayShift.start } : x)), effectiveFrom: addOne(today) });
  const removed = await api('PUT', '/attendance/settings', { shifts: before.shifts.filter((x) => x._id !== dayShift._id) });
  check(removed.status === 400 && /can’t be removed/.test(removed.body.message || ''), 'the usual day shift can’t be removed while staff rely on it', removed.body.message);

  // ── Salary money: an advance recovered once, "paid" recorded once ──────────
  const adv = await api('POST', '/users', person('Advance Person', { joinDate: `${M2}-01`, monthlySalary: 10000 }));
  const advStaff = adv.body.data?.staffProfile?._id;
  const advance = (await api('POST', '/salary/advances', { staff: advStaff, date: `${M2}-05`, amount: 1000, installment: 1000, mode: 'cash', recordExpense: false })).body.data;
  const lineOf = async (month) => (await api('GET', `/salary/runs/${month}`)).body.data?.run?.lines?.find((l) => String(l.staff) === String(advStaff));
  await api('POST', `/salary/runs/${M2}/prepare`, {});
  const firstFinal = await api('POST', `/salary/runs/${M2}/finalize`, { confirmIssues: true });
  check(firstFinal.status === 200 && (await lineOf(M2))?.advanceRecovery === 1000, `the advance is recovered in ${M2}`, firstFinal.body.message);
  await api('POST', `/salary/runs/${M2}/reopen`, {});
  await api('POST', `/salary/runs/${M1}/prepare`, {});
  await api('POST', `/salary/runs/${M1}/finalize`, { confirmIssues: true });
  check((await lineOf(M1))?.advanceRecovery === 1000, `while ${M2} is reopened, ${M1} recovers the advance instead`);
  const twice = await api('POST', `/salary/runs/${M2}/finalize`, { confirmIssues: true });
  check(twice.status === 409 && /recalculate/i.test(twice.body.message || ''), `finalising ${M2} again would recover it twice — refused`, `${twice.status} ${twice.body.message}`);
  await api('POST', `/salary/runs/${M2}/prepare`, {});
  const recalculated = await api('POST', `/salary/runs/${M2}/finalize`, { confirmIssues: true });
  check(recalculated.status === 200 && (await lineOf(M2))?.advanceRecovery === 0, 'after recalculating it is finalised without the recovery');
  await api('POST', `/salary/runs/${M1}/reopen`, {});
  const withRecovery = await lineOf(M1);
  const deleted = await api('DELETE', `/salary/advances/${advance?._id}`);
  const withoutRecovery = await lineOf(M1);
  check(deleted.status === 200 && withoutRecovery?.advanceRecovery === 0 && withoutRecovery.netPay === withRecovery.netPay + 1000,
    'deleting an advance works the draft out again (net pay goes back up)', JSON.stringify({ before: withRecovery?.netPay, after: withoutRecovery?.netPay }));
  const paying = await Promise.all([1, 2].map(() => api('POST', `/salary/runs/${M2}/paid`, { paidOn: today })));
  const paidRun = (await api('GET', `/salary/runs/${M2}`)).body.data?.run;
  const descriptions = (paidRun?.expenses || []).map((e) => e.description);
  check(paying.map((r) => r.status).sort().join() === '200,409' && paidRun?.status === 'paid' && new Set(descriptions).size === descriptions.length,
    'two "mark as paid" at once: one records the expenses, the other is refused', JSON.stringify({ statuses: paying.map((r) => r.status), descriptions }));
  await api('DELETE', `/salary/runs/${M1}`);

  // ── A holiday added after the roster still counts ───────────────────────────
  const hDate = shiftDay(today, 9);
  const shiftsNow = (await api('GET', '/attendance/settings')).body.data;
  const dayId = shiftsNow.shifts.find((x) => x.kind === 'day')._id;
  await api('PUT', '/attendance/roster', { entries: [{ staff: advStaff, date: hDate, shifts: [dayId] }] });
  const cellOn = async () => (await api('GET', `/attendance/roster?from=${hDate}&to=${hDate}`)).body.data?.cells?.[advStaff]?.[hDate];
  check((await cellOn())?.planned === true, 'rostered for a day shift on the date');
  await api('PUT', '/attendance/settings', { holidays: [...shiftsNow.holidays, { date: hDate, name: 'Check holiday' }] });
  const afterHoliday = await cellOn();
  check(afterHoliday?.off === true && afterHoliday.holiday === 'Check holiday' && !afterHoliday.planned, 'a holiday added after the roster gives the day off', JSON.stringify(afterHoliday));
  await api('PUT', '/attendance/roster', { entries: [{ staff: advStaff, date: hDate, shifts: [dayId] }] });
  check((await cellOn())?.planned === true, 'rostering someone on the holiday afterwards makes them work it');
  await api('PUT', '/attendance/settings', { holidays: shiftsNow.holidays });

  // ── Biometric machine: allowed addresses, rate limit ────────────────────────
  const sn = `CHECK-${stamp}`;
  const machine = (path) => fetch(`${BASE}/iclock${path}`).then((r) => r.status);
  await machine(`/cdata?SN=${sn}`);   // first contact: waiting for approval
  const listed = (await api('GET', '/attendance/settings')).body.data.devices;
  const mine = listed.find((d) => d.serial === sn);
  await api('PUT', '/attendance/settings', { devices: listed.map((d) => (d.serial === sn ? { ...d, approved: true, allowedIps: '10.9.9.9' } : d)) });
  check(await machine(`/cdata?SN=${sn}`) === 403, 'an approved machine is refused from an address that is not allowed');
  const refused = (await api('GET', '/attendance/settings')).body.data.devices.find((d) => d.serial === sn);
  check(Boolean(refused?.blockedAt) && Boolean(refused.blockedIp), 'the refused address is shown in the settings', JSON.stringify(refused));
  const ip = mine?.lastIp || refused?.blockedIp;
  const allowedNow = await api('PUT', '/attendance/settings', { devices: listed.map((d) => (d.serial === sn ? { ...d, approved: true, allowedIps: ip } : d)) });
  check(allowedNow.status === 200 && await machine(`/cdata?SN=${sn}`) === 200, `the machine is accepted from its own address (${ip})`);

  // Approved with no address set: the first address it connects from is locked in, so the
  // serial number alone can't be used from elsewhere. (The test API trusts X-Forwarded-For, as
  // it would from nginx, so it can stand in for other addresses.)
  const sn2 = `LOCK-${stamp}`;
  const fromAddr = (addr) => fetch(`${BASE}/iclock/cdata?SN=${sn2}`, { headers: { 'x-forwarded-for': addr } }).then((r) => r.status);
  await fromAddr('10.20.30.40');
  const list2 = (await api('GET', '/attendance/settings')).body.data.devices;
  await api('PUT', '/attendance/settings', { devices: list2.map((d) => (d.serial === sn2 ? { ...d, approved: true, allowedIps: '' } : d)) });
  check(await fromAddr('10.20.30.40') === 200, 'an approved machine with no address set is accepted on its next contact');
  check(await fromAddr('10.99.99.99') === 403, '…and from then on refused from any other address');
  const lockedTo = (await api('GET', '/attendance/settings')).body.data.devices.find((d) => d.serial === sn2)?.allowedIps;
  check(lockedTo === '10.20.30.40', 'the locked-in address shows in the settings', lockedTo);

  // ── Machine number corrected: the punches move with it ──────────────────────
  const yesterday = shiftDay(today, -1);
  const from = `${monthOf(1)}-01`;
  const pinA = String(70000 + (stamp % 9000)); const pinB = String(Number(pinA) + 1); const pinC = String(Number(pinA) + 2);
  const userBody = (name, profile) => ({ name, phone: '', role: 'employee', departments: [], isActive: true, staffProfile: { onPayroll: true, joinDate: from, weeklyOffDay: 0, ...profile } });
  const wrong = await api('POST', '/users', { ...userBody('Wrong Number', { machineId: pinA }), email: `wrong-${stamp}@test.local`, password: 'Staff-Pass-123!' });
  const wrongStaff = wrong.body.data?.staffProfile?._id;
  const attlog = `${pinA}\t${yesterday} 08:01:00\t0\t1\t0\t0\t0\n${pinA}\t${yesterday} 17:03:00\t0\t1\t0\t0\t0`;
  const sent = await fetch(`${BASE}/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=1`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: attlog });
  const punchesOf = async (sid) => (await api('GET', `/attendance/days?from=${yesterday}&to=${yesterday}&staff=${sid}`)).body.data?.days?.[sid]?.[yesterday]?.punches?.length || 0;
  check(sent.status === 200 && await punchesOf(wrongStaff) === 2, 'punches under a machine number go to whoever has that number');
  const corrected = await api('PUT', `/users/${wrong.body.data?._id}`, userBody('Wrong Number', { machineId: pinB, machineIdWasWrong: true }));
  const unknown = (await api('GET', '/attendance/staff/unmapped')).body.data || [];
  check(corrected.status === 200 && await punchesOf(wrongStaff) === 0 && unknown.some((u) => u.machineId === pinA),
    'correcting a wrong machine number takes its punches off the person (an unknown number until someone has it)', corrected.body.message);
  const owner = await api('POST', '/users', { ...userBody('Real Owner', { machineId: pinA }), email: `owner-${stamp}@test.local`, password: 'Staff-Pass-123!' });
  const ownerStaff = owner.body.data?.staffProfile?._id;
  check(await punchesOf(ownerStaff) === 2, 'the real owner of the number gets the punches');
  await api('PUT', `/users/${owner.body.data?._id}`, userBody('Real Owner', { machineId: pinC, machineIdWasWrong: false }));
  check(await punchesOf(ownerStaff) === 2, 'a number changed on purpose (enrolled again) keeps the punches');
  check((await api('PUT', '/attendance/settings', { devices: listed.map((d) => (d.serial === sn ? { ...d, allowedIps: 'not-an-address' } : d)) })).status === 400,
    'a wrong address in the list is refused');
  const burst = await Promise.all(Array.from({ length: 130 }, () => machine(`/getrequest?SN=${sn}`)));
  check(burst.includes(429), 'a flood of requests to the machine endpoint is cut off', JSON.stringify([...new Set(burst)]));
  await api('PUT', '/attendance/settings', { devices: listed.filter((d) => d.serial !== sn) });

  console.log(failed ? `\n${failed} attendance check(s) failed` : '\nAttendance checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
