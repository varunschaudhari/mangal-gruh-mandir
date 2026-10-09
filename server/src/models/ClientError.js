import mongoose from 'mongoose';

// A crash reported by the web app, Electron app or mobile apps (see routes/clientError.routes.js).
// Repeats of the same error (same message + top of stack) are counted on one document.
const clientErrorSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true },
    message:     { type: String, required: true },
    stack:       { type: String, default: '' },
    source:      { type: String, enum: ['screen', 'script', 'promise'], default: 'script' },
    path:        { type: String, default: '' },       // app route where it happened
    app:         { type: String, enum: ['web', 'android', 'ios', 'electron'], default: 'web' },
    appVersion:  { type: String, default: '' },
    userAgent:   { type: String, default: '' },
    lastUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    count:       { type: Number, default: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt:  { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Forget errors that haven't happened for 90 days.
clientErrorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('ClientError', clientErrorSchema);
