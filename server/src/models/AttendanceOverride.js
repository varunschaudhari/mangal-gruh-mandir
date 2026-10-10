import mongoose from 'mongoose';

// A supervisor's decision for one employee on one day, overriding what the punches say
// (duty outside the temple, a known reason for being late, planned leave…). Always has a note.
export const OVERRIDE_STATUSES = ['present', 'half_day', 'absent', 'off', 'on_duty', 'leave'];
// leave: 'paid' uses the month's paid leave first, 'extra' uses extra leave first (both fall back
// to the other, then unpaid); 'unpaid' never touches the balances.
export const LEAVE_TYPES = ['paid', 'extra', 'unpaid'];

const attendanceOverrideSchema = new mongoose.Schema(
  {
    staff:     { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    date:      { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status:    { type: String, enum: OVERRIDE_STATUSES },   // empty = keep the computed status
    leaveType: { type: String, enum: LEAVE_TYPES },          // only with status 'leave'
    waiveLate: { type: Boolean, default: false },
    note:      { type: String, required: true, trim: true },
    by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

attendanceOverrideSchema.index({ staff: 1, date: 1 }, { unique: true });

export default mongoose.model('AttendanceOverride', attendanceOverrideSchema);
