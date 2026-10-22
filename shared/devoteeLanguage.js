// The languages devotees get their messages, slips and receipts in. Staff screens are English and
// Marathi only; what devotees see is also in Hindi. Used by the server (WhatsApp, the slip
// picture) and the app (printed slip, receipt page).

export const DEVOTEE_LANGUAGES = ['mr', 'hi', 'en'];

/** Dates for a language: Marathi with Devanagari digits (as the messages always had), Hindi with 1 2 3. */
export const localeOf = (lang) => ({ mr: 'mr-IN', hi: 'hi-IN' }[lang] || 'en-IN');

/**
 * Sent instead when Meta has no approved template in the chosen language: Marathi ⇄ English,
 * and Hindi → English (a Hindi reader may not read Marathi).
 */
export const fallbackOf = (lang) => (lang === 'en' ? 'mr' : 'en');

// What the booking slip and receipt print. Marathi bookings keep the English labels (with the
// Marathi temple, hall and seva names) as before; a Hindi booking gets it all in Hindi.
const RECEIPT_TEXT = {
  en: {
    slipTitle: 'ABHISHEK / PUJA RECEIPT', voided: '*** VOIDED ***', voidMark: 'VOIDED',
    receipt: 'Receipt', booked: 'Booked', pujaDate: 'Puja date', batch: 'Batch', time: 'Time',
    hallBox: 'HALL', serialBox: 'SERIAL', gotra: 'Gotra', family: 'Family', people: 'People', postTo: 'Post to',
    cancelled: 'This booking was cancelled — not valid for entry',
    showQr: 'Show this QR code at the hall entrance', scanSlip: 'Scan to see this receipt on your phone',
    bookedBy: 'Booked by', modes: { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' },
    // A4 receipt
    title: 'Abhishek / Puja Receipt', receiptNo: 'Receipt No.', bookedOn: 'Booked on', seva: 'Seva', hall: 'Hall',
    serialNo: 'Serial no.', devotee: 'Devotee', mobile: 'Mobile', postal: 'Postal address', address: 'Address',
    familyNames: 'Family names', rashi: 'Rashi / Nakshatra', payment: 'Payment', ref: 'Ref',
    scanReceipt: 'Scan to view this receipt', amountReceived: 'Amount received',
    inWords: (words) => `Rupees ${words} only`, signFor: (name) => `For ${name}`,
  },
  hi: {
    slipTitle: 'अभिषेक / पूजा रसीद', voided: '*** रद्द ***', voidMark: 'रद्द',
    receipt: 'रसीद', booked: 'बुकिंग', pujaDate: 'पूजा तिथि', batch: 'बैच', time: 'समय',
    hallBox: 'हॉल', serialBox: 'क्रमांक', gotra: 'गोत्र', family: 'परिवार', people: 'व्यक्ति', postTo: 'डाक पता',
    cancelled: 'यह बुकिंग रद्द की गई है — प्रवेश के लिए मान्य नहीं',
    showQr: 'हॉल के प्रवेश द्वार पर यह QR कोड दिखाएँ', scanSlip: 'यह रसीद अपने फ़ोन पर देखने के लिए स्कैन करें',
    bookedBy: 'बुकिंग कर्ता:', modes: { cash: 'नकद', upi: 'UPI', card: 'कार्ड', online: 'ऑनलाइन' },
    title: 'अभिषेक / पूजा रसीद', receiptNo: 'रसीद क्र.', bookedOn: 'बुकिंग तिथि', seva: 'सेवा', hall: 'हॉल',
    serialNo: 'क्रमांक', devotee: 'भक्त', mobile: 'मोबाइल', postal: 'डाक पता', address: 'पता',
    familyNames: 'परिवार के सदस्य', rashi: 'राशि / नक्षत्र', payment: 'भुगतान', ref: 'संदर्भ',
    scanReceipt: 'यह रसीद देखने के लिए स्कैन करें', amountReceived: 'प्राप्त राशि',
    inWords: (words) => `रुपये ${words} मात्र`, signFor: (name) => `${name} की ओर से`,
  },
};

/** A booking's language for its slip and receipt: the devotee's, else Bookings → Setup's default. */
export const bookingLanguage = (booking, setupLanguage) => booking?.devotee?.language || setupLanguage || 'mr';

/** The slip / receipt wording for a booking's language (Hindi, else English). */
export const receiptText = (lang) => RECEIPT_TEXT[lang === 'hi' ? 'hi' : 'en'];

/** A Hindi booking shows the seva in Devanagari (its Marathi name), like the hall and temple. */
export const sevaNameFor = (lang, sevaName, sevaNameMr) => ((lang === 'hi' || lang === 'mr') && sevaNameMr) || sevaName;

// 1–99 in Hindi (each has its own word)
const HI_1_99 = ('एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस '
  + 'इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस '
  + 'सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास '
  + 'इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ '
  + 'अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी '
  + 'बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे '
  + 'सत्तानवे अट्ठानवे निन्यानवे').split(' ');

/** Indian numbering in Hindi: 6300 → "छह हज़ार तीन सौ". */
export function amountInWordsHi(amount) {
  const n = Math.floor(amount || 0);
  if (!n) return 'शून्य';
  const two = (x) => HI_1_99[x - 1] || '';
  const parts = [];
  if (n >= 1e7) parts.push(`${amountInWordsHi(Math.floor(n / 1e7))} करोड़`);
  if (n % 1e7 >= 1e5) parts.push(`${two(Math.floor((n % 1e7) / 1e5))} लाख`);
  if (n % 1e5 >= 1e3) parts.push(`${two(Math.floor((n % 1e5) / 1e3))} हज़ार`);
  if (n % 1e3 >= 100) parts.push(`${two(Math.floor((n % 1e3) / 100))} सौ`);
  if (n % 100) parts.push(two(n % 100));
  return parts.join(' ');
}
