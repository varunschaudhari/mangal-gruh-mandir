import mongoose from 'mongoose';

// A bookable puja / abhishek with a fixed price (Setup → Seva types).
//
// `schedule` decides how a booking is placed in time:
//   batch       — devotee picks a batch (time + hall) on a date; seats per batch are limited
//   slot        — one fixed time on allowed weekdays, optional limit per day (Panchamrit, Nitya)
//   arrangement — the office agrees a date with the devotee; no seat limit (Bhomyag)
//   none        — no date or seat (Post Abhishek, done on the devotee's behalf)
export const SCHEDULES = ['batch', 'slot', 'arrangement', 'none'];

const sevaTypeSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    nameMr:      { type: String, trim: true, default: '' },
    code:        { type: String, trim: true, uppercase: true, maxlength: 8, default: '' },
    description: { type: String, trim: true, default: '' },
    price:       { type: Number, required: true, min: 1 },
    schedule:    { type: String, enum: SCHEDULES, required: true, default: 'batch' },
    duration:    { type: String, trim: true, default: '' },          // shown to staff, e.g. "1 hour"
    // slot schedule only
    slotTime:    { type: String, trim: true, default: '' },          // "5:00 AM – 7:00 AM"
    weekdays:    { type: [Number], default: () => [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    dailyLimit:  { type: Number, default: 0, min: 0 },               // bookings per day; 0 = no limit
    maxPeople:   { type: Number, default: 0, min: 0 },               // per booking; 0 = no limit
    needsPostalAddress: { type: Boolean, default: false },           // prasad / letter sent by post
    onlineEnabled: { type: Boolean, default: false },                // phase 2 — public booking page
    isActive:    { type: Boolean, default: true },
    sortOrder:   { type: Number, default: 0 },
  },
  { timestamps: true },
);

sevaTypeSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('SevaType', sevaTypeSchema);
