// मराठी — Fixing a booking (edit details, move batch/date, history) and the double-booking warning.
// Key = the English text shown in the app. Missing entries fall back to English.
// Please have a Marathi speaker at the temple review these.
export default {
  // ── Booking details: edit / move buttons, reprint ────────────────────────
  'Edit details': 'तपशील बदला',
  'Move': 'हलवा',
  'Booking updated': 'बुकिंग अद्ययावत झाले',
  'Nothing changed': 'काहीही बदलले नाही',
  'Booking moved': 'बुकिंग हलवले',
  'Moved — new serial {n}': 'हलवले — नवीन अनुक्रमांक {n}',
  'Saved. Print a new slip so the devotee has the right details.': 'जतन झाले. भाविकाकडे बरोबर तपशील राहावेत म्हणून नवीन स्लिप छापा.',

  // ── Edit details ─────────────────────────────────────────────────────────
  'Edit booking details': 'बुकिंगचा तपशील बदला',
  'Receipt {receipt} and the amount {amount} stay the same.': 'पावती {receipt} आणि रक्कम {amount} तशीच राहील.',
  'After saving, use Resend to send the receipt to the new number.': 'जतन केल्यानंतर नवीन नंबरवर पावती पाठवण्यासाठी "पुन्हा पाठवा" वापरा.',
  'Save changes': 'बदल जतन करा',
  'Reason for the change': 'बदलाचे कारण',
  'Spelling mistake': 'स्पेलिंग चूक',
  'Devotee asked': 'भाविकाची विनंती',
  'Wrong details entered': 'चुकीचा तपशील भरला',
  'Paid online — the payment cannot be changed here': 'ऑनलाइन भरले — पेमेंट इथे बदलता येत नाही',

  // ── Move to another batch / date ─────────────────────────────────────────
  'Move booking': 'बुकिंग हलवा',
  'Moving…': 'हलवत आहे…',
  'Booked now for': 'सध्याचे बुकिंग',
  'Booked now': 'सध्याची',
  'Receipt number, amount and payment stay the same.': 'पावती क्रमांक, रक्कम आणि पेमेंट तसेच राहतील.',
  'New date': 'नवीन तारीख',
  'New batch': 'नवीन बॅच',
  'No other batch has room on this date.': 'या तारखेला दुसऱ्या कोणत्याही बॅचमध्ये जागा नाही.',
  'Choose a different date': 'वेगळी तारीख निवडा',
  'Moving to {where}': 'नवीन: {where}',
  'new serial': 'नवीन अनुक्रमांक',
  'Devotee could not come': 'भाविक येऊ शकले नाहीत',
  'Wrong date or batch entered': 'चुकीची तारीख किंवा बॅच भरली',

  // ── History ──────────────────────────────────────────────────────────────
  'Details edited': 'तपशील बदलला',
  'Moved': 'हलवले',
  'changed to': 'बदलून',

  // ── Counter: already booked ──────────────────────────────────────────────
  'Already booked': 'आधीच बुक आहे',
  'Already booked: {booking}': 'आधीच बुक: {booking}',
  'Same seva & date': 'तीच सेवा व तारीख',
  '+{n} more': '+{n} आणखी',
  'Book again only if the devotee really wants a second booking.': 'भाविकाला खरोखर दुसरे बुकिंग हवे असेल तरच पुन्हा बुक करा.',
  'Don’t book': 'बुक करू नका',
  'Book again': 'पुन्हा बुक करा',

  // ── Server messages ──────────────────────────────────────────────────────
  'This devotee already has this seva booked for that day': 'या भाविकाचे त्या दिवशी ही सेवा आधीच बुक आहे',
  'Only the person who took this booking can change how it was paid': 'पेमेंटची पद्धत फक्त हे बुकिंग घेणारी व्यक्तीच बदलू शकते',
  'This booking is in a closed shift — its payment mode can no longer be changed': 'हे बुकिंग बंद झालेल्या शिफ्टमध्ये आहे — आता पेमेंटची पद्धत बदलता येणार नाही',
  'Not enough seats left in this batch for more people': 'जास्त लोकांसाठी या बॅचमध्ये पुरेशा जागा नाहीत',
  'This booking was changed by someone else just now — open it again and retry': 'हे बुकिंग आत्ताच दुसऱ्या कोणी बदलले — पुन्हा उघडून परत प्रयत्न करा',
  'This seva has no date to change': 'या सेवेला बदलण्यासाठी तारीख नाही',
  'Choose a different date or batch': 'वेगळी तारीख किंवा बॅच निवडा',
  'Booking not found or voided': 'बुकिंग सापडले नाही किंवा रद्दबातल झाले आहे',
  'This seva type no longer exists': 'हा सेवा प्रकार आता अस्तित्वात नाही',
};
