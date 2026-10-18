// End-to-end checks of the business rules in the older modules, against a running, seeded API:
//   • Stock: FIFO order (earliest expiry first, then oldest), refusals, transfers, wastage,
//     voids that put stock back (and refuse when the stock has been used), parallel stock-outs,
//     purchase entries
//   • Supplier payments: amounts must match the invoices, no overpaying, the approval flow
//     (separate approver, approval permission, no self-approval), reject → resubmit, void
//   • Donations: numbering, 80G rules, receipts, in-kind items going into stock, voiding
// Creates its own products, supplier and users, so it runs on a freshly seeded test database.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/rules-check.mjs
// Used by CI (.github/workflows/ci.yml).

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${!ok && extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};
const section = (title) => console.log(`\n── ${title}`);
const show = (r) => `${r.status} ${r.body?.message || ''}`.trim();

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

const stamp = Date.now().toString(36);

async function main() {
  const api = await login(EMAIL, PASSWORD);

  // ── Setup ───────────────────────────────────────────────────────────────────
  const depts = (await api('GET', '/departments')).body.data;
  const store = depts.find((d) => d.code === 'MS');
  const counter = depts.find((d) => d.code === 'DC');
  const category = (await api('GET', '/categories')).body.data[0];
  const unit = (await api('GET', '/units')).body.data[0];
  const newProduct = async (name) => (await api('POST', '/products', { name: `${name} ${stamp}`, category: category._id, unit: unit._id })).body.data;
  const ghee = await newProduct('Rules Ghee');
  const sugar = await newProduct('Rules Sugar');
  check(store && counter && ghee?._id && sugar?._id, 'setup: departments from the seed, two new products');

  const balance = async (product, dept) => (await api('GET', `/balances/${product._id}/${dept._id}`)).body.data.quantity;
  const batches = async (product, dept) => (await api('GET', `/batches?product=${product._id}&department=${dept._id}`)).body.data;
  const move = (body) => api('POST', '/transactions', { product: ghee._id, ...body });
  const voidTxn = (id, voidReason = 'Rules check') => api('PATCH', `/transactions/${id}/void`, { voidReason });

  // ── Stock: FIFO ─────────────────────────────────────────────────────────────
  section('Stock (FIFO)');
  const inA = (await move({ transactionType: 'STOCK_IN', stockInType: 'PURCHASE', toDepartment: store._id, quantity: 10, rate: 100 })).body.data;
  const inB = (await move({ transactionType: 'STOCK_IN', stockInType: 'PURCHASE', toDepartment: store._id, quantity: 5, rate: 110, expiryDate: '2026-12-31' })).body.data;
  const inC = (await move({ transactionType: 'STOCK_IN', stockInType: 'PURCHASE', toDepartment: store._id, quantity: 5, rate: 120, expiryDate: '2027-06-30' })).body.data;
  check(await balance(ghee, store) === 20, 'three stock-ins → balance 20');

  const out7 = await move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 7, stockOutPurpose: 'CONSUMPTION' });
  const left = Object.fromEntries((await batches(ghee, store)).map((b) => [b.expiryDate ? b.expiryDate.slice(0, 7) : 'none', b.remainingQty]));
  check(out7.status === 201 && left['2026-12'] === undefined && left['2027-06'] === 3 && left.none === 10,
    'stock-out of 7 uses the earliest expiry first (5 from Dec 2026, 2 from Jun 2027), undated stock last', JSON.stringify(left));
  check(await balance(ghee, store) === 13, 'balance 13 after the stock-out');

  const tooMuch = await move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 14, stockOutPurpose: 'CONSUMPTION' });
  check(tooMuch.status === 400 && /Available: 13/.test(tooMuch.body.message), 'stock-out above what is there is refused, showing what is available', show(tooMuch));
  const badPurpose = await move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 2, stockOutPurpose: 'FOOD' });
  const batchTotal = async (product, dept) => (await batches(product, dept)).reduce((s, b) => s + b.remainingQty, 0);
  check(badPurpose.status === 400 && await balance(ghee, store) === 13 && await batchTotal(ghee, store) === 13,
    'a refused stock-out (unknown purpose) leaves the stock untouched', `${show(badPurpose)}; balance ${await balance(ghee, store)}, batches ${await batchTotal(ghee, store)}`);
  const negative = await move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: -3, stockOutPurpose: 'CONSUMPTION' });
  check(negative.status === 400 && await balance(ghee, store) === 13, 'a negative quantity is refused', show(negative));

  const transfer = (await move({ transactionType: 'TRANSFER', fromDepartment: store._id, toDepartment: counter._id, quantity: 3 })).body.data;
  const counterBatches = await batches(ghee, counter);
  check(await balance(ghee, store) === 10 && await balance(ghee, counter) === 3 && counterBatches.length === 1 && counterBatches[0].expiryDate?.startsWith('2027-06'),
    'transfer of 3 moves the oldest-expiry stock and keeps its expiry date at the counter');
  const wastage = (await move({ transactionType: 'WASTAGE', fromDepartment: counter._id, quantity: 1, wastageReason: 'SPILLAGE' })).body.data;
  check(await balance(ghee, counter) === 2, 'wastage of 1 at the counter → 2 left');

  const voidUsedTransfer = await voidTxn(transfer._id);
  check(voidUsedTransfer.status === 400 && await balance(ghee, store) === 10 && await balance(ghee, counter) === 2,
    'a transfer whose stock has been used at the counter cannot be voided (stock would be counted twice)',
    `${show(voidUsedTransfer)}; store ${await balance(ghee, store)}, counter ${await balance(ghee, counter)}`);
  check((await voidTxn(wastage._id)).status === 200 && await balance(ghee, counter) === 3, 'voiding the wastage puts 1 back at the counter');
  check((await voidTxn(transfer._id)).status === 200 && await balance(ghee, store) === 13 && await balance(ghee, counter) === 0,
    'then the transfer can be voided: 3 back in the store, none at the counter');
  check((await voidTxn(out7.body.data._id)).status === 200 && await balance(ghee, store) === 20, 'voiding the stock-out of 7 restores the batches → 20');
  const again = await voidTxn(out7.body.data._id);
  check(again.status === 400, 'voiding twice is refused', show(again));
  check((await api('PATCH', `/transactions/${inA._id}/void`, { voidReason: ' ' })).status === 400, 'a void needs a reason');

  await move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 1, stockOutPurpose: 'OFFERING' });   // from the Dec 2026 batch
  const voidUsedIn = await voidTxn(inB._id);
  check(voidUsedIn.status === 400 && /consumed/.test(voidUsedIn.body.message), 'a stock-in whose stock has been used cannot be voided', show(voidUsedIn));
  check((await voidTxn(inA._id)).status === 200 && await balance(ghee, store) === 9, 'an unused stock-in can be voided → 9 left');

  // Six counters take 2 each at the same moment; only 4 can be served from 9
  const parallel = await Promise.all(Array.from({ length: 6 }, () =>
    move({ transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 2, stockOutPurpose: 'CONSUMPTION' })));
  const served = parallel.filter((r) => r.status === 201).length;
  const after = await balance(ghee, store);
  const batchSum = await batchTotal(ghee, store);
  check(served === 4 && after === 1 && batchSum === 1, 'parallel stock-outs never give out more than there is (4 of 6 served, 1 left)',
    `${served} served, balance ${after}, batches ${batchSum}, statuses ${parallel.map((r) => r.status).join(',')}`);
  void inC;

  // ── Purchase entries ────────────────────────────────────────────────────────
  section('Purchase entries');
  const supplier = (await api('POST', '/suppliers', { name: `Rules Supplier ${stamp}`, type: 'vendor', creditDays: 30, phone: '9800000001' })).body.data;
  const purchase = await api('POST', '/purchase-entries', {
    supplier: supplier._id, toDepartment: store._id, invoiceNumber: `INV-${stamp}`, invoiceDate: '2026-10-01',
    items: [{ product: ghee._id, quantity: 4, rate: 50 }, { product: sugar._id, quantity: 6, rate: 20 }],
  });
  const entry = purchase.body.data;
  check(purchase.status === 201 && entry.totalValue === 320 && await balance(ghee, store) === 5 && await balance(sugar, store) === 6,
    'purchase entry of 2 items: total ₹320, both go into stock', show(purchase));
  check(entry.dueDate?.startsWith('2026-10-31'), 'due date = invoice date + supplier credit days (30)', entry.dueDate);

  await api('POST', '/transactions', { product: sugar._id, transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: 1, stockOutPurpose: 'CONSUMPTION' });
  const voidUsedPurchase = await api('PATCH', `/purchase-entries/${entry._id}/void`, { voidReason: 'Rules check' });
  const gheeTxn = (await api('GET', `/transactions/${entry.items[0].stockTransactionId}`)).body.data;
  check(voidUsedPurchase.status === 400 && !gheeTxn.isVoided && await balance(ghee, store) === 5,
    'a purchase with a used item cannot be voided, and nothing in it is voided half-way', `${show(voidUsedPurchase)}; ghee stock-in voided: ${gheeTxn.isVoided}`);

  // ── Supplier payments ───────────────────────────────────────────────────────
  section('Supplier payments');
  const mkUser = async (role, canApprovePayments) => {
    const email = `rules-${role}-${canApprovePayments ? 'ok' : 'no'}-${stamp}@test.local`;
    await api('POST', '/users', { name: `Rules ${role}`, email, password: 'Rules-Pass-123!', role, departments: [], canApprovePayments });
    return login(email, 'Rules-Pass-123!');
  };
  const approver = await mkUser('admin', true);
  const noFlag = await mkUser('admin', false);
  const viewer = await mkUser('viewer', false);

  const invoiceLine = (paidAmount) => ({ purchaseEntryId: entry._id, invoiceNumber: entry.invoiceNumber, invoiceTotal: entry.totalValue, paidAmount });
  const pay = (body, who = api) => who('POST', '/supplier-payments', { supplier: supplier._id, paymentMode: 'upi', paymentDate: '2026-10-05', ...body });
  const invoiceState = async () => (await api('GET', `/supplier-payments/invoices/${supplier._id}`)).body.data.find((i) => i._id === entry._id);

  check((await pay({ totalAmount: 100, invoices: [invoiceLine(100)] }, viewer)).status === 403, 'a viewer cannot record payments');
  const mismatch = await pay({ totalAmount: 100, invoices: [invoiceLine(150)] });
  check(mismatch.status === 400 && /must equal/.test(mismatch.body.message), 'invoice split must add up to the amount paid', show(mismatch));
  const overpay = await pay({ totalAmount: 400, invoices: [invoiceLine(400)] });
  check(overpay.status === 400, 'paying ₹400 against a ₹320 invoice is refused', show(overpay));
  const zero = await pay({ totalAmount: 0, invoices: [] });
  check(zero.status === 400, 'a payment of ₹0 is refused', show(zero));

  const p1 = await pay({ totalAmount: 200, invoices: [invoiceLine(200)] });
  check(p1.status === 201 && p1.body.data.status === 'pending_approval' && /^PAY-\d{8}-\d{3}$/.test(p1.body.data.paymentNumber),
    'payment of ₹200 recorded as "pending approval" with a PAY- number', show(p1));
  check((await invoiceState()).paidSoFar === 0, 'a pending payment does not count as paid yet');
  const dup = await pay({ totalAmount: 120, invoices: [invoiceLine(120)] });
  check(dup.status === 409 && dup.body.data?.duplicates?.length === 1, 'a second payment for the same invoice is flagged as a possible duplicate', show(dup));
  const overWithPending = await pay({ totalAmount: 150, invoices: [invoiceLine(150)], force: true });
  check(overWithPending.status === 400, 'even when confirmed, ₹200 pending + ₹150 would overpay the ₹320 invoice → refused', show(overWithPending));
  const p2 = await pay({ totalAmount: 120, invoices: [invoiceLine(120)], force: true });
  check(p2.status === 201, 'confirmed second payment of ₹120 (₹200 + ₹120 = ₹320) is accepted', show(p2));

  const pid1 = p1.body.data._id;
  const pid2 = p2.body.data._id;
  const self = await api('PATCH', `/supplier-payments/${pid1}/approve`, {});
  check(self.status === 403, 'nobody can approve a payment they recorded themselves', show(self));
  const flagless = await noFlag('PATCH', `/supplier-payments/${pid1}/approve`, {});
  check(flagless.status === 403, 'approving needs the user\'s "can approve payments" switch, not just the permission', show(flagless));
  const viewerApprove = await viewer('PATCH', `/supplier-payments/${pid1}/approve`, {});
  check(viewerApprove.status === 403, 'a viewer cannot approve', show(viewerApprove));
  check((await approver('PATCH', `/supplier-payments/${pid1}/approve`, { approvalNote: 'ok' })).status === 200, 'another approver approves ₹200');
  const twice = await approver('PATCH', `/supplier-payments/${pid1}/approve`, {});
  check(twice.status === 400, 'approving twice is refused', show(twice));
  let inv = await invoiceState();
  check(inv.paidSoFar === 200 && inv.paymentStatus === 'partially_paid' && inv.remaining === 120, 'invoice now partly paid: ₹200 paid, ₹120 left', JSON.stringify(inv));

  const editPaid = await api('PATCH', `/purchase-entries/${entry._id}`, { notes: 'edit after payment' });
  check(editPaid.status === 400, 'a purchase with an approved payment cannot be edited', show(editPaid));

  check((await approver('PATCH', `/supplier-payments/${pid2}/reject`, { rejectionReason: ' ' })).status === 400, 'rejecting needs a reason');
  check((await approver('PATCH', `/supplier-payments/${pid2}/reject`, { rejectionReason: 'Wrong UTR' })).status === 200, 'approver rejects ₹120 with a reason');
  const otherResubmit = await approver('PATCH', `/supplier-payments/${pid2}/resubmit`, {});
  check(otherResubmit.status === 403, 'only the person who recorded it can resubmit', show(otherResubmit));
  const badResubmit = await api('PATCH', `/supplier-payments/${pid2}/resubmit`, { totalAmount: 50 });
  check(badResubmit.status === 400, 'resubmitting with an amount that no longer matches the invoice split is refused', show(badResubmit));
  check((await api('PATCH', `/supplier-payments/${pid2}/resubmit`, { referenceNumber: 'UTR123' })).status === 200, 'resubmitted with the corrected reference');
  check((await approver('PATCH', `/supplier-payments/${pid2}/approve`, {})).status === 200, 'and approved');
  inv = await invoiceState();
  check(inv.paidSoFar === 320 && inv.paymentStatus === 'paid' && inv.remaining === 0, 'invoice fully paid', JSON.stringify(inv));

  const voidPending = await approver('PATCH', `/supplier-payments/${pid1}/void`, {});
  check(voidPending.status === 400, 'voiding a payment needs a reason', show(voidPending));
  check((await approver('PATCH', `/supplier-payments/${pid1}/void`, { voidReason: 'Bank reversed' })).status === 200, 'approved ₹200 payment voided');
  inv = await invoiceState();
  check(inv.paidSoFar === 120 && inv.paymentStatus === 'partially_paid', 'after the void the invoice shows ₹120 paid again', JSON.stringify(inv));

  // A pending payment must not be approved once its purchase has been voided
  const small = (await api('POST', '/purchase-entries', {
    supplier: supplier._id, toDepartment: store._id, invoiceNumber: `INV2-${stamp}`, invoiceDate: '2026-10-02',
    items: [{ product: ghee._id, quantity: 1, rate: 100 }],
  })).body.data;
  const p3 = await pay({ totalAmount: 100, invoices: [{ purchaseEntryId: small._id, invoiceNumber: small.invoiceNumber, invoiceTotal: 100, paidAmount: 100 }] });
  check((await api('PATCH', `/purchase-entries/${small._id}/void`, { voidReason: 'Entered by mistake' })).status === 200, 'an unpaid purchase can be voided (its stock comes back out)');
  const approveVoided = await approver('PATCH', `/supplier-payments/${p3.body.data._id}/approve`, {});
  check(approveVoided.status === 400, 'a payment for a voided purchase cannot be approved', show(approveVoided));
  const bulk = await approver('POST', '/supplier-payments/bulk-approve', { ids: [p3.body.data._id] });
  check(bulk.status === 400, '…not through bulk approve either', show(bulk));

  // ── Donations ───────────────────────────────────────────────────────────────
  section('Donations & 80G');
  const occasion = (await api('GET', '/donation-occasions')).body.data[0];
  const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; })();
  const statsBefore = (await api('GET', '/donations/stats')).body.data;
  const donate = (body) => api('POST', '/donations', { occasion: occasion._id, paymentMode: 'cash', ...body });

  const named = await donate({ donationType: 'named', donorName: 'Rules Devotee', donorPhone: '9800000002', panNumber: 'ABCDE1234F', is80G: true, cashAmount: 1501 });
  check(named.status === 201 && named.body.data.is80G === true && new RegExp(`^DON-${today}-\\d{3}$`).test(named.body.data.donationNumber),
    'named donation with PAN → 80G, numbered DON-<today>-NNN', show(named));
  const noPan = await donate({ donationType: 'named', donorName: 'No PAN', cashAmount: 500, is80G: true });
  check(noPan.status === 201 && noPan.body.data.is80G === false, '80G is only given when a PAN is entered');
  const hundi = await donate({ donationType: 'hundi', cashAmount: 2200, is80G: true, panNumber: 'ABCDE1234F' });
  check(hundi.status === 201 && hundi.body.data.is80G === false, 'hundi collections are never 80G');
  const badPan = await donate({ donationType: 'named', donorName: 'Bad PAN', cashAmount: 500, is80G: true, panNumber: 'ABC123' });
  check(badPan.status === 400, 'a PAN in the wrong format is refused', show(badPan));
  const empty = await donate({ donationType: 'named', donorName: 'Nothing' });
  check(empty.status === 400, 'a donation needs cash or in-kind items', show(empty));

  const receipt = await api('GET', `/donations/${named.body.data._id}/receipt`);
  check(receipt.status === 200 && receipt.type.includes('pdf'), 'donation receipt PDF');
  const r80 = await api('GET', `/donations/${named.body.data._id}/80g-receipt`);
  check(r80.status === 200 && r80.type.includes('pdf'), '80G receipt PDF for an 80G donation');
  check((await api('GET', `/donations/${noPan.body.data._id}/80g-receipt`)).status === 400, 'no 80G receipt for a donation without 80G');

  const statsMid = (await api('GET', '/donations/stats')).body.data;
  check(statsMid.totalCash - statsBefore.totalCash === 1501 + 500 + 2200, 'today\'s cash total includes the new donations', `${statsBefore.totalCash} → ${statsMid.totalCash}`);
  check((await api('PATCH', `/donations/${noPan.body.data._id}/void`, { voidReason: 'Duplicate' })).status === 200, 'a donation can be voided');
  const statsAfter = (await api('GET', '/donations/stats')).body.data;
  check(statsMid.totalCash - statsAfter.totalCash === 500, 'a voided donation drops out of the totals');
  check((await api('GET', `/donations/${noPan.body.data._id}/receipt`)).status === 400, 'no receipt for a voided donation');
  check((await api('PATCH', `/donations/${noPan.body.data._id}/void`, { voidReason: 'again' })).status === 400, 'voiding twice is refused');

  const sugarBefore = await balance(sugar, store);
  const kind = await donate({ donationType: 'named', donorName: 'Kind Donor', kindItems: [{ product: sugar._id, quantity: 3, estimatedValue: 150 }] });
  check(kind.status === 201 && await balance(sugar, store) === sugarBefore + 3 && kind.body.data.totalEstimatedValue === 150,
    'in-kind donation of 3 goes into Main Store stock, valued ₹150', show(kind));
  check((await api('PATCH', `/donations/${kind.body.data._id}/void`, { voidReason: 'Not received' })).status === 200 && await balance(sugar, store) === sugarBefore,
    'voiding an in-kind donation takes its items back out of stock', `stock ${await balance(sugar, store)} (was ${sugarBefore})`);
  const kind2 = (await donate({ donationType: 'named', donorName: 'Kind Donor 2', kindItems: [{ product: sugar._id, quantity: 2 }] })).body.data;
  await api('POST', '/transactions', { product: sugar._id, transactionType: 'STOCK_OUT', fromDepartment: store._id, quantity: sugarBefore + 2, stockOutPurpose: 'CONSUMPTION' });
  const voidUsedKind = await api('PATCH', `/donations/${kind2._id}/void`, { voidReason: 'test' });
  check(voidUsedKind.status === 400, 'an in-kind donation whose items have been used cannot be voided', show(voidUsedKind));
  const ghostProduct = await donate({ donationType: 'named', donorName: 'Ghost', kindItems: [{ product: '65f0c0ffee0000000000abcd', quantity: 1 }] });
  check(ghostProduct.status === 404 || ghostProduct.status === 400, 'an in-kind item with an unknown product is refused', show(ghostProduct));

  // Monthly P&L: a cash donation counts once, in-kind items at their value, voided ones not at all
  const now = new Date();
  const pnlIncome = async () => (await api('GET', `/pnl?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)).body.data.income;
  const pnlBefore = await pnlIncome();
  const cash5k = (await donate({ donationType: 'named', donorName: 'P&L Cash', cashAmount: 5000 })).body.data;
  await donate({ donationType: 'named', donorName: 'P&L Kind', kindItems: [{ product: sugar._id, quantity: 1, estimatedValue: 300 }] });
  const pnlAfter = await pnlIncome();
  check(pnlAfter.cash - pnlBefore.cash === 5000 && pnlAfter.kind - pnlBefore.kind === 300 && pnlAfter.total - pnlBefore.total === 5300,
    'P&L: a ₹5,000 cash donation adds ₹5,000 (not ₹10,000); in-kind adds its value', JSON.stringify({ before: pnlBefore, after: pnlAfter }));
  await api('PATCH', `/donations/${cash5k._id}/void`, { voidReason: 'P&L check' });
  check(pnlAfter.total - (await pnlIncome()).total === 5000, 'P&L: a voided donation no longer counts');

  await mahaprasadChecks(api, today);

  console.log(failed ? `\n${failed} rule check(s) failed` : '\nRule checks OK');
  process.exit(failed ? 1 : 0);
}

// ── Mahaprasad money: offline sales survive a refill, only sold coupons are served or counted,
// cancelling is controlled and happens once, the daily limit holds under parallel issues.
async function mahaprasadChecks(api, today) {
  section('Mahaprasad coupons & money');
  const settingsBefore = (await api('GET', '/settings')).body.data;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  await api('PUT', '/settings', { mahaprasadDayPricing: Object.fromEntries(days.map((d) => [d, 40])), mahaprasadDailyCap: 0 });

  const asRole = async (role) => {
    const email = `mp-${role}-${stamp}-${Math.random().toString(36).slice(2, 6)}@test.local`;
    await api('POST', '/users', { name: `MP ${role}`, email, password: 'Rules-Pass-123!', role, departments: [] });
    return login(email, 'Rules-Pass-123!');
  };
  const counter = await asRole('mahaprasad_counter');
  const counter2 = await asRole('mahaprasad_counter');
  const redeemer = await asRole('mahaprasad_redeem');
  const admin = await asRole('admin');

  const summary = async () => (await api('GET', '/mahaprasad/summary')).body.data;
  const drawer = async () => (await api('GET', '/mahaprasad/cash-drawer')).body.data;
  const issue = (who, body) => who('POST', '/mahaprasad/issue', { quantity: 1, type: 'paid', mobile: '9822012345', ...body });
  const reserve = async (who, qty) => ((await who('POST', '/mahaprasad/offline/reserve', { qty })).body.data?.coupons || []).map((c) => c.couponNumber);
  const statusOf = async (n) => (await api('GET', `/mahaprasad/coupons?search=${n}`)).body.data?.coupons?.[0];
  const codeOf = (r) => r.body?.errors?.[0]?.code;

  // Offline: a refill keeps numbers sold but not yet synced; the sale syncs at the server's price
  const start = await summary();
  const cashStart = (await drawer()).cashTotal;
  const poolA = await reserve(counter, 3);
  const poolB = await reserve(counter, 3);
  check(poolA.length === 3 && poolB.length === 3 && !poolB.some((n) => poolA.includes(n)), 'offline refill hands out new numbers');
  check((await summary()).total === start.total, 'held offline numbers are not counted as sales');
  const offlineSale = { couponNumber: poolA[0], type: 'paid', amount: 999, paymentMode: 'cash', batchId: `t${stamp}`, issuedAt: new Date().toISOString(), mobile: '9822012345' };
  const synced = await counter('POST', '/mahaprasad/offline/sync', { issued: [offlineSale], redeemed: [] });
  const sold = await statusOf(poolA[0]);
  check(synced.body.data?.results?.issued?.ok === 1 && sold?.status === 'issued' && sold.amount === 40,
    'a coupon sold offline before the refill still syncs, at the day\'s price (not the phone\'s ₹999)', JSON.stringify(sold));
  check((await drawer()).cashTotal - cashStart === 40, 'the offline sale has a payment record (cash ₹40)');
  const again = await counter('POST', '/mahaprasad/offline/sync', { issued: [offlineSale], redeemed: [] });
  check(again.body.data?.results?.issued?.ok === 1 && (await drawer()).cashTotal - cashStart === 40, 'syncing the same sale twice records it once');

  // Never-sold numbers can't be served or printed
  const unsold = await redeemer('PATCH', `/mahaprasad/redeem/${poolA[1]}`);
  check(unsold.status === 409 && codeOf(unsold) === 'not_sold', 'a held, never-sold number cannot be redeemed', show(unsold));
  check((await counter('GET', `/mahaprasad/print?numbers=${poolA[1]}`)).status === 404, 'a never-sold number cannot be printed');
  const syncUnsold = await api('POST', '/mahaprasad/offline/sync', { issued: [], redeemed: [{ couponNumber: poolA[2], redeemedAt: new Date().toISOString() }] });
  check(syncUnsold.body.data?.results?.redeemed?.conflicts?.[0]?.reason === 'not_sold', 'an offline redemption of a never-sold number is refused on sync');

  // Two counters scanning the same coupon: only one serves it
  const one = (await issue(counter, {})).body.data.coupons[0].couponNumber;
  const scans = await Promise.all([redeemer('PATCH', `/mahaprasad/redeem/${one}`), api('PATCH', `/mahaprasad/redeem/${one}`)]);
  check(scans.map((r) => r.status).sort().join() === '200,409', 'the same coupon scanned at two counters at once is served once', scans.map(show).join(' | '));

  // The food counter on its own: it downloads its offline copy (without mobile numbers) and sends
  // its offline redemptions; it can't send offline sales, and the issue counter can't take the copy
  const fresh = (await issue(counter, {})).body.data.coupons[0].couponNumber;
  const copy = await redeemer('GET', '/mahaprasad/offline/redeem-copy');
  const inCopy = copy.body.data?.coupons?.find((c) => c.couponNumber === fresh);
  check(copy.status === 200 && inCopy?.status === 'issued' && !('mobile' in inCopy) && typeof copy.body.data.validityDays === 'number',
    'the food counter downloads its offline copy (no mobile numbers)', show(copy));
  check((await counter('GET', '/mahaprasad/offline/redeem-copy')).status === 403, 'the issue counter has no use for the food counter\'s copy');
  const servedAt = new Date().toISOString();
  const sent = await redeemer('POST', '/mahaprasad/offline/sync', { issued: [], redeemed: [{ couponNumber: fresh, redeemedAt: servedAt }] });
  check(sent.status === 200 && sent.body.data.results.redeemed.ok === 1 && (await statusOf(fresh))?.status === 'redeemed',
    'the food counter sends its offline redemptions itself', show(sent));
  const resent = await redeemer('POST', '/mahaprasad/offline/sync', { issued: [], redeemed: [{ couponNumber: fresh, redeemedAt: servedAt }] });
  check(resent.body.data?.results?.redeemed?.ok === 1 && !resent.body.data.results.redeemed.conflicts.length, '…sending the same one again is not a conflict');
  const sneaky = await redeemer('POST', '/mahaprasad/offline/sync', { issued: [{ couponNumber: poolB[0], type: 'free' }], redeemed: [] });
  check(sneaky.status === 403, 'the food counter cannot send offline sales', show(sneaky));

  // The devotee's QR link: one per sale, no sign-in, no mobile number or amount; shows served /
  // cancelled as soon as it happens
  const linked = (await issue(counter, { quantity: 2, paymentMode: 'upi' })).body.data;
  const linkToken = linked.shareUrl?.match(/\/m\/([A-Za-z0-9_-]+)$/)?.[1];
  const page = async (tok) => {
    const r = await fetch(`${BASE}/api/public/mahaprasad/${tok}`);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const pg = await page(linkToken);
  check(Boolean(linkToken) && pg.status === 200 && pg.body.data.coupons.length === 2
    && pg.body.data.coupons.every((c) => c.status === 'issued' && !('mobile' in c) && !('amount' in c) && !('_id' in c)),
    'issuing gives a QR page link: both coupons, without sign-in, mobile number or amount', show(pg));
  check((await api('GET', '/mahaprasad/batches')).body.data.some((b) => b._id === linked.batchId && b.shareUrl === linked.shareUrl),
    'the batch list carries the same link (for "Send on WhatsApp")');
  await redeemer('PATCH', `/mahaprasad/redeem/${linked.coupons[0].couponNumber}`);
  check((await page(linkToken)).body.data.coupons.find((c) => c.couponNumber === linked.coupons[0].couponNumber)?.status === 'redeemed',
    'the page shows a coupon as served once it is scanned');
  check((await page('NoSuchToken123')).status === 404 && (await page('bad')).status === 404, 'an unknown or malformed link → not found');
  // The same QRs as a picture, for the top of the WhatsApp message
  const pic = await fetch(`${BASE}/api/public/mahaprasad/${linkToken}/qr.png`);
  const picBytes = Buffer.from(await pic.arrayBuffer());
  check(pic.status === 200 && pic.headers.get('content-type') === 'image/png' && picBytes.subarray(1, 4).toString() === 'PNG' && picBytes.length > 5000,
    'the QR picture for WhatsApp is a PNG, without sign-in', `${pic.status} ${pic.headers.get('content-type')} ${picBytes.length} bytes`);
  check((await fetch(`${BASE}/api/public/mahaprasad/NoSuchToken123/qr.png`)).status === 404, '…and an unknown link has no picture');

  // Groups count as persons in reports
  const day = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`;
  const reportTotal = async () => (await api('GET', `/mahaprasad/report?from=${day}&to=${day}`)).body.data.totals.total;
  const reportBefore = await reportTotal();
  check((await issue(counter, { quantity: 3, isGroup: true, paymentMode: 'upi' })).status === 201, 'group coupon for 3 issued');
  check(await reportTotal() - reportBefore === 3, 'a group of 3 counts as 3 persons in the report');

  // Cancelling: needs a reason, only one's own sale from today (or mahaprasad:void), happens once
  const before = await drawer();
  const sale = await issue(counter, { quantity: 2, paymentMode: 'cash', amountReceived: 100, receivedNotes: [100] });
  const batchId = sale.body.data?.batchId;
  check(sale.status === 201 && (await drawer()).cashTotal - before.cashTotal === 80, 'cash sale of 2 × ₹40 with a ₹100 note', show(sale));
  check((await counter('PATCH', `/mahaprasad/batches/${batchId}/void`, {})).status === 400, 'cancelling needs a reason');
  check((await redeemer('PATCH', `/mahaprasad/batches/${batchId}/void`, { reason: 'test' })).status === 403, 'the food counter cannot cancel sales');
  const notMine = await counter2('PATCH', `/mahaprasad/batches/${batchId}/void`, { reason: 'test' });
  check(notMine.status === 403, 'counter staff cannot cancel another person\'s sale', show(notMine));
  const taps = await Promise.all([1, 2].map(() => counter('PATCH', `/mahaprasad/batches/${batchId}/void`, { reason: 'Wrong quantity' })));
  check(taps.map((r) => r.status).sort().join() === '200,409', 'a double tap on cancel cancels once', taps.map(show).join(' | '));
  const after = await drawer();
  check(after.cashTotal === before.cashTotal && after.counts['100'] === before.counts['100'] && JSON.stringify(after.counts) === JSON.stringify(before.counts),
    'the drawer is back to where it was — the note is taken out once, the change put back once', JSON.stringify({ before: before.counts, after: after.counts }));
  const voidedNo = sale.body.data.coupons[0].couponNumber;
  const voidedScan = await redeemer('PATCH', `/mahaprasad/redeem/${voidedNo}`);
  check(voidedScan.status === 409 && codeOf(voidedScan) === 'voided', 'a cancelled coupon cannot be redeemed', show(voidedScan));
  check((await counter('GET', `/mahaprasad/print?numbers=${voidedNo}`)).status === 404, 'a cancelled coupon cannot be printed');
  const theirs = (await issue(counter2, { type: 'free' })).body.data.batchId;
  check((await admin('PATCH', `/mahaprasad/batches/${theirs}/void`, { reason: 'Admin correction' })).status === 200, 'an admin (mahaprasad:void) can cancel anyone\'s sale');

  // Daily limit under four parallel issues with room for three
  const now = (await summary()).total;
  await api('PUT', '/settings', { mahaprasadDailyCap: now + 3 });
  const rush = await Promise.all([counter, counter2, counter, counter2].map((who) => issue(who, { type: 'free' })));
  check(rush.filter((r) => r.status === 201).length === 3 && (await summary()).total === now + 3,
    'four counters issuing at once with room for 3 → exactly 3 issued', rush.map(show).join(' | '));
  const freed = rush.find((r) => r.status === 201).body.data.batchId;
  await api('PATCH', `/mahaprasad/batches/${freed}/void`, { reason: 'Free a place' });
  check((await issue(counter, { type: 'free' })).status === 201, 'a cancelled coupon frees its place under the limit');
  await api('PUT', '/settings', { mahaprasadDailyCap: 0 });

  // Dashboard: prasad sold and served against the day's total = Settings → Mahaprasad daily cap
  const dash = async (who = counter) => (await who('GET', '/mahaprasad/dashboard')).body.data;
  const d0 = await dash();
  check(d0?.target === 0 && d0.limited === false && d0.left === null, 'no daily cap → the dashboard has no total', JSON.stringify(d0 && { t: d0.target, l: d0.limited }));
  const fam = (await issue(counter, { quantity: 4, isGroup: true, type: 'free' })).body.data.coupons[0].couponNumber;
  const d1 = await dash();
  check(d1.sold.persons - d0.sold.persons === 4 && d1.toServe - d0.toServe === 4,
    'a group of 4 sold: sold +4, still to serve +4');
  await redeemer('PATCH', `/mahaprasad/redeem/${fam}`);
  const d2 = await dash();
  check(d2.served - d1.served === 4 && d1.toServe - d2.toServe === 4 && d2.hours.some((h) => h.served >= 4) && d2.lastServedAt,
    'served at the hall: served +4, still to serve −4, shown by hour');
  check((await counter('PUT', '/mahaprasad/dashboard/target', { target: 5000 })).status === 403, 'counter staff cannot change the day\'s total');
  check((await admin('PUT', '/mahaprasad/dashboard/target', { target: -5 })).status === 400, 'a negative total is refused');
  const total = d2.sold.persons + 10;
  check((await admin('PUT', '/mahaprasad/dashboard/target', { target: total })).status === 200, 'an admin sets the day\'s total on the dashboard');
  const d3 = await dash();
  check(d3.target === total && d3.limited && d3.left === 10, '…the dashboard counts against it');
  check((await admin('GET', '/settings')).body.data.mahaprasadDailyCap === total, '…and Settings → Mahaprasad daily cap is the same number');
  await api('PUT', '/settings', { mahaprasadDailyCap: total + 5 });
  check((await dash()).target === total + 5, 'changing the daily cap in Settings changes the dashboard total');
  await admin('PUT', '/mahaprasad/dashboard/target', { target: 0 });
  check((await dash()).limited === false, 'a total of 0 = no limit, no total on the dashboard');

  await api('PUT', '/settings', { mahaprasadDayPricing: settingsBefore.mahaprasadDayPricing, mahaprasadDailyCap: settingsBefore.mahaprasadDailyCap || 0 });
}

main().catch((err) => { console.error(err); process.exit(1); });
