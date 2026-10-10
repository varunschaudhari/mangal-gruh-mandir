import mongoose from 'mongoose';

// Money given to an employee ahead of salary, recovered from coming salaries in instalments.
// What is still to recover is worked out from the finalised salary months.
const salaryAdvanceSchema = new mongoose.Schema(
  {
    staff:       { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    date:        { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amount:      { type: Number, required: true, min: 1 },
    installment: { type: Number, min: 0, default: 0 },   // per month; 0 = recover all next salary
    mode:        { type: String, enum: ['cash', 'bank', 'upi'], default: 'cash' },
    note:        { type: String, trim: true, default: '' },
    expense:     { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
    by:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

salaryAdvanceSchema.index({ staff: 1, date: 1 });

export default mongoose.model('SalaryAdvance', salaryAdvanceSchema);
