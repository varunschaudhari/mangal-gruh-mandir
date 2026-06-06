import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditLogSchema = new Schema({
  timestamp:  { type: Date, default: Date.now, index: true },
  user: {
    _id:  { type: Schema.Types.ObjectId, ref: 'User', index: true },
    name: String,
    role: String,
  },
  action:    { type: String, required: true, index: true },
  entity:    { type: String, required: true, index: true },
  entityId:  { type: String, index: true },   // human-readable number e.g. PAY-2025-001
  entityRef: { type: Schema.Types.ObjectId, index: true }, // MongoDB _id
  before:    Schema.Types.Mixed,
  after:     Schema.Types.Mixed,
  meta:      Schema.Types.Mixed,
  ip:        String,
  userAgent: String,
}, { timestamps: false, versionKey: false });

// Compound index for entity-history queries
auditLogSchema.index({ entity: 1, entityRef: 1, timestamp: -1 });
auditLogSchema.index({ 'user._id': 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
