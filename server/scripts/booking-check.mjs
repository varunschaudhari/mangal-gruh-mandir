// End-to-end checks for abhishek / puja bookings against a running, seeded API:
// booking, double-tap protection, seat limits under parallel load, voiding, reports, P&L,
// the public receipt link. Changes Setup data, so run it on a test database only.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/booking-check.mjs
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
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return key(d); })();
const nextTuesday = (() => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() !== 2) d.setDate(d.getDate() + 1); return key(d); })();

async function main() {
  const login = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  const token = login?.data?.accessToken;
  if (!token) throw new Error('login failed');
  const api = async (method, path, body) => {
    const res = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, type, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };

  // ── Setup from the seed ─────────────────────────────────────────────────────
  const setup = (await api('GET', '/booking-setup')).body.data;
  check(setup.sevaTypes.length >= 6 && setup.batches.length >= 14, 'seed has the website\'s seva types and batches', `${setup.sevaTypes.length} types, ${setup.batches.length} batches`);
  const abhishek = setup.sevaTypes.find((s) => s.code === 'ABH');
  const post = setup.sevaTypes.find((s) => s.code === 'POST');
  const panch = setup.sevaTypes.find((s) => s.code === 'PANCH');
  const batch = setup.batches.find((b) => b.start === '07:00');

  // A small batch to test the limit
  await api('PUT', `/booking-setup/batches/${batch._id}`, { capacity: 5 });

  const avail = (await api('GET', `/bookings/availability?sevaType=${abhishek._id}&date=${tomorrow}`)).body.data;
  const row = avail.batches?.find((b) => b._id === batch._id);
  check(avail.open && row?.left === 5 && row.label === '7:00 AM – 8:15 AM' && row.hall === 'H1', 'availability lists batches with seats left', JSON.stringify(row));

  const devotee = { name: 'Prachi Shinde', phone: '9881180662', address: 'Wai, Satara', gotra: 'Kashyap', familyNames: ['Ashok Shinde'], rashi: 'Mesh' };
  const first = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: batch._id, devotee, peopleCount: 2, paymentMode: 'cash', clientRequestId: 'check-1' });
  const b1 = first.body.data;
  check(first.status === 201 && /^ABH\/\d{4}-\d{2}\/\d{5}$/.test(b1?.receiptNo) && b1.amount === 810 && b1.serialNo === 1 && b1.hall === 'H1',
    'counter booking gets receipt no., fixed price, serial and hall', JSON.stringify(first.body).slice(0, 200));
  check(Boolean(b1?.receiptUrl?.includes('/r/')), 'booking has a public receipt link');

  const again = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: batch._id, devotee, paymentMode: 'cash', clientRequestId: 'check-1' });
  check(again.status === 200 && again.body.data._id === b1._id, 'double-tapped "Book" returns the same booking');

  const tampered = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: batch._id, devotee, paymentMode: 'cash', amount: 1 });
  check(tampered.body.data?.amount === 810, 'the price comes from Setup, not the request');

  // 2 seats used. Fire 20 at once: exactly 3 must get in, with unique serials.
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => api('POST', '/bookings', {
    sevaType: abhishek._id, date: tomorrow, batch: batch._id, paymentMode: 'upi',
    devotee: { name: `Devotee ${i}`, phone: `98${String(10000000 + i).slice(-8)}` },
  })));
  const ok = burst.filter((r) => r.status === 201);
  const serials = new Set(ok.map((r) => r.body.data.serialNo));
  check(ok.length === 3 && serials.size === 3 && burst.filter((r) => r.status === 409).length === 17,
    '20 parallel bookings for 3 seats: 3 booked, 17 told it is full', `${ok.length} booked, statuses ${[...new Set(burst.map((r) => r.status))]}`);

  const full = (await api('GET', `/bookings/availability?sevaType=${abhishek._id}&date=${tomorrow}`)).body.data.batches.find((b) => b._id === batch._id);
  check(full.left === 0, 'availability shows the batch full');

  const voided = await api('PATCH', `/bookings/${b1._id}/void`, { reason: 'Devotee booked twice' });
  check(voided.status === 200 && voided.body.data.status === 'voided', 'void with a reason');
  const freed = (await api('GET', `/bookings/availability?sevaType=${abhishek._id}&date=${tomorrow}`)).body.data.batches.find((b) => b._id === batch._id);
  check(freed.left === 1, 'voiding frees the seat');
  check((await api('PATCH', `/bookings/${b1._id}/void`, { reason: 'again' })).status === 404, 'a voided booking cannot be voided again');

  // Other schedules
  const postB = await api('POST', '/bookings', { sevaType: post._id, devotee: { name: 'R. Patil', phone: '9822012345' }, paymentMode: 'cash' });
  check(postB.status === 400, 'Post Abhishek needs a postal address');
  const postOk = await api('POST', '/bookings', { sevaType: post._id, devotee: { name: 'R. Patil', phone: '9822012345', address: 'Pune 411001' }, paymentMode: 'cash' });
  check(postOk.status === 201 && !postOk.body.data.dateKey, 'Post Abhishek books without a date');

  const p1 = await api('POST', '/bookings', { sevaType: panch._id, date: nextTuesday, devotee: { name: 'Family A', phone: '9822000001' }, paymentMode: 'card' });
  const p2 = await api('POST', '/bookings', { sevaType: panch._id, date: nextTuesday, devotee: { name: 'Family B', phone: '9822000002' }, paymentMode: 'card' });
  check(p1.status === 201 && p2.status === 409, 'Panchamrit: one family per Tuesday');
  const wrongDay = await api('POST', '/bookings', { sevaType: panch._id, date: tomorrow === nextTuesday ? key(new Date(Date.now() + 2 * 864e5)) : tomorrow, devotee: { name: 'X', phone: '9822000003' }, paymentMode: 'cash' });
  check(wrongDay.status === 400, 'Panchamrit cannot be booked on other days');

  const partial = await api('POST', '/booking-setup/closures', { date: tomorrow, reason: 'Panchamrit only', sevaTypes: [panch._id] });
  check(partial.status === 201 && partial.body.data.existingBookings === 0, 'closing one seva counts only the bookings for that seva', JSON.stringify(partial.body.data?.existingBookings));
  await api('DELETE', `/booking-setup/closures/${partial.body.data._id}`);
  const closure = await api('POST', '/booking-setup/closures', { date: nextTuesday, reason: 'Test closure' });
  const closed = await api('POST', '/bookings', { sevaType: abhishek._id, date: nextTuesday, batch: batch._id, devotee, paymentMode: 'cash' });
  check(closed.status === 400 && /Test closure/.test(closed.body.message), 'closed dates refuse bookings');
  await api('DELETE', `/booking-setup/closures/${closure.body.data._id}`);

  // Returning devotee, register, reports
  const dv = (await api('GET', '/bookings/devotee?phone=9881180662')).body.data;
  check(dv?.bookings === 1 && dv.devotee.gotra === 'Kashyap', 'devotee lookup counts only bookings that were not voided', JSON.stringify(dv?.bookings));
  const dv2 = (await api('GET', '/bookings/devotee?phone=9822012345')).body.data;
  check(dv2?.devotee?.address === 'Pune 411001' && dv2.bookings === 1, 'returning devotee details are found by phone');

  const list = (await api('GET', `/bookings?q=Devotee&limit=50`)).body.data;
  check(list.total === 3 && list.amount === 2430, 'register search and totals', JSON.stringify({ total: list.total, amount: list.amount }));

  const sum = (await api('GET', '/bookings/reports/summary')).body.data;
  check(sum.totals.count === 6 && sum.voided.count === 1 && sum.byMode.upi?.count === 3 && sum.daily.length === 1,
    'summary report: totals, voided, by payment mode, daily', JSON.stringify(sum.totals));

  const sheet = (await api('GET', `/bookings/reports/day-sheet?date=${tomorrow}`)).body.data;
  check(sheet.groups.length === 1 && sheet.groups[0].bookings.length === 4, 'day sheet groups the batch\'s bookings');

  const xlsx = await api('GET', '/bookings/export/excel');
  check(xlsx.status === 200 && xlsx.type.includes('spreadsheet') && xlsx.body.byteLength > 2000, 'Excel export');
  const pdf = await api('GET', '/bookings/reports/summary/pdf');
  check(pdf.status === 200 && pdf.type.includes('pdf'), 'summary PDF');

  const now = new Date();
  const pnl = (await api('GET', `/pnl?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)).body.data;
  check(pnl.income.bookings === sum.totals.amount && pnl.income.bookingCount === 6, 'P&L includes booking income', JSON.stringify(pnl.income));

  const receiptToken = postOk.body.data.receiptUrl.split('/r/')[1];
  const pub = await (await fetch(`${BASE}/api/public/receipts/${receiptToken}`)).json();
  check(pub.data?.receiptNo === postOk.body.data.receiptNo && pub.data.devotee.phone.startsWith('XXXXXX') && !pub.data.devotee.address,
    'public receipt works without sign-in and hides phone and address');
  check((await fetch(`${BASE}/api/public/receipts/not-a-real-token-123`)).status === 404, 'unknown receipt link is 404');

  await api('PUT', `/booking-setup/batches/${batch._id}`, { capacity: 50 });
  console.log(failed ? `\n${failed} booking check(s) failed` : '\nBooking checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
