import mongoose from 'mongoose';

const dailyCounterSchema = new mongoose.Schema({
  module: { type: String, required: true },
  date:   { type: String, required: true }, // YYYYMMDD
  count:  { type: Number, default: 0 },
}, { timestamps: false });

dailyCounterSchema.index({ module: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyCounter', dailyCounterSchema);
