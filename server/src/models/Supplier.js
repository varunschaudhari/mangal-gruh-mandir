import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema({
  label:             { type: String, default: '' },
  bankName:          { type: String, default: '' },
  accountNumber:     { type: String, default: '' },
  ifscCode:          { type: String, default: '' },
  accountHolderName: { type: String, default: '' },
  upiId:             { type: String, default: '' },
  isDefault:         { type: Boolean, default: false },
}, { _id: true });

const supplierSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true },
    type:          { type: String, enum: ['vendor', 'donor', 'both'], default: 'vendor' },
    contactPerson: { type: String, default: '' },
    phone:         { type: String, default: '' },
    email:         { type: String, default: '', lowercase: true, trim: true },
    address:       { type: String, default: '' },
    city:          { type: String, default: '' },
    gstin:         { type: String, default: '' },
    panNumber:     { type: String, default: '' },
    notes:         { type: String, default: '' },
    isActive:      { type: Boolean, default: true },

    // Multiple bank / payment accounts
    bankAccounts:  { type: [bankAccountSchema], default: [] },

    // Payment terms
    creditDays:    { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
