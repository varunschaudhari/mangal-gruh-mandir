// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── What the counter talks to ───────────────────────────────────────────────
vi.mock('../../api/booking.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createBooking: vi.fn(),
  getAvailability: vi.fn(),
  getBookingOptions: vi.fn(),
  getBookingSummary: vi.fn(),
  lookupDevotee: vi.fn(),
}));
vi.mock('../../api/pincode.api.js', () => ({ getPincode: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Counter Staff', role: 'booking_counter' } }) }));
vi.mock('../../hooks/usePermissions.js', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../../hooks/useMediaQuery.js', () => ({ useMediaQuery: () => true }));
vi.mock('../../utils/platform.js', async (importOriginal) => ({ ...(await importOriginal()), isNative: false }));
vi.mock('../../utils/haptics.js', () => ({ default: { tap: vi.fn(), select: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../utils/bookingReceipt.js', () => ({ printBookingSlip: vi.fn(), printBookingReceipt: vi.fn(), whatsappShareUrl: () => '' }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }) }));

import toast from 'react-hot-toast';
import { createBooking, getAvailability, getBookingOptions, getBookingSummary, lookupDevotee } from '../../api/booking.api.js';
import { getPincode } from '../../api/pincode.api.js';
import { localDateStr } from '../../utils/formatters.js';
import BookingCounter from './BookingCounter.jsx';

const ok = (data) => Promise.resolve({ data: { data } });
const today = localDateStr();

const ABHISHEK = { _id: 's1', name: 'Abhishek', nameMr: 'अभिषेक', code: 'ABH', price: 501, schedule: 'batch', isActive: true, maxPeople: 4, sortOrder: 1 };
const POSTAL = { _id: 's2', name: 'Prasad by Post', nameMr: 'टपालाने प्रसाद', code: 'POST', price: 251, schedule: 'none', needsPostalAddress: true, isActive: true, sortOrder: 2 };
const BATCH = { _id: 'b1', start: '07:00', end: '08:15', label: '', hall: 'H1', left: 5, capacity: 50, ended: false };

function setup({ devotee = null } = {}) {
  getBookingOptions.mockImplementation(() => ok({ sevaTypes: [ABHISHEK, POSTAL], settings: { maxAdvanceDays: 90, capacityUnit: 'bookings' } }));
  getAvailability.mockImplementation(() => ok({ open: true, capacityUnit: 'bookings', batches: [BATCH] }));
  getBookingSummary.mockImplementation(() => ok({ totals: { count: 0, amount: 0 } }));
  lookupDevotee.mockImplementation(() => ok(devotee ? { devotee, upcoming: [], peopleCount: 1 } : { devotee: null, upcoming: [] }));
  getPincode.mockImplementation((pin) => ok({ pin, city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', areas: ['Amalner'] }));
  createBooking.mockImplementation((body) => ok({
    _id: 'bk1', receiptNumber: 'ABH-0001', serial: 1, sevaType: body.sevaType, sevaName: 'Abhishek', schedule: body.batch ? 'batch' : 'none',
    devotee: body.devotee, peopleCount: body.peopleCount, amount: 501, paymentMode: body.paymentMode, dateKey: body.date, batch: body.batch,
    batchLabel: '7:00 AM – 8:15 AM', hall: 'H1', status: 'booked',
  }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><BookingCounter /></MemoryRouter>
    </QueryClientProvider>,
  );
  return user;
}

const bookButton = () => screen.getByRole('button', { name: /^Book · ₹/ });
const sentBody = () => createBooking.mock.calls.at(-1)[0];
const lastError = () => toast.error.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe('Pooja Booking counter', () => {
  it('asks for a mobile number first and books nothing', async () => {
    const user = setup();
    await waitFor(() => expect(bookButton()).toHaveTextContent('Book · ₹501'));
    await user.click(bookButton());
    expect(lastError()).toBe('Enter a valid 10-digit mobile number');
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('asks for the devotee name when only the number is given', async () => {
    const user = setup();
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.click(bookButton());
    expect(lastError()).toBe('Enter the devotee name');
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('books a batch seva with the first open batch and sends the right details', async () => {
    const user = setup();
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/Devotee name/), '  Ramesh   Patil ');
    await waitFor(() => expect(screen.getByText(/Chosen/)).toBeInTheDocument());   // batch picked automatically
    await user.click(bookButton());

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body).toMatchObject({ sevaType: 's1', date: today, batch: 'b1', peopleCount: 1, paymentMode: 'cash', paymentRef: '' });
    expect(body.devotee).toMatchObject({ name: 'Ramesh Patil', phone: '9876543210' });
    expect(body.clientRequestId).toEqual(expect.any(String));
    expect(await screen.findByText('Booked')).toBeInTheDocument();
  });

  it('a postal seva needs the address and a PIN code; the PIN fills city and state', async () => {
    const user = setup();
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.click(screen.getByRole('radio', { name: /Prasad by Post/ }));
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/Devotee name/), 'Sunita Joshi');

    await user.click(bookButton());
    expect(lastError()).toBe('Postal address is needed for this seva');

    await user.type(screen.getByPlaceholderText('House / building, street'), '12, Ganesh Peth');
    await user.click(bookButton());
    expect(lastError()).toBe('PIN code is needed for the postal address');
    expect(createBooking).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText('425401'), '425401');
    await waitFor(() => expect(screen.getByDisplayValue('Maharashtra')).toBeInTheDocument());
    await user.click(bookButton());

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body.sevaType).toBe('s2');
    expect(body.devotee).toMatchObject({ address: '12, Ganesh Peth', pincode: '425401', city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra' });
    expect(body).not.toHaveProperty('date');
    expect(body).not.toHaveProperty('batch');
  });

  it('a returning devotee\'s details are filled in from the mobile number', async () => {
    const user = setup({ devotee: { name: 'Ramesh Patil', phone: '9876543210', gotra: 'Kashyap', address: '5, Station Road', pincode: '425401', city: 'Amalner', state: 'Maharashtra' } });
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await waitFor(() => expect(screen.getByLabelText(/Devotee name/)).toHaveValue('Ramesh Patil'));
    expect(lookupDevotee).toHaveBeenCalledWith('9876543210');
  });

  it('UPI payments send the reference typed by the staff', async () => {
    const user = setup();
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/Devotee name/), 'Ramesh Patil');
    await user.click(screen.getByRole('radio', { name: /UPI/ }));
    await user.type(screen.getByLabelText('UPI reference (optional)'), 'UTR998877');
    await waitFor(() => expect(screen.getByText(/Chosen/)).toBeInTheDocument());
    await user.click(bookButton());
    await waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ paymentMode: 'upi', paymentRef: 'UTR998877' });
  });

  it('shows the server\'s reason when the booking is refused', async () => {
    const user = setup();
    createBooking.mockImplementation(() => Promise.reject({ response: { status: 400, data: { message: 'Bookings are closed on this date' } } }));
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/Devotee name/), 'Ramesh Patil');
    await waitFor(() => expect(screen.getByText(/Chosen/)).toBeInTheDocument());
    await user.click(bookButton());
    await waitFor(() => expect(lastError()).toBe('Bookings are closed on this date'));
  });

  it('a full batch is refused before anything is sent', async () => {
    getAvailability.mockReset();
    const user = setup();
    getAvailability.mockImplementation(() => ok({ open: true, capacityUnit: 'bookings', batches: [{ ...BATCH, left: 0 }] }));
    await waitFor(() => expect(bookButton()).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.type(screen.getByLabelText(/Devotee name/), 'Ramesh Patil');
    await user.click(bookButton());
    expect(lastError()).toMatch(/batch/i);
    expect(createBooking).not.toHaveBeenCalled();
  });
});
