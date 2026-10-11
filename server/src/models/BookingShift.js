import mongoose from 'mongoose';

const totalsSchema = new mongoose.Schema({
  count:  { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  cash:   { type: Number, default: 0 },
  upi:    { type: Number, default: 0 },
  card:   { type: Number, default: 0 },
  voidedCount: { type: Number, default: 0 },
}, { _id: false });

// A counter person's shift, closed with a cash count and handed over to a supervisor.
// Bookings made by that person since their last close are linked to it (Booking.shift).
const bookingShiftSchema = new mongoose.Schema(
  {
    user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt:    { type: Date, required: true },     // first booking of the shift
    closedAt:     { type: Date, required: true, index: true },
    totals:       { type: totalsSchema, default: () => ({}) },  // as at closing (confirmed bookings)
    openingFloat: { type: Number, default: 0, min: 0 },         // change given at the start
    countedCash:  { type: Number, required: true, min: 0 },
    denominations:{ type: Map, of: Number, default: {} },        // note/coin → count, optional
    expectedCash: { type: Number, required: true },             // float + cash bookings
    difference:   { type: Number, required: true },             // counted − expected (negative = short)
    notes:        { type: String, trim: true, default: '' },
    status:       { type: String, enum: ['closed', 'verified'], default: 'closed', index: true },
    verifiedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt:   { type: Date },
    verifyNote:   { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

export default mongoose.model('BookingShift', bookingShiftSchema);
