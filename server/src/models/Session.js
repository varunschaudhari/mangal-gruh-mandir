import mongoose from 'mongoose';

// One signed-in device (browser, desktop app or phone). The refresh token handed to the
// device is "<session id>.<secret>"; only a SHA-256 hash of the secret is stored here.
const sessionSchema = new mongoose.Schema(
  {
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    secretHash: { type: String, required: true },
    client:     { type: String, enum: ['web', 'app'], default: 'web' },
    userAgent:  { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    // MongoDB deletes the session once this passes (TTL index below).
    expiresAt:  { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
