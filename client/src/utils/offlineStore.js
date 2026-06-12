import { openDB } from 'idb';

const DB_NAME    = 'mgm-offline';
const DB_VERSION = 1;

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('coupons')) {
        const s = db.createObjectStore('coupons', { keyPath: 'couponNumber' });
        s.createIndex('byDate',   'dateStr');
        s.createIndex('byStatus', 'status');
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const q = db.createObjectStore('syncQueue', { autoIncrement: true, keyPath: 'id' });
        q.createIndex('bySynced', 'synced');
      }
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extract YYYYMMDD from "MP-YYYYMMDD-NNN"
function couponDateStr(couponNumber) {
  return couponNumber.slice(3, 11);
}

// YYYYMMDD → "YYYY-MM-DD"
function dateStrToIso(ds) {
  return `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
}

// ── Write operations ──────────────────────────────────────────────────────────

// Store pre-fetched reserved coupons from the server
export async function storePrefetched(coupons) {
  const db = await getDb();
  const tx = db.transaction('coupons', 'readwrite');
  for (const c of coupons) {
    const ds = couponDateStr(c.couponNumber);
    await tx.store.put({
      couponNumber: c.couponNumber,
      dateStr:      ds,
      date:         c.date || dateStrToIso(ds),
      type:         'paid',
      amount:       0,
      occasion:     '',
      status:       'available',
      issuedAt:     null,
      issuedById:   null,
      issuedByName: '',
      redeemedAt:   null,
      synced:       false,
    });
  }
  await tx.done;
}

// Cache today's online-issued coupons so the redeem counter can look them up offline
export async function storeOnlineIssued(coupons) {
  const db = await getDb();
  const tx = db.transaction('coupons', 'readwrite');
  for (const c of coupons) {
    const existing = await tx.store.get(c.couponNumber);
    // Don't overwrite anything that was modified offline
    if (existing && existing.status !== 'available') continue;
    const ds = couponDateStr(c.couponNumber);
    await tx.store.put({
      couponNumber:   c.couponNumber,
      dateStr:        ds,
      date:           c.date || dateStrToIso(ds),
      type:           c.type,
      amount:         c.amount,
      occasion:       c.occasion || '',
      status:         c.status === 'redeemed' ? 'redeemed' : 'issued-online',
      issuedAt:       c.issuedAt,
      issuedById:     c.issuedBy?._id || c.issuedBy,
      issuedByName:   c.issuedBy?.name || '',
      redeemedAt:     c.redeemedAt,
      redeemedById:   c.redeemedBy?._id || c.redeemedBy,
      redeemedByName: c.redeemedBy?.name || '',
      synced:         true,
    });
  }
  await tx.done;
}

// Pop the next available coupon for a date (YYYYMMDD) and lock it as pending
export async function popNextCoupon(dateStr) {
  const db = await getDb();
  const tx = db.transaction('coupons', 'readwrite');
  const all = await tx.store.index('byDate').getAll(dateStr);
  const avail = all
    .filter((c) => c.status === 'available')
    .sort((a, b) => a.couponNumber.localeCompare(b.couponNumber));
  if (!avail.length) { await tx.done; return null; }
  const coupon = { ...avail[0], status: 'pending-issue' };
  await tx.store.put(coupon);
  await tx.done;
  return coupon;
}

// Confirm an issue — called after popNextCoupon succeeds
export async function confirmIssue(couponNumber, data) {
  const db = await getDb();
  const tx = db.transaction(['coupons', 'syncQueue'], 'readwrite');
  const c  = await tx.objectStore('coupons').get(couponNumber);
  if (!c) { await tx.done; throw new Error(`Coupon ${couponNumber} not in offline store`); }

  const updated = {
    ...c,
    type:         data.type,
    amount:       data.amount,
    occasion:     data.occasion || '',
    status:       'issued-offline',
    issuedAt:     data.issuedAt,
    issuedById:   data.issuedById,
    issuedByName: data.issuedByName,
    batchId:      data.batchId,
    synced:       false,
  };
  await tx.objectStore('coupons').put(updated);
  await tx.objectStore('syncQueue').add({
    type:        'issue',
    couponNumber,
    data:        updated,
    createdAt:   data.issuedAt,
    synced:      false,
  });
  await tx.done;
  return updated;
}

// Lookup coupon for the redeem screen
export async function lookupCoupon(couponNumber) {
  const db = await getDb();
  return db.get('coupons', couponNumber);
}

// Mark a coupon as redeemed offline
export async function markRedeemed(couponNumber, data) {
  const db = await getDb();
  const tx = db.transaction(['coupons', 'syncQueue'], 'readwrite');
  const c  = await tx.objectStore('coupons').get(couponNumber);
  if (!c) { await tx.done; return null; }

  const updated = {
    ...c,
    status:         'redeemed-offline',
    redeemedAt:     data.redeemedAt,
    redeemedById:   data.redeemedById,
    redeemedByName: data.redeemedByName,
    synced:         false,
  };
  await tx.objectStore('coupons').put(updated);
  await tx.objectStore('syncQueue').add({
    type:        'redeem',
    couponNumber,
    data:        { redeemedAt: data.redeemedAt, redeemedById: data.redeemedById },
    createdAt:   data.redeemedAt,
    synced:      false,
  });
  await tx.done;
  return updated;
}

// ── Read operations ───────────────────────────────────────────────────────────

export async function getPoolCount(dateStr) {
  const db  = await getDb();
  const all = await db.getAllFromIndex('coupons', 'byDate', dateStr);
  return {
    available: all.filter((c) => c.status === 'available').length,
    offlineIssued: all.filter((c) => c.status === 'issued-offline').length,
  };
}

export async function getPendingSync() {
  const db  = await getDb();
  const all = await db.getAll('syncQueue');
  return all.filter((item) => !item.synced);
}

export async function markSynced(ids) {
  const db = await getDb();
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const id of ids) {
    const item = await tx.store.get(id);
    if (item) { item.synced = true; await tx.store.put(item); }
  }
  await tx.done;
}

// Remove synced stale data from previous days to keep IndexedDB lean
export async function clearOldData() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const db  = await getDb();
  const all = await db.getAll('coupons');
  const tx  = db.transaction('coupons', 'readwrite');
  for (const c of all) {
    if (c.dateStr < today && c.synced) await tx.store.delete(c.couponNumber);
  }
  await tx.done;
}

// Normalize an offline coupon record to match the shape the UI expects
export function normalizeForUi(c) {
  if (!c) return null;
  const liveStatus =
    c.status === 'issued-offline' || c.status === 'issued-online' ? 'issued'
    : c.status === 'redeemed-offline' ? 'redeemed'
    : c.status;
  return {
    ...c,
    _id:        c.couponNumber,
    date:       c.date || dateStrToIso(c.dateStr),
    status:     liveStatus,
    issuedBy:   { _id: c.issuedById, name: c.issuedByName || 'Counter Staff' },
    redeemedBy: c.redeemedById ? { _id: c.redeemedById, name: c.redeemedByName || '—' } : null,
  };
}
