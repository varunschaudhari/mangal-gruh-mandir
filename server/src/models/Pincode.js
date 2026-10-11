import mongoose from 'mongoose';

// Cache of India Post PIN code look-ups (a PIN's post offices hardly ever change), so each PIN
// is fetched from api.postalpincode.in only once.
const pincodeSchema = new mongoose.Schema(
  {
    pin:      { type: String, required: true, unique: true, match: /^\d{6}$/ },
    found:    { type: Boolean, default: true },
    state:    { type: String, default: '' },
    district: { type: String, default: '' },
    city:     { type: String, default: '' },      // taluka / town (India Post "Block")
    areas:    { type: [String], default: [] },    // post office names — villages / localities
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model('Pincode', pincodeSchema);
