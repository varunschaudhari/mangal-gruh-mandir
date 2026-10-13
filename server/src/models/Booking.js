import mongoose from 'mongoose';

export const PAYMENT_MODES = ['cash', 'upi', 'card', 'online'];
export const BOOKING_STATUSES = ['confirmed', 'voided'];

// One correction made after booking (details edited, moved to another batch/date, payment fixed).
// `changes` maps a field to [before, after]. The receipt number and amount never change.
const historySchema = new mongoose.Schema({
  at:      { type: Date, default: Date.now },
  by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:  { type: String, enum: ['edit', 'move'], required: true },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  reason:  { type: String, trim: true, default: '' },
}, { _id: false });

// One abhishek / puja booking. Names, prices and batch times are copied in at booking time,
// so later changes in Setup never alter an issued receipt.
const bookingSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true },  // ABH/2026-27/00001
    fy:        { type: String, required: true },                // "2026-27"
    seq:       { type: Number, required: true },

    sevaType:  { type: mongoose.Schema.Types.ObjectId, ref: 'SevaType', required: true },
    sevaName:  { type: String, required: true },
    schedule:  { type: String, required: true },
    amount:    { type: Number, required: true, min: 0 },

    // When the puja is done. dateKey is the IST calendar day ("2026-10-13"); null for 'none'.
    performDate: { type: Date },
    dateKey:     { type: String, index: true },
    batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'BookingBatch' },
    batchLabel:  { type: String, default: '' },   // "7:00 AM – 8:15 AM" or the slot time
    hall:        { type: String, default: '' },
    serialNo:    { type: Number },                // token within that batch/slot and date
    seats:       { type: Number, default: 1 },    // seats taken in the slot counter (released on void)

    devotee: {
      name:          { type: String, required: true, trim: true },
      phone:         { type: String, required: true, trim: true, index: true },
      email:         { type: String, trim: true, default: '' },
      address:       { type: String, trim: true, default: '' },   // house / street (or the whole address, older bookings)
      pincode:       { type: String, trim: true, default: '' },
      area:          { type: String, trim: true, default: '' },   // village / locality
      city:          { type: String, trim: true, default: '' },   // taluka / town
      district:      { type: String, trim: true, default: '' },
      state:         { type: String, trim: true, default: '' },
      dob:           { type: String, default: '' },               // YYYY-MM-DD
      maritalStatus: { type: String, enum: ['', 'married', 'unmarried'], default: '' },
      gotra:         { type: String, trim: true, default: '' },
      familyNames:   { type: [String], default: [] },
      rashi:         { type: String, trim: true, default: '' },
      nakshatra:     { type: String, trim: true, default: '' },
      birthTime:     { type: String, trim: true, default: '' },
      birthPlace:    { type: String, trim: true, default: '' },
      language:      { type: String, enum: ['', 'mr', 'en'], default: '' },  // WhatsApp receipt; '' = Setup's default
    },
    peopleCount: { type: Number, default: 1, min: 1 },
    notes:       { type: String, trim: true, default: '' },

    paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
    paymentRef:  { type: String, trim: true, default: '' },   // UPI / card reference
    paidAt:      { type: Date, required: true, index: true },
    channel:     { type: String, enum: ['counter', 'online'], default: 'counter' },

    status:     { type: String, enum: BOOKING_STATUSES, default: 'confirmed', index: true },
    voidReason: { type: String, trim: true, default: '' },
    voidedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt:   { type: Date },

    receiptToken:   { type: String, required: true, unique: true },  // public receipt link
    clientRequestId:{ type: String },                                // stops a double-tapped "Book" making two
    whatsappSentAt: { type: Date },
    smsSentAt:      { type: Date },

    // Hall check-in: the slip's QR scanned at the hall, or marked by hand. checkInOverride says why
    // staff let the devotee in anyway (batch already over, came to another hall).
    checkedInAt:     { type: Date },
    checkedInBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkInOverride: { type: String, default: '' },

    history:   { type: [historySchema], default: [] },
    // The counter shift this booking was handed over in (set when the shift is closed).
    shift:     { type: mongoose.Schema.Types.ObjectId, ref: 'BookingShift', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

bookingSchema.index({ dateKey: 1, batch: 1, status: 1 });
bookingSchema.index({ status: 1, paidAt: -1 });
bookingSchema.index({ createdBy: 1, paidAt: -1 });
bookingSchema.index({ createdBy: 1, shift: 1, paidAt: 1 });
bookingSchema.index({ 'devotee.phone': 1, dateKey: 1 });
bookingSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true });
bookingSchema.index({ paymentRef: 1 }, { partialFilterExpression: { paymentRef: { $gt: '' } } });   // same UTR on two bookings

export default mongoose.model('Booking', bookingSchema);
