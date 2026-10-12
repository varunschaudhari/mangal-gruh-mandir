// Checks sign-in sessions against a running API (CI runs it after smoke.mjs):
//   - a phone sign-in doesn't sign the browser out (one session per device)
//   - a refresh token can't be used as an access token
//   - sign-out ends only that device's session
//   - refresh tokens from before sessions existed still work once and are upgraded
//
//   BASE_URL=… SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… JWT_SECRET=… MONGO_URI=… node scripts/auth-check.mjs
// The legacy-token check needs JWT_SECRET and MONGO_URI (same as the server's) and is skipped without them.
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const post = (path, body, token) => fetch(`${BASE}/api${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body || {}),
});
const me = (token) => fetch(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
const login = async (client) => (await (await post('/auth/login', { email: EMAIL, password: PASSWORD, client })).json()).data;
const refresh = (refreshToken) => post('/auth/refresh', { refreshToken });

const web = await login('web');
const app = await login('app');
check('sign-in returns per-device refresh tokens', /^[a-f0-9]{24}\./.test(web.refreshToken) && /^[a-f0-9]{24}\./.test(app.refreshToken));
check('browser stays signed in after the phone signs in', (await refresh(web.refreshToken)).status === 200);
check('phone session refreshes', (await refresh(app.refreshToken)).status === 200);
check('refresh token is rejected as an access token', (await me(app.refreshToken)).status === 401);
check('access token works', (await me(app.accessToken)).status === 200);
const meBody = (await (await me(app.accessToken)).json()).data || {};
check('"who am I" never returns the password hash or refresh token', meBody.email && !('password' in meBody) && !('refreshToken' in meBody));

await post('/auth/logout', {}, app.accessToken);
check('sign-out ends the phone session', (await refresh(app.refreshToken)).status === 401);
check('…and leaves the browser signed in', (await refresh(web.refreshToken)).status === 200);

// Changing the password signs out the other devices but keeps this one signed in.
const other = await login('web');
const phone = await login('app');
const changePassword = (from, to) => fetch(`${BASE}/api/auth/change-password`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${phone.accessToken}` },
  body: JSON.stringify({ currentPassword: from, newPassword: to }),
});
const changed = await changePassword(PASSWORD, `${PASSWORD}-tmp`);
check('password change succeeds', changed.ok, String(changed.status));
check('password change signs out other devices', (await refresh(other.refreshToken)).status === 401);
check('…but not the device that changed it', (await refresh(phone.refreshToken)).status === 200);
await changePassword(`${PASSWORD}-tmp`, PASSWORD); // put it back

if (process.env.JWT_SECRET && process.env.MONGO_URI) {
  // Simulate a device signed in before the upgrade: old-style JWT refresh token on the user.
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.collection('users');
  const user = await users.findOne({ email: EMAIL });
  const legacy = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
  await users.updateOne({ _id: user._id }, { $set: { refreshToken: legacy } });

  check('old-style refresh token can no longer call the API', (await me(legacy)).status === 401);
  const upgraded = await refresh(legacy);
  const body = await upgraded.json().catch(() => ({}));
  check('old-style refresh token is accepted once and upgraded', upgraded.status === 200 && /^[a-f0-9]{24}\./.test(body?.data?.refreshToken || ''));
  check('upgraded session works', (await refresh(body?.data?.refreshToken)).status === 200);
  check('old-style token cannot be reused', (await refresh(legacy)).status === 401);
  await mongoose.disconnect();
} else {
  console.log('– legacy-token check skipped (needs JWT_SECRET and MONGO_URI)');
}

// Sign-in limits: correct sign-ins never count; wrong passwords lock only that account
// (temple counters share one internet connection, so one person's typos mustn't lock out the rest).
const limit = Number(process.env.LOGIN_RATE_LIMIT) || 10;
let allIn = true;
for (let i = 0; i < limit + 2; i++) allIn = (await post('/auth/login', { email: EMAIL, password: PASSWORD })).status === 200 && allIn;
check(`${limit + 2} correct sign-ins in a row are never blocked`, allIn);
const guessed = `guess-${Date.now()}@test.local`;
for (let i = 0; i < limit; i++) await post('/auth/login', { email: guessed, password: 'Wrong-Pass-123!' });
check('repeated wrong passwords lock that account for a while', (await post('/auth/login', { email: guessed, password: 'Wrong-Pass-123!' })).status === 429);
check('…without blocking anyone else on the same connection', (await post('/auth/login', { email: EMAIL, password: PASSWORD })).status === 200);

if (failures.length) {
  console.error(`\n${failures.length} session check(s) failed`);
  process.exit(1);
}
console.log('\nSession checks OK');
