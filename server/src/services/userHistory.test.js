import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { userRefPaths } from './userHistory.service.js';

const { ObjectId } = mongoose.Schema.Types;

test('finds every field that holds a user, also in lists and sub-documents', () => {
  const schema = new mongoose.Schema({
    issuedBy:  { type: ObjectId, ref: 'User' },
    product:   { type: ObjectId, ref: 'Product' },
    approvers: [{ type: ObjectId, ref: 'User' }],
    items:     [{ checkedBy: { type: ObjectId, ref: 'User' }, qty: Number }],
    void:      new mongoose.Schema({ by: { type: ObjectId, ref: 'User' } }),
    user:      { _id: { type: ObjectId, ref: 'User' }, name: String },
  });
  assert.deepEqual(userRefPaths(schema).sort(), ['approvers', 'issuedBy', 'items.checkedBy', 'user._id', 'void.by']);
});

test('the real models: coupons and the audit log are covered', async () => {
  const { default: MahaprasadCoupon } = await import('../models/MahaprasadCoupon.js');
  const { default: AuditLog } = await import('../models/AuditLog.js');
  assert.ok(userRefPaths(MahaprasadCoupon.schema).includes('issuedBy'));
  assert.ok(userRefPaths(MahaprasadCoupon.schema).includes('redeemedBy'));
  assert.deepEqual(userRefPaths(AuditLog.schema), ['user._id']);
});
