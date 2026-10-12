import mongoose from 'mongoose';

// New codes: capital letters, digits and dashes (H1, MAIN). Codes that batches used before the
// halls list existed are kept exactly as they were, so the schema itself only limits the length.
export const HALL_CODE = /^[A-Z0-9-]{1,8}$/;

// A hall that batches run in (Setup → Halls). The short code (H1) is fixed once added — it is
// what batches, bookings and slips store — while the display names can be changed any time.
const bookingHallSchema = new mongoose.Schema(
  {
    code:      { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    name:      { type: String, trim: true, default: '', maxlength: 60 },   // "Shri Mangal Sabhagruh"
    nameMr:    { type: String, trim: true, default: '', maxlength: 60 },
    isActive:  { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model('BookingHall', bookingHallSchema);
