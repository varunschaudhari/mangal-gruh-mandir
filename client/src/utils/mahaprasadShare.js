// The devotee's Mahaprasad coupon numbers as a WhatsApp message from the counter (works without
// the WhatsApp API: opens WhatsApp with the message ready). Same wording as the automatic message
// (server/src/services/mahaprasadNotify.service.js).

/** One number as it is; a run from the same day as "MP-20261013-001 to 010 (10)"; else the first few. */
export function couponListText(numbers = []) {
  if (!numbers.length) return '';
  if (numbers.length === 1) return numbers[0];
  const parts = numbers.map((n) => /^(.*-)(\d+)$/.exec(n));
  const samePrefix = parts.every((p) => p && p[1] === parts[0][1]);
  const consecutive = samePrefix && parts.every((p, i) => i === 0 || Number(p[2]) === Number(parts[i - 1][2]) + 1);
  if (consecutive) return `${numbers[0]} to ${parts.at(-1)[2]} (${numbers.length})`;
  const shown = numbers.slice(0, 6).join(', ');
  return numbers.length > 6 ? `${shown} +${numbers.length - 6} more` : shown;
}

/**
 * The message: coupon numbers, date and number of persons (in WhatsApp bold, for the food counter
 * to read) — and `link`, the page with the coupons' QR (/m/<token>) to scan off the phone.
 */
export function couponWhatsAppText({ numbers = [], date, persons, link }) {
  const when = new Date(date || Date.now()).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const people = persons || numbers.length;
  return `Namaste! Your Mahaprasad coupon${numbers.length > 1 ? 's' : ''} at Shri Mangal Grah Mandir, Amalner for ${when}:`
    + `\n${couponListText(numbers)} · *${people} ${people === 1 ? 'person' : 'persons'}*`
    + (link ? `\nYour coupon QR: ${link}\nPlease show it at the Mahaprasad hall.` : '\nPlease show this at the Mahaprasad hall.');
}

/** wa.me link to the devotee with the message ready (text only — see couponShare.js for the picture). */
export function couponWhatsAppUrl(batch) {
  return `https://wa.me/91${batch.mobile}?text=${encodeURIComponent(couponWhatsAppText(batch))}`;
}
