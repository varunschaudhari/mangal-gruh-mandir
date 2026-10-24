// Notice board checks against a running, seeded API: who may post (notices:manage, also on a
// custom role), what devotees (public list, no sign-in) and staff (anyone signed in) each see,
// hiding, editing, deleting, and the title rule. Adds test users, a role and notices, so run it
// on a test database only.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/notice-check.mjs
// Used by CI (.github/workflows/ci.yml).

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${!ok && extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};

async function signIn(email, password) {
  const res = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })).json();
  const token = res?.data?.accessToken;
  if (!token) throw new Error(`login failed for ${email}: ${res?.message}`);
  return async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const publicList = async () => (await (await fetch(`${BASE}/api/public/notices`)).json()).data;

async function main() {
  const admin = await signIn(EMAIL, PASSWORD);
  const stamp = Date.now();
  const person = (email, role) => ({ name: 'Notice Check', email, password: 'Staff-Pass-123!', role, phone: '', departments: [], isActive: true });

  // An employee (no permissions) and someone on a custom role that may post notices
  const empBody = person(`notice-emp-${stamp}@test.local`, 'employee');
  check((await admin('POST', '/users', empBody)).status === 201, 'an employee with no permissions');
  const employee = await signIn(empBody.email, empBody.password);
  const role = await admin('POST', '/roles', { slug: `notice_poster_${stamp}`, name: `Notice poster ${stamp}`, permissions: ['notices:manage'] });
  const posterBody = person(`notice-poster-${stamp}@test.local`, role.body.data?.slug);
  check(role.status === 201 && (await admin('POST', '/users', posterBody)).status === 201, 'a custom role with only "notices:manage"', role.body.message);
  const poster = await signIn(posterBody.email, posterBody.password);

  const tag = `#${stamp}`;
  const post = (who, audience, extra = {}) => who('POST', '/notices', {
    title: { mr: `सूचना ${audience} ${tag}`, hi: '', en: `Notice ${audience} ${tag}` }, body: { mr: 'तपशील', hi: '', en: 'Details' }, audience, ...extra,
  });

  // Who may post
  check((await post(employee, 'both')).status === 403, 'an employee cannot post a notice');
  const forBoth = await post(poster, 'both');
  check(forBoth.status === 201, 'the custom role can post one', forBoth.body.message);
  const forStaff = await post(admin, 'staff');
  const forDevotees = await post(admin, 'devotees');
  check(forStaff.status === 201 && forDevotees.status === 201, 'admin posts one for staff and one for devotees');
  const noTitle = await admin('POST', '/notices', { title: { mr: '  ', hi: '', en: '' }, body: { en: 'text only' }, audience: 'both' });
  check(noTitle.status === 400 && /title/i.test(noTitle.body.message), 'a notice needs a title in at least one language', noTitle.body.message);
  check((await admin('POST', '/notices', { title: { en: 'x' }, audience: 'everyone' })).status === 400, 'an unknown audience is refused');

  const mine = (list) => (list || []).filter((n) => (n.title?.en || '').endsWith(tag)).map((n) => n.title.en.split(' ')[1]).sort().join();

  // What each side sees
  const pub = await publicList();
  check(mine(pub.notices) === 'both,devotees', 'devotees (no sign-in) see the devotee and both notices', mine(pub.notices));
  check(pub.notices.every((n) => !n.createdBy && !n.audience), 'the public list carries no staff details');
  check(typeof pub.temple?.name === 'string', 'the public list carries the temple name for the page header');
  const staffSees = await employee('GET', '/notices');
  check(staffSees.status === 200 && mine(staffSees.body.data) === 'both,staff', 'staff (any sign-in) see the staff and both notices', mine(staffSees.body.data));
  check((await employee('GET', '/notices/all')).status === 403, 'only those who post see every notice');
  check(mine((await poster('GET', '/notices/all')).body.data) === 'both,devotees,staff', 'those who post see all of them');
  check((await fetch(`${BASE}/api/notices`)).status === 401, 'the staff list needs a sign-in');

  // Hide, show, edit, delete
  const id = forBoth.body.data._id;
  check((await employee('PUT', `/notices/${id}`, { isActive: false })).status === 403, 'an employee cannot hide a notice');
  check((await poster('PUT', `/notices/${id}`, { isActive: false })).status === 200, 'hiding a notice…');
  check(mine((await publicList()).notices) === 'devotees' && mine((await employee('GET', '/notices')).body.data) === 'staff',
    '…takes it off for devotees and staff');
  const edited = await poster('PUT', `/notices/${id}`, { isActive: true, title: { mr: '', hi: `सूचना both ${tag}`, en: `Notice both ${tag}` } });
  check(edited.status === 200 && edited.body.data.isActive && edited.body.data.title.hi.startsWith('सूचना'), 'showing it again with the text changed', edited.body.message);
  check((await poster('PUT', `/notices/${id}`, { title: { mr: '', hi: '', en: '' } })).status === 400, 'an edit cannot blank every title');
  check((await employee('DELETE', `/notices/${id}`)).status === 403, 'an employee cannot delete a notice');
  for (const n of [forBoth, forStaff, forDevotees]) await admin('DELETE', `/notices/${n.body.data._id}`);
  check(mine((await publicList()).notices) === '' && mine((await admin('GET', '/notices/all')).body.data) === '', 'deleted notices are gone everywhere');
  check((await admin('DELETE', `/notices/${id}`)).status === 404, 'deleting it again: not found');

  console.log(failed ? `\n${failed} notice check(s) failed` : '\nNotice checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
