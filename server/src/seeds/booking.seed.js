// Seva types and batches as published on mangalagrahmandir.in (Oct 2026). Edit them later in
// Bookings → Setup. Batch capacity isn't public — 50 is a placeholder to correct there.

export const DEFAULT_BATCH_CAPACITY = 50;

export const sevaTypesSeed = [
  {
    name: 'Abhishek', nameMr: 'अभिषेक', code: 'ABH', price: 810, schedule: 'batch', duration: '1 hour', sortOrder: 1,
    description: 'Abhishek puja in a batch, in the devotee\'s presence.',
  },
  {
    name: 'Post Abhishek', nameMr: 'पोस्ट अभिषेक', code: 'POST', price: 810, schedule: 'none', needsPostalAddress: true, sortOrder: 2,
    description: 'Abhishek performed on behalf of devotees who cannot come (age, illness, work); prasad sent by post.',
  },
  {
    name: 'Hawanatmak Shanti Abhishek', nameMr: 'हवनात्मक शांती अभिषेक', code: 'HAWAN', price: 6300, schedule: 'batch', duration: '3 hours', sortOrder: 3,
    description: 'Vedic recitation, Ganesh, Matruka, Shri Mangal and Navagraha puja, Rudrakalash puja and havan. Family may attend.',
  },
  {
    name: 'Panchamrit Abhishek', nameMr: 'पंचामृत अभिषेक', code: 'PANCH', price: 7200, schedule: 'slot',
    slotTime: '5:00 AM – 7:00 AM', weekdays: [2], dailyLimit: 1, duration: '2 hours', sortOrder: 4,
    description: 'On the self-manifested idol of Shri Mangal Dev, for one (joint) family at a time. Tuesdays.',
  },
  {
    name: 'Nitya Prabhat Shri Mangal Abhishek', nameMr: 'नित्य प्रभात श्री मंगळ अभिषेक', code: 'NITYA', price: 5400, schedule: 'slot',
    slotTime: 'Early morning – 7:00 AM', weekdays: [0, 1, 2, 3, 4, 5, 6], dailyLimit: 0, sortOrder: 5,
    description: 'Performed every day; devotees register their names.',
  },
  {
    name: 'Bhomyag', nameMr: 'भौमयाग', code: 'BHOM', price: 9000, schedule: 'arrangement', duration: '3–4 hours', sortOrder: 6,
    description: 'For professions linked to land and soil. Date confirmed with the temple office.',
  },
];

// Each batch is tied to one hall (as on the website's booking form).
export const batchesSeed = [
  ['07:00', '08:15', 'H1'], ['07:30', '08:45', 'H2'],
  ['08:30', '09:45', 'H1'], ['09:00', '10:15', 'H2'], ['09:00', '10:15', 'H3'],
  ['10:00', '11:15', 'H1'], ['10:30', '11:45', 'H2'], ['10:30', '11:45', 'H3'],
  ['11:30', '12:45', 'H1'], ['12:00', '13:15', 'H2'], ['12:10', '13:30', 'H3'],
  ['13:00', '14:15', 'H1'], ['13:30', '14:45', 'H2'], ['13:45', '15:00', 'H3'],
].map(([start, end, hall]) => ({ start, end, hall, capacity: DEFAULT_BATCH_CAPACITY }));
