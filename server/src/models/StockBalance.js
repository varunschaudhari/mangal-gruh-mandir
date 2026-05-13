import mongoose from 'mongoose';

const { Schema } = mongoose;

const stockBalanceSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastTransactionDate: {
      type: Date,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Each product+department pair has exactly one balance record
stockBalanceSchema.index({ product: 1, department: 1 }, { unique: true });
stockBalanceSchema.index({ department: 1, quantity: 1 });

const StockBalance = mongoose.model('StockBalance', stockBalanceSchema);
export default StockBalance;
