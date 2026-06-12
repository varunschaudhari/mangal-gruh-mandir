import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const assetUnitSchema = new mongoose.Schema(
  {
    asset:          { type: ObjectId, ref: 'Asset', required: true },
    unitCode:       { type: String, required: true, unique: true },   // MGM-AST-007-01
    unitNumber:     { type: Number, required: true },                  // 1
    condition:      { type: String, enum: ['good', 'fair', 'damaged', 'lost'], default: 'good' },
    conditionNotes: { type: String, default: '' },
    isActive:       { type: Boolean, default: true },                  // false = retired/written off
    lastBorrowedAt: { type: Date },
    updatedBy:      { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetUnitSchema.index({ asset: 1, unitNumber: 1 }, { unique: true });

export default mongoose.model('AssetUnit', assetUnitSchema);
