// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── What the counter talks to ───────────────────────────────────────────────
vi.mock('../../api/mahaprasad.api.js', () => ({
  issueCoupons: vi.fn(),
  getDailySummary: vi.fn(),
  printCoupons: vi.fn(),
  getBatches: vi.fn(),
  getCashDrawer: vi.fn(),
  voidBatch: vi.fn(),
}));
vi.mock('../../api/mahaprasadOccasion.api.js', () => ({ getOccasions: vi.fn() }));
vi.mock('../../api/settings.api.js', () => ({ getSettings: vi.fn() }));
vi.mock('../../utils/thermalPrint.js', () => ({
  printThermalCoupon: vi.fn(), printShiftSummary: vi.fn(), isConnected: () => false, connectToQzTray: vi.fn(),
}));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Counter Staff' } }) }));
vi.mock('../../utils/offlineStore.js', () => ({}));
vi.mock('../../hooks/useOfflineMode.js', () => ({
  useOfflineMode: () => ({
    isOnline: true, poolCount: 0, offlineIssued: 0, syncPending: 0, isSyncing: false, isPrefetching: false,
    prefetch: vi.fn(), sync: vi.fn(), refreshCounts: vi.fn(), getOfflineUser: vi.fn(), getOfflineSettings: vi.fn(),
  }),
}));
vi.mock('../../components/Layout/AppBarContext.jsx', () => ({ useSetAppBarTitle: () => {} }));
vi.mock('../../hooks/useMediaQuery.js', () => ({ useMediaQuery: () => false }));
vi.mock('../../utils/fileSaver.js', () => ({ openFile: vi.fn(), shareText: vi.fn() }));
vi.mock('../../utils/platform.js', () => ({ isNative: false, platform: 'web' }));
vi.mock('../../utils/bluetoothPrinter.js', () => ({ useBluetoothPrinter: () => null }));
vi.mock('../../utils/haptics.js', () => ({ default: { tap: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('./CashDrawer.jsx', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import toast from 'react-hot-toast';
import { getBatches, getCashDrawer, getDailySummary, issueCoupons } from '../../api/mahaprasad.api.js';
import { getOccasions } from '../../api/mahaprasadOccasion.api.js';
import { getSettings } from '../../api/settings.api.js';
import MahaprasadCounter from './MahaprasadCounter.jsx';

const ok = (data) => Promise.resolve({ data: { data } });

function setup({ summary = {}, occasions = [] } = {}) {
  getDailySummary.mockImplementation(() => ok({ pricePerPlate: 50, cap: 0, total: 0, myCount: 0, myCash: 0, myUpi: 0, ...summary }));
  getCashDrawer.mockImplementation(() => ok({ counts: { 10: 20, 20: 20, 50: 20, 100: 20, 500: 2 }, isFloatSet: true }));
  getSettings.mockImplementation(() => ok({ mahaprasadDayPricing: {} }));
  getOccasions.mockImplementation(() => ok(occasions));
  getBatches.mockImplementation(() => ok([]));
  issueCoupons.mockImplementation((body) => ok({
    coupons: Array.from({ length: body.isGroup ? 1 : body.quantity }, (_, i) => ({
      _id: `c${i}`, couponNumber: `MP-20261012-00${i + 1}`, amount: body.type === 'paid' ? 50 : 0, date: '2026-10-12', type: body.type,
    })),
    drawerChange: null,
  }));

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><MahaprasadCounter /></MemoryRouter>
    </QueryClientProvider>,
  );
  return user;
}

// The big "Issue …" button at the bottom
const issueButton = () => screen.getByRole('button', { name: /^Issue/ });
// A banknote tile shows "₹" and the value (plus a key hint or a ×count badge)
const noteTile = (n) => screen.getAllByRole('button').find((b) => b.textContent.replace(/\[.\]|×\d+/g, '').trim() === `₹${n}`);
const sentBody = () => issueCoupons.mock.calls.at(-1)[0];
// Every issue needs the devotee's mobile number first
const typeMobile = (user, number = '98811 80662') => user.type(screen.getByLabelText(/Mobile number/), number);

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});
afterEach(cleanup);

describe('Mahaprasad counter', () => {
  it('shows the price for the people at the counter and issues one paid coupon, paid exactly in cash', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('Issue 1 Coupon · ₹50'));
    await typeMobile(user);

    await user.click(screen.getByText('Exact').closest('button'));
    await user.click(issueButton());

    await waitFor(() => expect(issueCoupons).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ quantity: 1, type: 'paid', isGroup: false, paymentMode: 'cash', amountReceived: 50, occasion: '' });
    expect(sentBody().receivedNotes).toBeUndefined();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 coupon issued'));
  });

  it('adding people makes a group coupon with the total price', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(screen.getByRole('button', { name: 'One more person' }));
    await user.click(screen.getByRole('button', { name: 'One more person' }));
    expect(issueButton()).toHaveTextContent('Issue Group — 3 persons · ₹150');

    await user.click(screen.getByText('Exact').closest('button'));
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ quantity: 3, isGroup: true, type: 'paid', amountReceived: 150 });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Group coupon (3 persons) issued'));
  });

  it('sends the notes the devotee handed over, so the cash drawer and change add up', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(noteTile(100));
    expect(screen.getByText('Return to customer')).toBeInTheDocument();
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ paymentMode: 'cash', amountReceived: 100, receivedNotes: [100] });
  });

  it('does not issue when the cash handed over is less than the price', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(noteTile(20));
    await user.click(issueButton());
    await new Promise((r) => setTimeout(r, 50));
    expect(issueCoupons).not.toHaveBeenCalled();
  });

  it('UPI payments send no cash amount or notes', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(screen.getByRole('button', { name: 'UPI' }));
    expect(screen.getByText('₹50 via UPI')).toBeInTheDocument();
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ paymentMode: 'upi', type: 'paid' });
    expect(sentBody().amountReceived).toBeUndefined();
    expect(sentBody().receivedNotes).toBeUndefined();
  });

  it('free coupons carry the occasion chosen from the list', async () => {
    const user = setup({ occasions: [{ _id: 'o1', name: 'Guru Purnima' }] });
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(screen.getByText('Free Seva').closest('button'));
    await user.selectOptions(await screen.findByRole('combobox'), 'Guru Purnima');
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ type: 'free', occasion: 'Guru Purnima' });
    expect(sentBody().paymentMode).toBeUndefined();
  });

  it('free coupons carry a typed occasion when no occasions are set up', async () => {
    const user = setup({ occasions: [] });
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(screen.getByText('Free Seva').closest('button'));
    await user.type(screen.getByPlaceholderText('Occasion (optional)…'), 'Annadan');
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ type: 'free', occasion: 'Annadan' });
  });

  it('does not issue without the devotee\'s mobile number, and says so', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await user.click(screen.getByText('Exact').closest('button'));
    await user.click(issueButton());
    await new Promise((r) => setTimeout(r, 50));
    expect(issueCoupons).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Enter the devotee’s 10-digit mobile number', expect.anything());
    expect(screen.getByLabelText(/Mobile number/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends the mobile number cleaned to 10 digits, then clears it for the next devotee', async () => {
    const user = setup();
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await user.click(screen.getByLabelText(/Mobile number/));
    await user.paste('+91 98220 12345');   // a number pasted from a message
    await user.click(screen.getByText('Exact').closest('button'));
    await user.click(issueButton());
    await waitFor(() => expect(issueCoupons).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ mobile: '9822012345' });
    await waitFor(() => expect(screen.getByLabelText(/Mobile number/)).toHaveValue(''));
    expect(screen.getAllByRole('link', { name: /WhatsApp/ })[0].getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919822012345\?text=/);
  });

  it('when the day\'s limit is reached the issue button is disabled and says why', async () => {
    setup({ summary: { cap: 10, total: 10 } });
    await screen.findByText('Daily cap of 10 reached — no more coupons can be issued for this date.');
    expect(issueButton()).toBeDisabled();
  });

  it('shows the server\'s reason when issuing fails', async () => {
    const user = setup();
    issueCoupons.mockImplementation(() => Promise.reject({ response: { data: { message: 'Only 2 more persons can be issued today (cap: 300)' } } }));
    await waitFor(() => expect(issueButton()).toHaveTextContent('₹50'));
    await typeMobile(user);
    await user.click(screen.getByText('Exact').closest('button'));
    await user.click(issueButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only 2 more persons can be issued today (cap: 300)'));
  });
});
