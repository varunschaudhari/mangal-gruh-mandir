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

  console.log(failed ? `\n${failed} rule check(s) failed` : '\nRule checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
