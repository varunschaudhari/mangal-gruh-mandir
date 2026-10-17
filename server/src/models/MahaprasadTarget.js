import mongoose from 'mongoose';

// How much Mahaprasad is to be given in a day — a target shown on the Mahaprasad dashboard and
// TV screen. Nothing is stopped by it (the daily limit that stops issuing is Settings →
// mahaprasadDailyCap). key 'default' = the usual daily total; key 'YYYY-MM-DD' = that day only
// (a festival). Without either, the total is DEFAULT_TARGET.
export const DEFAULT_TARGET = 2500;

const mahaprasadTargetSchema = new mongoose.Schema({
  key:    { type: String, required: true, unique: true, match: /^(default|\d{4}-\d{2}-\d{2})$/ },
  target: { type: Number, required: true, min: 0, max: 1000000 },
  setBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('MahaprasadTarget', mahaprasadTargetSchema);
