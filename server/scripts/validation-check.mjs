// End-to-end checks that the request validation (src/validation/*.schemas.js) accepts what the
// app's screens send — including the extra fields a form sends back on edit, blanks, numbers
// typed as text and lower-case PANs — and refuses bad input with a readable 400.
// Creates its own records, so it runs on a freshly seeded test database.
//
//   BASE_URL=http://localhost:5000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/validation-check.mjs
// Used by CI (.github/workflows/ci.yml).

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${!ok && extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};
const show = (r) => `${r.status} ${r.body?.message || ''}`.trim();

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
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}

const stamp = Date.now().toString(36).slice(-5).toUpperCase();

async function main() {
  const api = await login(EMAIL, PASSWORD);

  // ── Masters, as the forms send them ─────────────────────────────────────────
  const cat = await api('POST', '/categories', { name: `Val Cat ${stamp}`, code: `v${stamp}`.slice(0, 5), parentCategory: null, description: '', sortOrder: '3', isActive: true });
  check(cat.status === 201 && cat.body.data.code === `V${stamp}`.slice(0, 5) && cat.body.data.sortOrder === 3, 'category: code upper-cased, sort order typed as text accepted', show(cat));
  const catEdit = await api('PUT', `/categories/${cat.body.data._id}`, { ...cat.body.data, description: '', createdAt: 'x', __v: 0 });
  check(catEdit.status === 200, 'category edit with the whole record sent back (extra fields ignored)', show(catEdit));
  const badCat = await api('POST', '/categories', { name: '', code: '' });
  check(badCat.status === 400 && badCat.body.errors?.length === 2, 'category without name and code → 400 listing both', show(badCat));

  const dept = (await api('GET', '/departments')).body.data[0];
  const unit = (await api('GET', '/units')).body.data[0];
  const unitEdit = await api('PUT', `/units/${unit._id}`, { ...unit });
  check(unitEdit.status === 200, 'unit edit with the whole record', show(unitEdit));

  const prod = await api('POST', '/products', { name: `Val Rice ${stamp}`, category: cat.body.data._id, unit: unit._id, aliases: ['चावल', 'Chawal'], barcode: null, minStockLevel: '5', reorderPoint: '', standardRate: '42.5', isPerishable: false, isPujaItem: false, isActive: true, shelfLifeDays: '' });
  check(prod.status === 201 && prod.body.data.minStockLevel === 5 && prod.body.data.standardRate === 42.5 && !!prod.body.data.code, 'product: numbers typed as text, blank shelf life, code made by the server', show(prod));
  const p = prod.body.data;
  const prodEdit = await api('PUT', `/products/${p._id}`, { ...p, category: p.category._id, unit: p.unit._id, code: 'HACK', barcode: '8901234567890' });
  check(prodEdit.status === 200 && prodEdit.body.data.code === p.code && prodEdit.body.data.barcode === '8901234567890', 'product edit: barcode set, code cannot be changed', show(prodEdit));
  const clearBarcode = await api('PUT', `/products/${p._id}`, { barcode: null });
  check(clearBarcode.status === 200 && !clearBarcode.body.data.barcode, 'product edit: barcode cleared with null', show(clearBarcode));
  const badProd = await api('POST', '/products', { name: 'X', category: 'nope', unit: unit._id, standardRate: -1 });
  check(badProd.status === 400 && /Category is not valid/.test(badProd.body.message) && /Standard rate/.test(badProd.body.message), 'product with a bad category id and negative rate → 400', show(badProd));

  const sup = await api('POST', '/suppliers', {
    name: `Val Supplier ${stamp}`, type: 'both', phone: '9800000003', email: 'Shop@Example.COM', panNumber: 'abcde1234f',
    pincode: '425401', city: 'Amalner', creditDays: null, gstin: '27aabcs1234a1z5',
    bankAccounts: [{ label: 'Main', bankName: 'SBI', accountNumber: '1234567890', ifscCode: 'sbin0001234', isDefault: true }],
  });
  const s = sup.body.data;
  check(sup.status === 201 && s.panNumber === 'ABCDE1234F' && s.email === 'shop@example.com' && s.gstin === '27AABCS1234A1Z5' && s.bankAccounts[0].ifscCode === 'SBIN0001234',
    'supplier: PAN, GSTIN, IFSC in capitals, email in lower case, blank credit days accepted', show(sup));
  const supEdit = await api('PUT', `/suppliers/${s._id}`, { ...s, panNumber: '', notes: 'edited' });
  check(supEdit.status === 200 && supEdit.body.data.panNumber === '' && supEdit.body.data.bankAccounts.length === 1, 'supplier edit sent back whole: PAN cleared, bank account kept', show(supEdit));
  const badSup = await api('POST', '/suppliers', { name: 'Bad', panNumber: 'ABC', pincode: '12', email: 'not-an-email' });
  check(badSup.status === 400 && /PAN/.test(badSup.body.message) && /PIN/.test(badSup.body.message) && /Email/.test(badSup.body.message), 'supplier with bad PAN, PIN and email → 400 naming all three', show(badSup));

  const occ = await api('POST', '/donation-occasions', { name: `Val Occasion ${stamp}`, notes: '', sortOrder: 1, createdBy: '65f0c0ffee0000000000abcd' });
  check(occ.status === 201 && occ.body.data.createdBy !== '65f0c0ffee0000000000abcd', 'occasion: "createdBy" from the request is ignored', show(occ));
  const mocc = await api('POST', '/mahaprasad-occasions', { name: `Val MP Occasion ${stamp}` });
  check(mocc.status === 201, 'mahaprasad occasion created', show(mocc));

  const asset = await api('POST', '/assets', { name: `Val Speaker ${stamp}`, category: 'Electronics', totalQuantity: 2, finePerDay: null, isBorrowable: true, isActive: true, description: '' });
  check(asset.status === 201 && asset.body.data.totalQuantity === 2, 'asset created (blank fine accepted)', show(asset));
  const assetEdit = await api('PUT', `/assets/${asset.body.data._id}`, { ...asset.body.data, totalQuantity: 3, assetCode: 'HACK' });
  check(assetEdit.status === 200 && assetEdit.body.data.totalQuantity === 3 && assetEdit.body.data.assetCode !== 'HACK', 'asset edit: quantity raised, code cannot be changed', show(assetEdit));
  check((await api('POST', '/assets', { name: 'Zero', totalQuantity: 0 })).status === 400, 'asset with quantity 0 → 400');

  // ── Purchases: clearing fields on edit ──────────────────────────────────────
  const pe = await api('POST', '/purchase-entries', { supplier: s._id, toDepartment: dept._id, invoiceNumber: `V-${stamp}`, invoiceDate: '2026-10-01', items: [{ product: p._id, quantity: '3', rate: '10', batchRef: 'B1', expiryDate: '' }] });
  check(pe.status === 201 && pe.body.data.totalValue === 30, 'purchase with quantity/rate typed as text', show(pe));
  const peEdit = await api('PATCH', `/purchase-entries/${pe.body.data._id}`, { invoiceNumber: '', notes: 'n', items: [{ rate: '12', batchRef: '', expiryDate: '' }] });
  check(peEdit.status === 200 && !peEdit.body.data.invoiceNumber && peEdit.body.data.totalValue === 36 && !peEdit.body.data.items[0].batchRef,
    'purchase edit: blank invoice number and batch clear them, new rate recalculates the total', show(peEdit));
  check((await api('POST', '/purchase-entries', { supplier: s._id, toDepartment: dept._id, items: [] })).status === 400, 'purchase without items → 400');
  check((await api('POST', '/transactions', { transactionType: 'ADJUSTMENT', product: p._id, quantity: 1 })).status === 400, 'stock "ADJUSTMENT" can no longer be recorded by hand');

  // ── Mahaprasad counter ──────────────────────────────────────────────────────
  const noMobile = await api('POST', '/mahaprasad/issue', { quantity: 1, type: 'paid' });
  check(noMobile.status === 400 && /mobile/i.test(noMobile.body.message), 'mahaprasad: issuing needs the devotee’s mobile number', show(noMobile));
  check((await api('POST', '/mahaprasad/issue', { quantity: 1, type: 'free', mobile: '12345' })).status === 400, 'mahaprasad: a wrong mobile number → 400');
  const issue = await api('POST', '/mahaprasad/issue', { quantity: '2', type: 'free', occasion: mocc.body.data.name, mobile: '+91 98811 80662' });
  check((issue.status === 201 || issue.status === 200) && issue.body.data.coupons.every((c) => c.mobile === '9881180662'),
    'mahaprasad: free coupons issued (quantity typed as text), mobile cleaned to 10 digits', show(issue));
  const byMobile = (await api('GET', '/mahaprasad/coupons?search=80662')).body.data;
  check(byMobile?.coupons?.length === 2 && byMobile.coupons.every((c) => c.mobile === '9881180662'), 'mahaprasad: history finds coupons by mobile number', show({ body: byMobile }));
  const batches = (await api('GET', '/mahaprasad/batches')).body.data || [];
  check(batches.some((b) => b._id === issue.body.data.batchId && b.mobile === '9881180662'), 'mahaprasad: the batch list shows the mobile number');
  check((await api('POST', '/mahaprasad/issue', { quantity: 2, type: 'vip' })).status === 400, 'mahaprasad: unknown coupon type → 400');
  check((await api('POST', '/mahaprasad/issue', { quantity: 500 })).status === 400, 'mahaprasad: more than 200 at once → 400');
  const reserve = await api('POST', '/mahaprasad/offline/reserve', { qty: 3 });
  const reserved = reserve.body.data?.coupons || reserve.body.data?.numbers || [];
  check(reserve.status === 200 || reserve.status === 201, 'mahaprasad: offline numbers reserved', show(reserve));
  const first = reserved[0]?.couponNumber || reserved[0];
  if (first) {
    const sync = await api('POST', '/mahaprasad/offline/sync', { issued: [{ couponNumber: first, type: 'free', amount: 0, issuedAt: new Date().toISOString(), mobile: '9822012345' }], redeemed: [] });
    const synced = (await api('GET', `/mahaprasad/coupons?search=${first}`)).body.data?.coupons?.[0];
    check(sync.status === 200 && sync.body.data.results?.issued?.ok === 1 && synced?.mobile === '9822012345', 'mahaprasad: offline sync of an issued coupon keeps its mobile number', show(sync));
    const second = reserved[1]?.couponNumber || reserved[1];
    const oldApp = await api('POST', '/mahaprasad/offline/sync', { issued: [{ couponNumber: second, type: 'free', amount: 0 }], redeemed: [] });
    check(oldApp.body.data?.results?.issued?.ok === 1, 'mahaprasad: offline coupons from an older app (no mobile) still sync');
  }
  const third = reserved[2]?.couponNumber || reserved[2];
  if (third) {
    const found = (await api('GET', `/mahaprasad/coupons?search=${third}`)).body.data?.coupons || [];
    const listed = (await api('GET', '/mahaprasad/coupons')).body.data?.coupons || [];
    check(found.length === 0 && listed.every((c) => c.status !== 'reserved'), 'mahaprasad: history never lists numbers held for offline sale', `${found.length} found`);
  }
  check((await api('POST', '/mahaprasad/offline/sync', { issued: [{ type: 'free' }] })).status === 400, 'mahaprasad: sync item without a coupon number → 400');
  check((await api('PATCH', '/mahaprasad/cash-drawer/adjust', { denomination: 3, delta: 1 })).status === 400, 'cash drawer: unknown denomination → 400');

  // ── Settings, users, roles, budgets, templates ─────────────────────────────
  const settings = (await api('GET', '/settings')).body.data;
  const saveSettings = await api('PUT', '/settings', { ...settings, trustPAN: 'aaaTt1234c', reg80GFrom: '', mahaprasadDailyCap: '0' });
  check(saveSettings.status === 200 && saveSettings.body.data.trustPAN === 'AAATT1234C', 'settings saved whole (masked keys, blank date, cap as text); trust PAN in capitals', show(saveSettings));
  check((await api('PUT', '/settings', { assetMaxBorrowDays: 90 })).status === 400, 'settings: borrow days above 30 → 400');
  const waSave = await api('PUT', '/settings', { waTemplates: { stockAlert: ' store_alert ', mahaprasadCoupons: '' } });
  check(waSave.status === 200 && waSave.body.data.waTemplates?.stockAlert === 'store_alert' && waSave.body.data.waTemplates?.donationThanks === 'donation_thankyou',
    'WhatsApp template names saved one at a time (the others keep theirs)', show(waSave));
  check((await api('PUT', '/settings', { waTemplates: { stockAlert: 'Stock Alert' } })).status === 400, 'WhatsApp template name with capitals / spaces → 400');
  const waTest = await api('POST', '/settings/test-whatsapp', { phone: '12345' });
  check(waTest.status === 400 && /configured|mobile number/.test(waTest.body.message), 'WhatsApp test: not set up / not a mobile number → readable 400', show(waTest));
  await api('PUT', '/settings', { waTemplates: { stockAlert: settings.waTemplates?.stockAlert ?? 'stock_alert' } });
  const langSave = await api('PUT', '/settings', { waLanguages: { donationThanks: 'en' } });
  check(langSave.status === 200 && langSave.body.data.waLanguages?.donationThanks === 'en' && langSave.body.data.waLanguages?.mahaprasadCoupons === 'mr',
    'WhatsApp message language saved per message (the other keeps Marathi)', show(langSave));
  check((await api('PUT', '/settings', { waLanguages: { donationThanks: 'hi' } })).status === 400, 'WhatsApp message language other than Marathi / English → 400');
  await api('PUT', '/settings', { waLanguages: { donationThanks: 'mr' } });

  const email = `val-${stamp.toLowerCase()}@test.local`;
  const user = await api('POST', '/users', { name: 'Val User', email: email.toUpperCase(), password: 'Val-Pass-123!', role: 'viewer', departments: false, phone: '' });
  check(user.status === 201 && user.body.data.email === email, 'user: e-mail stored in lower case, empty department checkboxes accepted', show(user));
  check((await api('POST', '/users', { name: 'Short', email: `s-${email}`, password: '123', role: 'viewer' })).status === 400, 'user: password under 6 characters → 400');
  const userEdit = await api('PUT', `/users/${user.body.data._id}`, { ...user.body.data, isActive: 'false' });
  check(userEdit.status === 200 && userEdit.body.data.isActive === false, 'user edit sent back whole, "false" as text understood', show(userEdit));

  const adminEmail = `val-admin-${stamp.toLowerCase()}@test.local`;
  await api('POST', '/users', { name: 'Val Admin', email: adminEmail, password: 'Val-Pass-123!', role: 'admin', departments: [] });
  const admin = await login(adminEmail, 'Val-Pass-123!');
  const star = await admin('POST', '/roles', { slug: `val_all_${stamp.toLowerCase()}`, name: 'Everything', permissions: ['*'] });
  check(star.status === 403, 'an admin cannot create a role with every permission ("*")', show(star));
  const roleOk = await admin('POST', '/roles', { slug: `val_role_${stamp.toLowerCase()}`, name: 'Val Role', permissions: ['donations:read'] });
  check(roleOk.status === 201, 'an admin can create an ordinary role', show(roleOk));
  check((await api('POST', '/roles', { slug: 'Bad Slug', name: 'x' })).status === 400, 'role slug with spaces → 400');

  const budgets = await api('PUT', '/budgets', { year: 2026, month: '10', budgets: { electricity: '5000', water: '' } });
  check(budgets.status === 200, 'budgets saved (amounts typed as text, blank allowed)', show(budgets));
  check((await api('PUT', '/budgets', { year: 2026, month: 10, budgets: { party: 100 } })).status === 400, 'budget for an unknown category → 400');
  const tpl = await api('POST', '/payment-templates', { name: 'Val monthly', supplier: s._id, paymentMode: 'upi', bankName: '', selectedBankAccountId: '' });
  check(tpl.status === 201, 'payment template with blank bank fields', show(tpl));

  // Temple name for the sign-in page, header and receipts — public, follows Settings
  const pub = await (await fetch(`${BASE}/api/settings/temple`)).json();
  check(pub.data?.name === (await api('GET', '/settings')).body.data.templeName, 'temple name is available before sign-in and matches Settings', JSON.stringify(pub));

  const me = await api('PUT', '/auth/profile', { name: '  ', phone: '' });
  check(me.status === 400 && /Name is required/.test(me.body.message), 'profile without a name → 400', show(me));
  const loginBad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(loginBad.status === 400, 'sign-in without e-mail and password → 400');

  console.log(failed ? `\n${failed} validation check(s) failed` : '\nValidation checks OK');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
