// Payment references at the booking counter. A UPI or card payment must carry a reference the
// cashier can match against the bank / UPI app / card-machine statement — for UPI the UTR (or
// at least its last 4 characters), for a card its last 4 digits or the approval code. Cash
// needs none. Used by the server (refuses the booking) and the counter screen (says why).

/** The reference as stored: spaces removed, at most 40 characters. */
export const cleanPaymentRef = (ref) => String(ref ?? '').replace(/\s+/g, '').slice(0, 40);

export const UPI_REF_MESSAGE = 'Enter the UPI reference (UTR) from the devotee’s payment screen — at least the last 4 digits';
export const CARD_REF_MESSAGE = 'Enter the card’s last 4 digits or the approval code from the card slip';

/** Why the reference won't do for this payment mode — '' when it is fine. */
export function paymentRefProblem(mode, ref) {
  if (mode !== 'upi' && mode !== 'card') return '';
  if (cleanPaymentRef(ref).replace(/[^A-Za-z0-9]/g, '').length >= 4) return '';
  return mode === 'upi' ? UPI_REF_MESSAGE : CARD_REF_MESSAGE;
}
