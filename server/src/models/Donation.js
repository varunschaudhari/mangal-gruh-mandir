import mongoose from 'mongoose';

export const DONATION_TYPES    = ['named', 'hundi', 'anonymous'];
export const PAYMENT_MODES     = ['cash', 'upi', 'cheque', 'bank_transfer'];

const kindItemSchema = new mongoose.Schema({
  product:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity:         { type: Number, required: true, min: 0.01 },
  unit:             { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  department:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  estimatedValue:   { type: Number, default: 0 },
  stockTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransaction' },
}, { _id: true });

const donationSchema = new mongoose.Schema(
  {
    donationNumber: { type: String, unique: true, sparse: true },
    donationType:   { type: String, enum: DONATION_TYPES, default: 'named' },
    date:           { type: Date, required: true, default: Date.now },

    // Named donor (linked to Supplier with type donor/both)
    donor:          { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    // Walk-in / anonymous donor info (when not creating a supplier record)
    donorName:      { type: String },
    donorPhone:     { type: String },
    panNumber:      { type: String },

    occasion:       { type: mongoose.Schema.Types.ObjectId, ref: 'DonationOccasion' },

    // Cash component
    cashAmount:     { type: Number, default: 0, min: 0 },
    paymentMode:    { type: String, enum: PAYMENT_MODES, default: 'cash' },
    paymentRef:     { type: String }, // UPI txn ID, cheque number, etc.

    // Kind items (each auto-creates a Stock In)
    kindItems:      { type: [kindItemSchema], default: [] },

    totalEstimatedValue: { type: Number, default: 0 },

    is80G:          { type: Boolean, default: false },
    notes:          { type: String },
    isVoided:       { type: Boolean, default: false },
    voidReason:     { type: String },

    receivedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

donationSchema.index({ date: -1 });
donationSchema.index({ donor: 1 });
donationSchema.index({ donationType: 1, date: -1 });

export default mongoose.model('Donation', donationSchema);
