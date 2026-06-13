import mongoose from 'mongoose';

// Denominations: counts keyed by string denomination value
// e.g. counts = { '1': 5, '2': 3, '5': 10, '10': 8, '20': 4, '50': 10, '100': 15, '500': 8 }
const mahaprasadCashDrawerSchema = new mongoose.Schema({
  date:          { type: String, required: true, unique: true, index: true }, // 'YYYYMMDD'
  counts:        { type: Object, default: () => ({ '1': 0, '2': 0, '5': 0, '10': 0, '20': 0, '50': 0, '100': 0, '500': 0 }) },
  openingCounts: { type: Object, default: () => ({}) }, // snapshot when float is set — never mutated after
  receivedCounts:{ type: Object, default: () => ({ '1': 0, '2': 0, '5': 0, '10': 0, '20': 0, '50': 0, '100': 0, '500': 0 }) },
  changeCounts:  { type: Object, default: () => ({ '1': 0, '2': 0, '5': 0, '10': 0, '20': 0, '50': 0, '100': 0, '500': 0 }) },
  isFloatSet:    { type: Boolean, default: false },
  openedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  openedAt:      { type: Date },
}, { timestamps: true });

export default mongoose.model('MahaprasadCashDrawer', mahaprasadCashDrawerSchema);
