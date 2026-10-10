import mongoose from 'mongoose';

// A date when bookings are not taken (Setup → Closed dates), for all sevas or some.
const bookingClosureSchema = new mongoose.Schema(
  {
    date:      { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason:    { type: String, trim: true, default: '' },
    sevaTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SevaType' }], // empty = all sevas
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

bookingClosureSchema.index({ date: 1 });

export default mongoose.model('BookingClosure', bookingClosureSchema);
