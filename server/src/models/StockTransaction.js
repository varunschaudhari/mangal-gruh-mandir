import mongoose from 'mongoose';

const { Schema } = mongoose;

const TRANSACTION_TYPES = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE', 'OPENING_BALANCE', 'ADJUSTMENT'];
const STOCK_IN_TYPES = ['PURCHASE', 'DONATION', 'RETURN', 'TRANSFER_IN'];
const STOCK_OUT_PURPOSES = ['CONSUMPTION', 'DISTRIBUTION', 'OFFERING', 'TRANSFER_OUT', 'OTHER'];
const WASTAGE_REASONS = ['EXPIRED', 'DAMAGED', 'SPILLAGE', 'PEST', 'OTHER'];

const stockTransactionSchema = new Schema(
  {
    transactionNumber: {
      type: String,
      unique: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    // The actual date of the transaction (backdating allowed)
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    // Source department (all types except STOCK_IN)
    fromDepartment: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    // Destination department (STOCK_IN, TRANSFER, OPENING_BALANCE)
    toDepartment: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'Quantity must be positive'],
    },
    unit: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
    },
    rate: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalValue: {
      type: Number,
      min: 0,
      default: 0,
    },

    // STOCK_IN specific
    stockInType: {
      type: String,
      enum: STOCK_IN_TYPES,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    invoiceNumber: String,
    invoiceDate: Date,
    dueDate: Date,
    donorName: String,
    expiryDate: Date,
    manufacturingDate: Date,
    batchRef: { type: String, trim: true },

    // STOCK_OUT specific
    stockOutPurpose: {
      type: String,
      enum: STOCK_OUT_PURPOSES,
    },
    issuedTo: String,

    // WASTAGE specific
    wastageReason: {
      type: String,
      enum: WASTAGE_REASONS,
    },

    // FIFO batch tracking (STOCK_OUT / WASTAGE / TRANSFER)
    consumedBatches: [
      {
        batch: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
        qty: Number,
      },
    ],

    notes: String,

    isVoided: {
      type: Boolean,
      default: false,
      index: true,
    },
    voidedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    voidedAt: Date,
    voidReason: String,

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for common queries
stockTransactionSchema.index({ transactionDate: -1, transactionType: 1 });
stockTransactionSchema.index({ product: 1, transactionDate: -1, isVoided: 1 });
stockTransactionSchema.index({ fromDepartment: 1, transactionDate: -1 });
stockTransactionSchema.index({ toDepartment: 1, transactionDate: -1 });

export const TRANSACTION_TYPES_LIST = TRANSACTION_TYPES;
export const STOCK_IN_TYPES_LIST = STOCK_IN_TYPES;
export const STOCK_OUT_PURPOSES_LIST = STOCK_OUT_PURPOSES;
export const WASTAGE_REASONS_LIST = WASTAGE_REASONS;

const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema);
export default StockTransaction;
