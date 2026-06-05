import Donation from '../models/Donation.js';

export async function generateDonationNumber() {
  const dateStr = formatDateKey(new Date());
  const prefix  = `DON-${dateStr}-`;

  const last = await Donation.findOne(
    { donationNumber: { $regex: `^${prefix}` } },
    { donationNumber: 1 },
    { sort: { donationNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.donationNumber) {
    const parts = last.donationNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function formatDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
