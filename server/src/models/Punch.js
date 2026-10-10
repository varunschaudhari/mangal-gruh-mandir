import mongoose from 'mongoose';

// A single in/out punch — from the biometric machine, or added by a supervisor for a
// missed punch (always with a reason). Machine punches are never edited; a wrong one is
// marked ignored instead, so the original record stays.
const punchSchema = new mongoose.Schema(
  {
    machineId: { type: String, required: true, trim: true },
    staff:     { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },   // empty until the ID is mapped
    time:      { type: Date, required: true },
    source:    { type: String, enum: ['machine', 'manual'], default: 'machine' },
    device:    { type: String, default: '' },                            // machine serial
    verify:    { type: String, default: '' },                            // finger / face / card…
    ignored:   { type: Boolean, default: false },
    reason:    { type: String, default: '' },                            // manual punch or ignore reason
    by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

punchSchema.index({ machineId: 1, time: 1, source: 1 }, { unique: true });
punchSchema.index({ staff: 1, time: 1 });

export default mongoose.model('Punch', punchSchema);
