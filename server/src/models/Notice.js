import mongoose from 'mongoose';

// A notice on the notice board. Devotees see theirs on the public notice page (/notices) and
// along the bottom of the TV screens; staff see theirs on the Notice Board in the app and get a
// phone notification when it goes up. Posted by roles with notices:manage. Text is typed in
// Marathi, Hindi and/or English — each reader gets their language, else another one that's filled in.

export const NOTICE_LANGUAGES = ['mr', 'hi', 'en'];
export const NOTICE_AUDIENCES = ['both', 'devotees', 'staff'];

const inLanguages = (max) => new mongoose.Schema(
  Object.fromEntries(NOTICE_LANGUAGES.map((l) => [l, { type: String, trim: true, maxlength: max, default: '' }])),
  { _id: false },
);

const noticeSchema = new mongoose.Schema(
  {
    title:    { type: inLanguages(150), default: () => ({}) },
    body:     { type: inLanguages(2000), default: () => ({}) },
    audience: { type: String, enum: NOTICE_AUDIENCES, default: 'both' },
    isActive: { type: Boolean, default: true },     // false = hidden (kept, can be shown again)
    // When staff were sent the phone notification — once per notice, the first time it is up
    // for staff (editing the text doesn't notify again)
    notifiedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

noticeSchema.index({ isActive: 1, audience: 1, createdAt: -1 });

/** The audiences that include devotees / staff */
export const FOR_DEVOTEES = ['both', 'devotees'];
export const FOR_STAFF = ['both', 'staff'];

/** The notice's text for a phone notification: Marathi first (staff read Marathi), else the others */
export const firstFilled = (field) => NOTICE_LANGUAGES.map((l) => field?.[l]).find((s) => s && s.trim()) || '';

export default mongoose.model('Notice', noticeSchema);
