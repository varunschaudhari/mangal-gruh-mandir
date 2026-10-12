import { z } from 'zod';
import { DONATION_TYPES, PAYMENT_MODES } from '../models/Donation.js';
import {
  idParams, number, objectId, optionalBoolean, optionalDate, optionalNumber, optionalObjectId,
  optionalOneOf, optionalPan, optionalText, paging,
} from './common.js';

const params = idParams('Donation id');

const kindItem = z.object({
  product: objectId('Item'),
  quantity: number('Item quantity', { positive: true }),
  unit: optionalObjectId('Unit'),
  department: optionalObjectId('Department'),
  estimatedValue: optionalNumber('Estimated value', { min: 0 }),
});

export const createDonation = {
  body: z.object({
    donationType: optionalOneOf(DONATION_TYPES, 'Donation type'),
    date: optionalDate('Date'),
    donor: optionalObjectId('Donor'),
    donorName: optionalText('Donor name', { max: 150 }),
    donorPhone: optionalText('Phone', { max: 20 }),
    panNumber: optionalPan(),
    is80G: optionalBoolean('80G'),
    occasion: optionalObjectId('Occasion'),
    cashAmount: optionalNumber('Cash amount', { min: 0, max: 1e9 }),
    paymentMode: optionalOneOf(PAYMENT_MODES, 'Payment mode'),
    paymentRef: optionalText('Payment reference', { max: 100 }),
    kindItems: z.array(kindItem, { error: 'In-kind items must be a list' }).max(50, 'At most 50 in-kind items').optional(),
    notes: optionalText('Notes', { max: 1000 }),
  }),
};

const filters = {
  type: optionalOneOf(DONATION_TYPES, 'Donation type'),
  donor: optionalObjectId('Donor'),
  from: optionalDate('From date'),
  to: optionalDate('To date'),
};

export const listDonations = {
  query: z.object({ ...filters, occasion: optionalObjectId('Occasion'), search: optionalText('Search', { max: 100 }), ...paging }),
};
export const exportDonations = { query: z.object(filters) };
export const donationStats = { query: z.object({ from: optionalDate('From date') }) };
export const donationById = { params };
export const voidDonation = { params, body: z.object({ voidReason: optionalText('Void reason', { max: 500 }) }) };
export const donorStatement = { params: z.object({ donorId: objectId('Donor') }) };
export const lookupDonor = { query: z.object({ phone: optionalText('Phone', { max: 20 }) }) };
