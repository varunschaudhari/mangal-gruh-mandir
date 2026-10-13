import mongoose from 'mongoose';

// One month's salary for everyone. Draft → finalised (locked; files and payslips) → paid
// (expenses recorded). Each line keeps a copy of what it was based on, so payslips stay the
// same even if the staff record or attendance changes later.
const recoverySchema = new mongoose.Schema({
  advance: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryAdvance', required: true },
  amount:  { type: Number, min: 0, default: 0 },
}, { _id: false });

const lineSchema = new mongoose.Schema({
  staff:        { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  staffCode:    String,
  name:         String,
  designation:  String,
  department:   String,
  gender:       String,
  uan:          String,
  esicNo:       String,
  bankAccount:  String,
  ifsc:         String,
  leftOn:       String,
  pfApplicable:  Boolean,
  esiApplicable: Boolean,
  ptApplicable:  Boolean,

  monthlySalary: Number,
  basicSalary:   Number,
  daysInMonth:   Number,
  paidDays:      Number,
  paidLeave:     Number,
  extraLeave:    Number,
  unpaidDays:    Number,
  lateCut:       Number,
  ncpDays:       Number,      // days without pay, for the PF return

  earnedBasic:   Number,
  earnedOther:   Number,
  overtime:      Number,
  otherEarning:     { type: Number, default: 0 },
  otherEarningNote: { type: String, default: '' },
  gross:         Number,

  pfWage:        Number,
  epsWage:       Number,
  pfEmployee:    Number,
  pfEmployer:    Number,
  eps:           Number,
  epfDiff:       Number,
  esiWage:       Number,
  esiEmployee:   Number,
  esiEmployer:   Number,
  pt:            Number,

  recoveries:       { type: [recoverySchema], default: [] },
  recoveriesEdited: { type: Boolean, default: false },
  advanceRecovery:  Number,
  otherDeduction:     { type: Number, default: 0 },
  otherDeductionNote: { type: String, default: '' },
  totalDeductions: Number,
  netPay:          Number,
  employerCost:    Number,

  paymentMode:    { type: String, enum: ['bank', 'cash'], default: 'bank' },
  paymentModeSet: { type: Boolean, default: false },   // chosen by hand (otherwise from bank details)
  warnings:       { type: [String], default: [] },
}, { _id: false });

const salaryRunSchema = new mongoose.Schema(
  {
    month:  { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    status: { type: String, enum: ['draft', 'finalized', 'paid'], default: 'draft' },
    payingAt: { type: Date },   // "Mark as paid" in progress (so a second click can't record it twice)
    lines:  { type: [lineSchema], default: [] },
    preparedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    preparedAt:  Date,
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: Date,
    paidBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidOn:      String,
    paymentRef:  { type: String, default: '' },
    expenses:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  },
  { timestamps: true },
);

export default mongoose.model('SalaryRun', salaryRunSchema);
