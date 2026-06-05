import mongoose from 'mongoose';

const donationOccasionSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, unique: true },
    notes:     { type: String, default: '' },
    isActive:  { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('DonationOccasion', donationOccasionSchema);
