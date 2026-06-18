import 'dotenv/config';
import mongoose from 'mongoose';
import { rolesSeed } from './src/seeds/roles.seed.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mangal';

const roleSchema = new mongoose.Schema({
  slug:        { type: String, unique: true },
  name:        String,
  description: String,
  permissions: [String],
  isSystem:    Boolean,
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

const Role = mongoose.model('Role', roleSchema);

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB:', MONGO_URI);

for (const role of rolesSeed) {
  await Role.updateOne({ slug: role.slug }, { $set: role }, { upsert: true });
  console.log('Upserted role:', role.slug);
}

await mongoose.disconnect();
console.log('Done.');
