import mongoose from 'mongoose';

// Everyone whose attendance is tracked — including staff who never log in to the app
// (cooks, cleaners, guards, pujaris). Linked to a User only if they also use the app.
const staffSchema = new mongoose.Schema(
  {
    staffCode:   { type: String, required: true, unique: true, uppercase: true, trim: true }, // STF-001
    name:        { type: String, required: true, trim: true },
    phone:       { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },  // Pujari, Cook, Guard, Store…
    gender:      { type: String, enum: ['', 'male', 'female'], default: '' },   // Professional Tax slabs differ
    department:  { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    joinDate:    { type: Date },
    leftOn:      { type: Date },                              // last working day (after leaving)
    isActive:    { type: Boolean, default: true },
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Attendance
    machineId:   { type: String, trim: true },               // enrolment number on the biometric machine
    defaultShift: { type: mongoose.Schema.Types.ObjectId },   // one of AttendanceSettings.shifts
    nightOnly:   { type: Boolean, default: false },
    weeklyOffDay: { type: Number, min: 0, max: 6, default: 0 }, // 0 = Sunday; used when a week has no roster yet
    doubleShiftEligible: { type: Boolean, default: false },

    // Salary (used by the payroll phase)
    monthlySalary:     { type: Number, default: 0, min: 0 },
    basicSalary:       { type: Number, min: 0 },                // PF is on basic; empty = all of it is basic
    paidLeavePerMonth: { type: Number, min: 0, max: 31 },       // empty = the default from settings (3)
    pfApplicable:  { type: Boolean, default: false },
    esiApplicable: { type: Boolean, default: false },
    ptApplicable:  { type: Boolean, default: true },
    uan:      { type: String, trim: true, default: '' },
    esicNo:   { type: String, trim: true, default: '' },
    bankAccount: { type: String, trim: true, default: '' },
    ifsc:        { type: String, trim: true, uppercase: true, default: '' },
    notes:    { type: String, default: '' },
  },
  { timestamps: true },
);

staffSchema.index({ machineId: 1 }, { unique: true, partialFilterExpression: { machineId: { $type: 'string', $gt: '' } } });

export default mongoose.model('Staff', staffSchema);
