import mongoose from 'mongoose';

// One employee's plan for one date: which shift(s), or weekly off. Days without an entry
// fall back to the employee's default shift and weekly off day (see attendance.service.js).
const rosterDaySchema = new mongoose.Schema(
  {
    staff:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    date:   { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },  // calendar day (IST)
    shifts: [{ type: mongoose.Schema.Types.ObjectId }],                  // two = day + night (double)
    off:    { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

rosterDaySchema.index({ staff: 1, date: 1 }, { unique: true });
rosterDaySchema.index({ date: 1 });

export default mongoose.model('RosterDay', rosterDaySchema);
