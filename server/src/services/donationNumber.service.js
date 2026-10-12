import Donation from '../models/Donation.js';
import { dayKey, nextNumber } from './sequence.service.js';

/** DON-YYYYMMDD-NNN, numbered per day. */
export function generateDonationNumber() {
  return nextNumber({ prefix: `DON-${dayKey()}-`, sources: [{ model: Donation, field: 'donationNumber' }] });
}
