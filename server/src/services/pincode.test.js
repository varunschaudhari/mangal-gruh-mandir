import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPincode, summarisePostOffices } from './pincode.service.js';
import { formatAddress } from '../utils/address.js';

const po = (Name, Block, District, State = 'Maharashtra') => ({ Name, Block, District, State });

test('a PIN covering many villages: most common taluka, district and state; areas listed', () => {
  const s = summarisePostOffices([
    po('Amalner (Jalgaon)', 'Amalner', 'Jalgaon'),
    po('Amalner Pratap Nagar', 'Amalner', 'Jalgaon'),
    po('Amba Pimpri', 'Parola', 'Jalgaon'),
    po('Bhorte B.O', 'Amalner', 'Jalgaon'),
  ]);
  assert.equal(s.state, 'Maharashtra');
  assert.equal(s.district, 'Jalgaon');
  assert.equal(s.city, 'Amalner');
  assert.deepEqual(s.areas, ['Amalner', 'Amalner Pratap Nagar', 'Amba Pimpri', 'Bhorte']);
});

test('a city PIN with no taluka uses the district; an odd post office from another district is outvoted', () => {
  const s = summarisePostOffices([
    po('Bazargate', 'NA', 'Mumbai'), po('M.P.T. S.O', 'NA', 'Mumbai'), po('Elephanta Caves Po', 'Uran', 'Raigarh(MH)'),
  ]);
  assert.equal(s.district, 'Mumbai');
  assert.equal(s.city, 'Mumbai');
  assert.ok(s.areas.includes('M.P.T.'));
});

test('PIN codes are 6 digits not starting with 0', () => {
  assert.equal(isPincode('425401'), true);
  assert.equal(isPincode('025401'), false);
  assert.equal(isPincode('42540'), false);
  assert.equal(isPincode('42540a'), false);
});

test('address parts become one line, repeated names written once', () => {
  assert.equal(formatAddress({ address: '12, Ganesh Peth', area: 'Amalner', city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', pincode: '425401' }),
    '12, Ganesh Peth, Amalner, Dist. Jalgaon, Maharashtra – 425401');
  assert.equal(formatAddress({ address: 'Shop 4', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra' }), 'Shop 4, Mumbai, Maharashtra');
  assert.equal(formatAddress({ address: 'Old free text address' }), 'Old free text address');
  assert.equal(formatAddress({}), '');
});
