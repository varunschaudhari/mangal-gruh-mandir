import mongoose from 'mongoose';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// A time slot in one hall (Setup → Batches). Batch-scheduled seva types book into these.
const bookingBatchSchema = new mongoose.Schema(
  {
    start:     { type: String, required: true, match: HHMM },   // "07:00"
    end:       { type: String, required: true, match: HHMM },   // "08:15"
    hall:      { type: String, required: true, trim: true },    // "H1"
    capacity:  { type: Number, required: true, min: 1 },        // see BookingSettings.capacityUnit
    weekdays:  { type: [Number], default: () => [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    sevaTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SevaType' }], // empty = every batch seva
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true },
);

bookingBatchSchema.index({ isActive: 1, start: 1, hall: 1 });

export default mongoose.model('BookingBatch', bookingBatchSchema);
