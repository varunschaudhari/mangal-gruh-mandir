import mongoose from 'mongoose';
import singleton from './singleton.js';

// Single document with the attendance rules, shift timings and the biometric machine(s).
// Edited from Settings → Attendance.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },          // "Day", "Night", "Morning aarti"
  start: { type: String, required: true, match: HHMM },         // "08:00"
  end:   { type: String, required: true, match: HHMM },         // "17:00" — earlier than start = next morning
  kind:  { type: String, enum: ['day', 'night'], default: 'day' },
  short: { type: String, trim: true, maxlength: 3, default: '' }, // roster cell label, e.g. "D", "N"
  color: { type: String, default: '#f97316' },
  // Earlier timings, oldest first: each applied up to and including `until`. Changing the timing
  // never rewrites days already worked.
  past: { type: [{ _id: false, until: String, start: String, end: String, kind: String }], default: [] },
});

const deviceSchema = new mongoose.Schema({
  serial:     { type: String, required: true, trim: true },
  name:       { type: String, trim: true, default: '' },
  approved:   { type: Boolean, default: false },  // punches are only accepted from approved machines
  lastSeenAt: { type: Date },
  lastIp:     { type: String, default: '' },
  // The temple's internet address(es): "49.36.12.7, 49.36.12.*". Empty = any address (the serial
  // number alone is trusted — anyone who reads it off the machine could send punches).
  allowedIps: { type: String, trim: true, default: '' },
  blockedIp:  { type: String, default: '' },     // last refused attempt (approved serial, wrong address)
  blockedAt:  { type: Date },
}, { _id: false });

// Paid days off for everyone (festival holidays…). Someone rostered on that day works as usual.
const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  name: { type: String, trim: true, default: '' },
}, { _id: false });

const attendanceSettingsSchema = new mongoose.Schema(
  {
    shifts: {
      type: [shiftSchema],
      default: () => [
        { name: 'Day', start: '08:00', end: '17:00', kind: 'day', short: 'D', color: '#f59e0b' },
        { name: 'Night', start: '20:00', end: '05:00', kind: 'night', short: 'N', color: '#6366f1' },
      ],
    },
    graceMinutes:      { type: Number, default: 15, min: 0, max: 120 },
    halfDayBelowHours: { type: Number, default: 7, min: 0, max: 24 },  // worked less → half day
    absentBelowHours:  { type: Number, default: 4, min: 0, max: 24 },  // worked less → absent
    punchMergeMinutes: { type: Number, default: 2, min: 0, max: 30 },  // repeated punches within this are one
    latePenalty: {
      enabled:      { type: Boolean, default: false },
      freeLates:    { type: Number, default: 3, min: 0, max: 31 },     // per month, then each late = ½ day
    },
    defaultPaidLeavePerMonth: { type: Number, default: 3, min: 0, max: 31 },
    extraLeaveValidDays:      { type: Number, default: 60, min: 1, max: 366 },
    // Earlier values of the day rules, oldest first: each applied up to and including `until`
    rulesPast: {
      type: [{ _id: false, until: String, graceMinutes: Number, halfDayBelowHours: Number, absentBelowHours: Number, punchMergeMinutes: Number }],
      default: [],
    },
    devices: { type: [deviceSchema], default: [] },
    holidays: { type: [holidaySchema], default: [] },
  },
  { timestamps: true },
);

attendanceSettingsSchema.plugin(singleton);   // getOrCreate()

export default mongoose.model('AttendanceSettings', attendanceSettingsSchema);
