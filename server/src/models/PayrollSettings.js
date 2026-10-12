import mongoose from 'mongoose';
import singleton from './singleton.js';

// Salary rules: PF, ESI, Professional Tax and bank-file details. One document, edited from
// Salary → Salary Settings. Defaults follow the current statutory rates and Maharashtra PT.

// A PT slab applies when gross salary is above `above`; the highest matching slab wins.
const ptSlabSchema = new mongoose.Schema({
  gender:         { type: String, enum: ['male', 'female'], required: true },
  above:          { type: Number, required: true, min: 0 },
  amount:         { type: Number, required: true, min: 0 },
  februaryAmount: { type: Number, min: 0 },   // Maharashtra: ₹300 in February instead of ₹200
}, { _id: false });

const payrollSettingsSchema = new mongoose.Schema(
  {
    pf: {
      enabled:           { type: Boolean, default: true },
      employeeRate:      { type: Number, default: 12, min: 0, max: 100 },
      employerRate:      { type: Number, default: 12, min: 0, max: 100 },
      epsRate:           { type: Number, default: 8.33, min: 0, max: 100 },   // part of the employer share
      wageCeiling:       { type: Number, default: 15000, min: 0 },
      capAtCeiling:      { type: Boolean, default: true },   // PF on basic up to the ceiling only
      establishmentCode: { type: String, trim: true, default: '' },
    },
    esi: {
      enabled:      { type: Boolean, default: true },
      employeeRate: { type: Number, default: 0.75, min: 0, max: 100 },
      employerRate: { type: Number, default: 3.25, min: 0, max: 100 },
      wageCeiling:  { type: Number, default: 21000, min: 0 },   // covered when monthly salary ≤ this
      employerCode: { type: String, trim: true, default: '' },
    },
    pt: {
      enabled: { type: Boolean, default: true },
      state:   { type: String, trim: true, default: 'Maharashtra' },
      slabs: {
        type: [ptSlabSchema],
        default: () => [
          { gender: 'male', above: 7500, amount: 175 },
          { gender: 'male', above: 10000, amount: 200, februaryAmount: 300 },
          { gender: 'female', above: 25000, amount: 200, februaryAmount: 300 },
        ],
      },
    },
    bank: {
      narration: { type: String, trim: true, default: 'Salary {month}' },   // {month} → "Oct 2026"
    },
  },
  { timestamps: true },
);

payrollSettingsSchema.plugin(singleton);   // getOrCreate()

export default mongoose.model('PayrollSettings', payrollSettingsSchema);
