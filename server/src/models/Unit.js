import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['weight', 'volume', 'count', 'other'], default: 'count' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Unit', unitSchema);
