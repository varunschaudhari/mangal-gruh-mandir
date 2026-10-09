import mongoose from 'mongoose';

// A phone running the mobile app, registered for push notifications for the signed-in user.
// One token = one app install; re-registering moves it to whoever is signed in now.
const deviceTokenSchema = new mongoose.Schema(
  {
    token:      { type: String, required: true, unique: true },
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform:   { type: String, enum: ['android', 'ios'], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model('DeviceToken', deviceTokenSchema);
