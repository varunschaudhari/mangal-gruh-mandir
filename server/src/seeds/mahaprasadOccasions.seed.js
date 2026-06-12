import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import MahaprasadOccasion from '../models/MahaprasadOccasion.js';

const OCCASIONS = [
  { name: 'Ekadashi',         sortOrder: 1  },
  { name: 'Ram Navami',       sortOrder: 2  },
  { name: 'Janmashtami',      sortOrder: 3  },
  { name: 'Navratri',         sortOrder: 4  },
  { name: 'Ganesh Utsav',     sortOrder: 5  },
  { name: 'Diwali',           sortOrder: 6  },
  { name: 'Holi',             sortOrder: 7  },
  { name: 'Maha Shivratri',   sortOrder: 8  },
  { name: 'Annadan Seva',     sortOrder: 9  },
  { name: 'Prasad Sponsorship', sortOrder: 10 },
  { name: 'Temple Anniversary', sortOrder: 11 },
  { name: 'Special Programme',  sortOrder: 12 },
];

const seed = async () => {
  await connectDB();
  let created = 0;
  for (const o of OCCASIONS) {
    const result = await MahaprasadOccasion.updateOne({ name: o.name }, { $setOnInsert: o }, { upsert: true });
    if (result.upsertedCount) created++;
  }
  console.log(`✓ ${created} new Mahaprasad occasions seeded (${OCCASIONS.length - created} already existed)`);
  await mongoose.disconnect();
};

seed().catch((e) => { console.error(e); process.exit(1); });
