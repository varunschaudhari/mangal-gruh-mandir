import mongoose from 'mongoose';

// Per-person, per-month amounts decided by management that the attendance can't work out by
// itself — overtime for extra hours (there is no fixed overtime rate). Salary uses these.
const attendanceMonthSchema = new mongoose.Schema(
  {
    staff:          { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    month:          { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    overtimeAmount: { type: Number, min: 0, default: 0 },
    note:           { type: String, trim: true, default: '' },
    by:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

attendanceMonthSchema.index({ staff: 1, month: 1 }, { unique: true });

export default mongoose.model('AttendanceMonth', attendanceMonthSchema);
