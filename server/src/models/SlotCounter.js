import mongoose from 'mongoose';

// Seats taken per batch (or per slot-seva) per date. Bookings reserve seats here with one
// atomic update, so two counters (or the website) can never sell the same last seat.
//   key: "B:<batchId>:<YYYY-MM-DD>" or "S:<sevaTypeId>:<YYYY-MM-DD>"
const slotCounterSchema = new mongoose.Schema({
  key:    { type: String, required: true, unique: true },
  date:   { type: String, required: true },
  booked: { type: Number, default: 0 },  // in BookingSettings.capacityUnit
  seq:    { type: Number, default: 0 },  // last serial (token) number given out — never goes back
});

slotCounterSchema.index({ date: 1 });

export default mongoose.model('SlotCounter', slotCounterSchema);
