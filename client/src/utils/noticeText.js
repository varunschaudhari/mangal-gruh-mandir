// A notice is typed in Marathi, Hindi and/or English (server: models/Notice.js). Each reader
// gets their language, else the closest one that was filled in: Marathi and Hindi readers share
// Devanagari; a Hindi reader may not read Marathi, so English comes before it.
const ORDER = { mr: ['mr', 'hi', 'en'], hi: ['hi', 'en', 'mr'], en: ['en', 'mr', 'hi'] };

/** One field ({ mr, hi, en }) in the reader's language — '' when nothing was typed. */
export function inLanguage(field, lang) {
  for (const l of ORDER[lang] || ORDER.en) {
    const text = field?.[l]?.trim();
    if (text) return text;
  }
  return '';
}

/** A notice's title and text for a reader. */
export const noticeFor = (notice, lang) => ({
  title: inLanguage(notice?.title, lang),
  body: inLanguage(notice?.body, lang),
});

// "New" on the staff board: notices posted after this device last opened the board
const SEEN_KEY = 'mgm-notices-seen';
export const lastSeen = () => {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
};
export const markSeen = (time = Date.now()) => {
  try { localStorage.setItem(SEEN_KEY, String(time)); } catch { /* not kept */ }
};
export const isNew = (notice, seen = lastSeen()) => new Date(notice.createdAt).getTime() > seen;
