import mongoose from 'mongoose';

const { Schema } = mongoose;

const stockBatchSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    originalQty: { type: Number, required: true, min: 0 },
    remainingQty: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, index: true },        // null = no expiry
    manufacturingDate: { type: Date },
    batchRef: { type: String, trim: true },          // e.g. "LOT-2026-001"
    sourceTransaction: { type: Schema.Types.ObjectId, ref: 'StockTransaction', required: true },
    isVoided: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Fetch available batches: expiry-dated first (ASC), then undated (by createdAt ASC)
stockBatchSchema.statics.findAvailable = function (productId, departmentId) {
  return this.find({
    product: productId,
    department: departmentId,
    isVoided: false,
    remainingQty: { $gt: 0 },
  }).sort({ expiryDate: 1, createdAt: 1 });
  // MongoDB sorts nulls first with { expiryDate: 1 }, but we want nulls last.
  // We handle this in the FIFO service: process expiry-dated first, then null-expiry.
};

stockBatchSchema.index({ product: 1, department: 1, isVoided: 1, remainingQty: 1 });
stockBatchSchema.index({ expiryDate: 1, isVoided: 1 });

const StockBatch = mongoose.model('StockBatch', stockBatchSchema);
export default StockBatch;
