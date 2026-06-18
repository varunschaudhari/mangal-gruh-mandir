import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mangal';

const userSchema = new mongoose.Schema({
  name:     String,
  email:    { type: String, unique: true, lowercase: true },
  password: String,
  role:     { type: String, default: 'admin' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB:', MONGO_URI);

const email    = 'admin@mgm.com';
const password = 'Admin@123';

const exists = await User.findOne({ email });
if (exists) {
  console.log('User already exists:', email);
} else {
  const hashed = await bcrypt.hash(password, 12);
  await User.create({ name: 'Admin', email, password: hashed, role: 'admin', isActive: true });
  console.log('Admin user created:');
  console.log('  Email:   ', email);
  console.log('  Password:', password);
}

await mongoose.disconnect();
