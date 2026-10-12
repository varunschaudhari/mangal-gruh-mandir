// End-to-end checks for abhishek / puja bookings against a running, seeded API:
// booking, double-tap protection, duplicate warning, seat limits under parallel load, voiding,
// reports, P&L, the public receipt link, fixing details, moving, shift close and cash handover. Changes Setup data, so run it on a test database only.
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
// Panchamrit is done on Tuesdays only. Keep its date clear of `tomorrow` (most checks use tomorrow),
// so the checks pass whatever day of the week they run.
const nextTuesday = (() => { const d = new Date(); d.setDate(d.getDate() + 2); while (d.getDay() !== 2) d.setDate(d.getDate() + 1); return key(d); })();
const notTuesday = (() => { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 2) d.setDate(d.getDate() + 1); return key(d); })();

// Signs in and returns api(method, path, body) → { status, type, body } for that user.
async function login(email, password) {
  const res = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })).json();
  const token = res?.data?.accessToken;
  if (!token) throw new Error(`login failed for ${email}`);
  return async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, type, body: type.includes('json') ? await r.json() : await r.arrayBuffer() };
  };
}

async function main() {
  const api = await login(EMAIL, PASSWORD);

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

  const dupWarn = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: batch._id, devotee, paymentMode: 'cash' });
  check(dupWarn.status === 409 && dupWarn.body.errors?.[0]?.code === 'DUPLICATE' && dupWarn.body.errors[0].booking?.receiptNo === b1.receiptNo,
    'same phone, seva and day: warned before booking again', JSON.stringify(dupWarn.body).slice(0, 200));

  const tampered = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: batch._id, devotee, paymentMode: 'cash', amount: 1, allowDuplicate: true });
  check(tampered.status === 201 && tampered.body.data?.amount === 810, '"Book anyway" goes through, and the price comes from Setup, not the request');

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
  const postNoPin = await api('POST', '/bookings', { sevaType: post._id, devotee: { name: 'R. Patil', phone: '9822012345', address: '12, FC Road' }, paymentMode: 'cash' });
  check(postNoPin.status === 400, 'Post Abhishek needs a PIN code with the postal address');
  const postOk = await api('POST', '/bookings', {
    sevaType: post._id, paymentMode: 'cash',
    devotee: { name: 'R. Patil', phone: '9822012345', address: '12, FC Road', pincode: '411004', area: 'Deccan Gymkhana', city: 'Pune City', district: 'Pune', state: 'Maharashtra' },
  });
  check(postOk.status === 201 && !postOk.body.data.dateKey && postOk.body.data.devotee?.pincode === '411004', 'Post Abhishek books without a date (address with PIN kept)');

  const p1 = await api('POST', '/bookings', { sevaType: panch._id, date: nextTuesday, devotee: { name: 'Family A', phone: '9822000001' }, paymentMode: 'card' });
  const p2 = await api('POST', '/bookings', { sevaType: panch._id, date: nextTuesday, devotee: { name: 'Family B', phone: '9822000002' }, paymentMode: 'card' });
  check(p1.status === 201 && p2.status === 409, 'Panchamrit: one family per Tuesday');
  const wrongDay = await api('POST', '/bookings', { sevaType: panch._id, date: notTuesday, devotee: { name: 'X', phone: '9822000003' }, paymentMode: 'cash' });
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
  check(dv?.upcoming?.length === 1 && dv.upcoming[0].receiptNo === tampered.body.data.receiptNo && dv.upcoming[0].dateKey === tomorrow,
    'devotee lookup lists bookings still ahead', JSON.stringify(dv?.upcoming));
  const dv2 = (await api('GET', '/bookings/devotee?phone=9822012345')).body.data;
  check(dv2?.devotee?.address === '12, FC Road' && dv2.devotee.pincode === '411004' && dv2.devotee.district === 'Pune' && dv2.bookings === 1,
    'returning devotee details (with PIN, district) are found by phone');

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

  // ── Fixing mistakes without voiding ─────────────────────────────────────────
  const t = tampered.body.data;
  const edited = await api('PATCH', `/bookings/${t._id}`, { devotee: { name: 'Prachi A. Shinde', gotra: 'Bharadwaj' }, reason: 'Spelling' });
  const e = edited.body.data;
  check(edited.status === 200 && e.devotee.name === 'Prachi A. Shinde' && e.devotee.phone === devotee.phone && e.receiptNo === t.receiptNo && e.amount === t.amount,
    'edit details keeps the receipt number, amount and other details', JSON.stringify(edited.body).slice(0, 200));
  check(e?.history?.length === 1 && e.history[0].action === 'edit' && e.history[0].reason === 'Spelling' && Boolean(e.history[0].by?.name)
    && JSON.stringify(Object.keys(e.history[0].changes).sort()) === '["devotee.gotra","devotee.name"]', 'the edit is kept in the booking history', JSON.stringify(e?.history));
  const noop = await api('PATCH', `/bookings/${t._id}`, { devotee: { name: 'Prachi A. Shinde' } });
  check(noop.status === 200 && noop.body.data.history.length === 1, 'saving without changes adds nothing to history');
  check((await api('PATCH', `/bookings/${t._id}`, { devotee: { phone: '12345' } })).status === 400, 'edit still checks the phone number');
  const postNoPinEdit = await api('PATCH', `/bookings/${postOk.body.data._id}`, { devotee: { pincode: '' } });
  const postName = await api('PATCH', `/bookings/${postOk.body.data._id}`, { devotee: { name: 'R. S. Patil' } });
  check(postNoPinEdit.status === 400 && postName.status === 200, 'Post Abhishek: the PIN code cannot be removed, the name can be fixed');

  const leftOf = async (id) => (await api('GET', `/bookings/availability?sevaType=${abhishek._id}&date=${tomorrow}`)).body.data.batches.find((b) => b._id === id)?.left;
  const other = (await api('GET', `/bookings/availability?sevaType=${abhishek._id}&date=${tomorrow}`)).body.data.batches.find((b) => b._id !== batch._id && !b.ended);
  const before1 = await leftOf(batch._id); const before2 = await leftOf(other._id);
  const moved = await api('POST', `/bookings/${t._id}/move`, { date: tomorrow, batch: other._id, reason: 'Devotee asked for later' });
  const m = moved.body.data;
  check(moved.status === 200 && m.batch === other._id && m.hall === other.hall && m.serialNo === 1 && m.receiptNo === t.receiptNo && m.history.at(-1).action === 'move',
    'move to another batch: new hall and serial, same receipt', JSON.stringify(moved.body).slice(0, 200));
  check(await leftOf(batch._id) === before1 + 1 && await leftOf(other._id) === before2 - 1, 'moving frees the old seat and takes the new one');
  check((await api('POST', `/bookings/${t._id}/move`, { date: tomorrow, batch: other._id })).status === 400, 'moving to the same batch is refused');
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return key(d); })();
  check((await api('POST', `/bookings/${t._id}/move`, { date: yesterday, batch: batch._id })).status === 400, 'moving to a past date is refused');

  await api('PUT', `/booking-setup/batches/${batch._id}`, { capacity: 3 }); // 3 burst bookings left in it → full
  const fullMove = await api('POST', `/bookings/${t._id}/move`, { date: tomorrow, batch: batch._id });
  check(fullMove.status === 409 && await leftOf(other._id) === before2 - 1, 'moving into a full batch is refused and keeps the seat', `${fullMove.status}`);

  const paidUpi = await api('PATCH', `/bookings/${t._id}`, { paymentMode: 'upi', paymentRef: 'UPI-123' });
  check(paidUpi.status === 200 && paidUpi.body.data.paymentMode === 'upi' && paidUpi.body.data.history.at(-1).changes.paymentMode?.[1] === 'upi',
    'payment mode can be fixed before the shift is closed');
  await api('PATCH', `/bookings/${t._id}`, { paymentMode: 'cash', paymentRef: '' });

  // ── Shift close and cash handover ───────────────────────────────────────────
  const sum2 = (await api('GET', '/bookings/reports/summary')).body.data;
  const cur = (await api('GET', '/booking-shifts/current')).body.data;
  check(cur.totals.count === sum2.totals.count && cur.totals.cash === (sum2.byMode.cash?.amount || 0) && cur.totals.voidedCount === sum2.voided.count,
    'open shift totals match the bookings taken', JSON.stringify(cur.totals));
  const expected = 500 + cur.totals.cash;
  const noNote = await api('POST', '/booking-shifts/close', { openingFloat: 500, countedCash: expected - 100 });
  check(noNote.status === 400 && /short/i.test(noNote.body.message), 'a short count needs a note');
  check((await api('GET', '/booking-shifts/current')).body.data.totals.count === cur.totals.count, 'a refused close leaves the bookings open');
  const closedShift = await api('POST', '/booking-shifts/close', { openingFloat: 500, countedCash: expected - 100, notes: 'Short by 100' });
  const sh = closedShift.body.data;
  check(closedShift.status === 201 && sh.expectedCash === expected && sh.difference === -100 && sh.status === 'closed'
    && sh.bookings.length === cur.totals.count + cur.totals.voidedCount, 'close shift: expected cash, shortfall and its bookings', JSON.stringify(closedShift.body).slice(0, 200));
  check((await api('GET', '/booking-shifts/current')).body.data.totals.count === 0, 'after closing, the next shift starts empty');
  check((await api('POST', '/booking-shifts/close', { countedCash: 0 })).status === 400, 'nothing to close twice');
  check((await api('PATCH', `/bookings/${t._id}`, { paymentMode: 'card' })).status === 400, 'payment mode is locked once the shift is closed');

  const late = await api('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: other._id, devotee: { name: 'After close', phone: '9822000099' }, paymentMode: 'cash' });
  const cur2 = (await api('GET', '/booking-shifts/current')).body.data;
  check(late.status === 201 && cur2.totals.count === 1 && cur2.totals.cash === 810, 'a booking after the close goes into the next shift');
  const byNotes = await api('POST', '/booking-shifts/close', { denominations: { 500: 1, 200: 1, 100: 1, 10: 1 } });
  check(byNotes.status === 201 && byNotes.body.data.countedCash === 810 && byNotes.body.data.difference === 0, 'count by notes adds up the denominations');

  const verified = await api('PATCH', `/booking-shifts/${sh._id}/verify`, { note: 'Checked' });
  check(verified.status === 200 && verified.body.data.status === 'verified' && Boolean(verified.body.data.verifiedBy?.name), 'supervisor verifies the handover');
  check((await api('PATCH', `/booking-shifts/${sh._id}/verify`, {})).status === 400, 'a verified handover cannot be verified again');

  // Counter staff: their own shift only, no verifying, no changing someone else's payment
  const counterEmail = `counter-${Date.now()}@test.local`;
  await api('POST', '/users', { name: 'Counter Check', email: counterEmail, password: 'Counter-Pass-123!', role: 'booking_counter', phone: '', departments: [], isActive: true });
  const counter = await login(counterEmail, 'Counter-Pass-123!');
  const cBooking = await counter('POST', '/bookings', { sevaType: abhishek._id, date: tomorrow, batch: other._id, devotee: { name: 'Counter devotee', phone: '9822000077' }, paymentMode: 'cash' });
  const cShift = await counter('POST', '/booking-shifts/close', { countedCash: 810 });
  const cList = (await counter('GET', '/booking-shifts')).body.data;
  check(cBooking.status === 201 && cShift.status === 201 && cList?.total === 1 && cList.items[0]._id === cShift.body.data._id, 'counter staff close their own shift and see only their own handovers');
  check((await counter('PATCH', `/booking-shifts/${cShift.body.data._id}/verify`, {})).status === 403, 'counter staff cannot verify a handover');
  check((await counter('GET', `/booking-shifts/${sh._id}`)).status === 404, 'counter staff cannot open someone else\'s handover');
  check((await counter('PATCH', `/bookings/${late.body.data._id}`, { paymentMode: 'upi' })).status === 403, 'only whoever took a booking can change how it was paid');
  check((await api('PATCH', `/booking-shifts/${cShift.body.data._id}/verify`, {})).status === 200, 'a supervisor verifies the counter staff\'s handover');

  await api('PATCH', `/bookings/${t._id}/void`, { reason: 'Cancelled after handover' });
  const shifts = (await api('GET', '/booking-shifts')).body.data;
  const listed = shifts.items.find((x) => x._id === sh._id);
  check(shifts.total === 3 && listed?.voidedAfterClose?.count === 1 && listed.voidedAfterClose.amount === 810 && shifts.summary.short === -100,
    'handover list flags voids after closing and totals the shortfall', JSON.stringify({ total: shifts.total, late: listed?.voidedAfterClose, summary: shifts.summary }));

  // ── Hall check-in ───────────────────────────────────────────────────────────
  // Bhomyag (date fixed with the office, no batch) can be booked for today at any hour.
  const today = key(new Date());
  const bhom = setup.sevaTypes.find((s) => s.code === 'BHOM');
  const visit = await api('POST', '/bookings', { sevaType: bhom._id, date: today, devotee: { name: 'Hall Visitor', phone: '9822000055' }, paymentMode: 'upi', peopleCount: 3 });
  const vb = visit.body.data;
  const ci = await api('POST', '/bookings/check-in', { code: vb.receiptUrl });
  check(visit.status === 201 && ci.status === 200 && ci.body.data.result === 'ok' && ci.body.data.checkedIn && Boolean(ci.body.data.booking.checkedInBy?.name),
    'scanning the slip\'s QR checks the devotee in', JSON.stringify(ci.body).slice(0, 200));
  const rescan = await api('POST', '/bookings/check-in', { code: vb.receiptUrl });
  check(rescan.body.data.result === 'already' && !rescan.body.data.checkedIn, 'scanning the same slip again shows it was already used');
  check((await api('POST', '/bookings/check-in', { code: String(vb.seq) })).body.data.booking?.receiptNo === vb.receiptNo, 'the receipt number typed in finds the booking');
  check((await api('POST', '/bookings/check-in', { code: late.body.data.receiptNo })).body.data.result === 'early', 'a slip for another day is refused');
  check((await api('POST', '/bookings/check-in', { code: b1.receiptNo })).body.data.result === 'voided', 'a voided booking is refused');
  check((await api('POST', '/bookings/check-in', { code: postOk.body.data.receiptNo })).body.data.result === 'no-visit', 'Post Abhishek has nothing to check in');
  const foreign = await api('POST', '/bookings/check-in', { code: 'https://example.com/promo' });
  const unknown = await api('POST', '/bookings/check-in', { code: 'ABH/2099-00/99999' });
  check(foreign.status === 400 && unknown.status === 404, 'other QR codes and unknown receipts are explained');

  const undone = await api('DELETE', `/bookings/${vb._id}/check-in`);
  check(undone.status === 200 && !undone.body.data.checkedInAt, 'a check-in made by mistake can be undone');
  check((await api('POST', `/bookings/${vb._id}/check-in`, {})).body.data.result === 'ok', 'check in by hand from the booking');

  const arrivals = (await api('GET', '/bookings/check-in/summary')).body.data;
  check(arrivals.totals.arrived === 1 && arrivals.totals.arrivedPeople === 3 && arrivals.recent[0]?.receiptNo === vb.receiptNo && arrivals.halls.length >= 3,
    'arrivals summary: who has come, per batch and in total', JSON.stringify(arrivals.totals));
  const sheetToday = (await api('GET', `/bookings/reports/day-sheet?date=${today}`)).body.data;
  check(sheetToday.groups.some((g) => g.arrived === 1 && g.arrivedPeople === 3), 'the day sheet counts arrivals');
  const pubVisit = await (await fetch(`${BASE}/api/public/receipts/${vb.receiptUrl.split('/r/')[1]}`)).json();
  check(Boolean(pubVisit.data?.checkedInAt), 'the devotee\'s receipt page shows the check-in');

  const board = await api('GET', '/bookings/hall-board');
  const visitorTile = board.body.data?.groups?.flatMap((g) => g.bookings).find((x) => x.name === 'Hall Visitor');
  check(board.status === 200 && visitorTile?.arrived === true && visitorTile.people === 3 && !JSON.stringify(board.body).includes('9822000055'),
    'hall screen lists today\'s serials with who has arrived — names only, no phone numbers');

  // Fill rate / no-shows (only today and future here, so no no-show days yet)
  const att = (await api('GET', `/bookings/reports/attendance?to=${tomorrow}`)).body.data;
  check(att?.from === today && att.fill.totals.capacity > 0 && att.fill.totals.booked > 0 && att.fill.byBatch.length >= 14 && att.noShow.scannedDays === 0,
    'attendance report: fill rate from the first booking day, no no-shows before any past day', JSON.stringify(att?.fill?.totals));
  const arrivedList = (await api('GET', '/bookings?arrival=arrived')).body.data;
  const noShowList = (await api('GET', '/bookings?arrival=noshow')).body.data;
  check(arrivedList.items.some((x) => x.receiptNo === vb.receiptNo) && noShowList.total === 0, 'register filters arrived / no-show bookings');

  // Hall staff: scan only — no register, no counter
  const hallEmail = `hall-${Date.now()}@test.local`;
  await api('POST', '/users', { name: 'Hall Check', email: hallEmail, password: 'Hall-Pass-123!', role: 'hall_checkin', phone: '', departments: [], isActive: true });
  const hall = await login(hallEmail, 'Hall-Pass-123!');
  const hallScan = await hall('POST', '/bookings/check-in', { code: vb.receiptUrl });
  check(hallScan.status === 200 && hallScan.body.data.result === 'already' && (await hall('GET', '/bookings/check-in/summary')).status === 200
    && (await hall('GET', '/bookings/hall-board')).status === 200, 'hall staff can scan slips, see arrivals and run the hall screen');
  check((await hall('GET', '/bookings')).status === 403 && (await hall('POST', '/bookings', {})).status === 403, 'hall staff cannot open the register or book');

  // ── Halls: fixed code, names that can change, batches only in listed halls ──
  const halls = (await api('GET', '/booking-setup')).body.data.halls;
  const h1 = halls.find((h) => h.code === 'H1');
  check(['H1', 'H2', 'H3'].every((c) => halls.some((h) => h.code === c)), 'the halls list holds every hall the batches use', JSON.stringify(halls.map((h) => h.code)));
  const renamed = await api('PUT', `/booking-setup/halls/${h1._id}`, { name: 'Shri Mangal Sabhagruh', nameMr: 'श्री मंगल सभागृह' });
  check(renamed.status === 200 && renamed.body.data.code === 'H1', 'a hall can be renamed', JSON.stringify(renamed.body));
  check((await api('PUT', `/booking-setup/halls/${h1._id}`, { code: 'H9' })).status === 400, 'a hall code cannot be changed');
  const optNames = (await api('GET', '/bookings/options')).body.data.settings.hallNames;
  check(optNames?.H1?.name === 'Shri Mangal Sabhagruh' && optNames.H1.nameMr === 'श्री मंगल सभागृह', 'booking options carry the hall names for slips', JSON.stringify(optNames));
  const boardNames = (await hall('GET', '/bookings/hall-board')).body.data.hallNames;
  const summaryNames = (await hall('GET', '/bookings/check-in/summary')).body.data.hallNames;
  check(boardNames?.H1?.name === 'Shri Mangal Sabhagruh' && summaryNames?.H1?.name === 'Shri Mangal Sabhagruh', 'hall staff see the new name on the hall screen and the scanner');
  const pubHall = (await (await fetch(`${BASE}/api/public/receipts/${vb.receiptUrl.split('/r/')[1]}`)).json()).data;
  check(pubHall.hall === vb.hall && (vb.hall !== 'H1' || pubHall.hallName === 'Shri Mangal Sabhagruh'), 'an old booking’s receipt shows the hall’s new name, same code', JSON.stringify({ hall: pubHall.hall, name: pubHall.hallName }));

  const h4 = await api('POST', '/booking-setup/halls', { code: 'h4', name: 'Annex' });
  check(h4.status === 201 && h4.body.data.code === 'H4', 'a new hall can be added (code in capitals)', JSON.stringify(h4.body));
  check((await api('POST', '/booking-setup/halls', { code: 'H4' })).status === 409, 'the same hall code cannot be added twice');
  check((await api('POST', '/booking-setup/halls', { code: 'Main hall!' })).status === 400, 'a hall code must be short capitals / digits');
  const slot = { start: '16:00', end: '17:00', capacity: 10 };
  check((await api('POST', '/booking-setup/batches', { ...slot, hall: 'ZZ' })).status === 400, 'a batch cannot use a hall that is not in the list');
  const b4 = await api('POST', '/booking-setup/batches', { ...slot, hall: 'H4' });
  check(b4.status === 201, 'a batch can be put in the new hall', JSON.stringify(b4.body));
  check((await api('PUT', `/booking-setup/halls/${h4.body.data._id}`, { isActive: false })).status === 400, 'a hall with active batches cannot be switched off');
  check((await api('DELETE', `/booking-setup/halls/${h1._id}`)).status === 400, 'a hall in use cannot be deleted');
  await api('DELETE', `/booking-setup/batches/${b4.body.data._id}`);
  check((await api('PUT', `/booking-setup/halls/${h4.body.data._id}`, { isActive: false })).status === 200
    && (await api('POST', '/booking-setup/batches', { ...slot, hall: 'H4' })).status === 400, 'a switched-off hall cannot get new batches');
  check((await api('DELETE', `/booking-setup/halls/${h4.body.data._id}`)).status === 200, 'an unused hall can be deleted');
  await api('PUT', `/booking-setup/halls/${h1._id}`, { name: '', nameMr: '' });

  await api('PUT', `/booking-setup/batches/${batch._id}`, { capacity: 50 });
  console.log(failed ? `\n${failed} booking check(s) failed` : '\nBooking checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
