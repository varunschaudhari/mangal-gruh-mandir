import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

const run = async () => {
  await connectDB();
  const email    = process.env.SEED_ADMIN_EMAIL    || 'admin@mandir.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@1234';

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    console.log(`No user found with email: ${email}`);
    process.exit(1);
  }

  user.password = password;
  user.isActive = true;
  await user.save();
  console.log(`✓ Password reset for ${email} → ${password}`);
  await mongoose.disconnect();
};

run().catch((e) => { console.error(e); process.exit(1); });
