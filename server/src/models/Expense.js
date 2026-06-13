import mongoose from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'electricity', 'water', 'salary', 'priest_fees',
  'maintenance', 'decoration', 'printing', 'miscellaneous',
];

export const CATEGORY_LABELS = {
  electricity:   'Electricity',
  water:         'Water',
  salary:        'Salary',
  priest_fees:   'Priest Fees',
  maintenance:   'Maintenance',
  decoration:    'Decoration',
  printing:      'Printing & Stationery',
  miscellaneous: 'Miscellaneous',
};

const expenseSchema = new mongoose.Schema(
  {
    expenseNumber:   { type: String, required: true, unique: true },
    category:        { type: String, required: true, enum: EXPENSE_CATEGORIES },
    description:     { type: String, required: true, trim: true },
    amount:          { type: Number, required: true, min: 0 },
    payee:           { type: String, trim: true },
    expenseDate:     { type: Date, required: true },
    paymentMode:     { type: String, required: true, enum: ['cash', 'upi', 'cheque'] },
    referenceNumber: { type: String, trim: true },
    receiptPath:     { type: String },
    notes:           { type: String },
    status: {
      type:    String,
      enum:    ['pending_approval', 'approved', 'rejected', 'voided'],
      default: 'pending_approval',
    },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:      { type: Date },
    rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt:      { type: Date },
    rejectionReason: { type: String },
    voidedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt:        { type: Date },
    voidReason:      { type: String },
  },
  { timestamps: true }
);

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
