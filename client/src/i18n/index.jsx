import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import common from './mr/common.js';
import mahaprasad from './mr/mahaprasad.js';
import mahaprasadOnline from './mr/mahaprasadOnline.js';
import stock from './mr/stock.js';
import dashboard from './mr/dashboard.js';
import attendance from './mr/attendance.js';
import salary from './mr/salary.js';
import booking from './mr/booking.js';
import bookingRegister from './mr/bookingRegister.js';
import bookingSetup from './mr/bookingSetup.js';
import bookingFix from './mr/bookingFix.js';
import bookingShift from './mr/bookingShift.js';
import bookingCheckIn from './mr/bookingCheckIn.js';
import admin from './mr/admin.js';
import assets from './mr/assets.js';
import finance from './mr/finance.js';
import devoteeHi from './hi/devotee.js';

// English / मराठी (/ हिंदी on devotee screens). The English text *is* the key — t('Save') looks it up in the Marathi
// dictionary and falls back to the English when there's no entry yet, so screens can be
// translated one at a time. Placeholders: t('{n} items', { n: 3 }).
// When one English word needs two translations, add a context after '|':
// t('Paid|coupon') shows "Paid" in English and its own Marathi (सशुल्क, not भरलेले).
// Dictionaries are split by area (mr/*.js) so they can be edited independently.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'मराठी' },
  { code: 'hi', label: 'हिंदी' },
];
// Staff screens are in English and Marathi. What devotees see (the TV screens, the coupon and
// receipt pages, /prasad) is also in Hindi — those wrap themselves in a provider with these.
export const APP_LANGUAGES = ['en', 'mr'];
export const DEVOTEE_LANGUAGES = ['en', 'mr', 'hi'];

const DICTIONARIES = {
  mr: { ...common, ...mahaprasad, ...mahaprasadOnline, ...stock, ...dashboard, ...attendance, ...salary, ...booking, ...bookingRegister, ...bookingSetup, ...bookingFix, ...bookingShift, ...bookingCheckIn, ...admin, ...assets, ...finance },
  hi: devoteeHi,
};

const STORAGE_KEY = 'mgm-lang';

// The devotee pages (/m, /r, /prasad) share one saved choice
export const DEVOTEE_LANGUAGE_KEY = 'mgm-lang-devotee';
/** Has this device's person picked a language there (or on a TV screen with its own key)? */
export const hasSavedLanguage = (storageKey = DEVOTEE_LANGUAGE_KEY) => {
  try { return Boolean(localStorage.getItem(storageKey)); } catch { return false; }
};

// The phone's own language when it is one we have (a devotee's phone set to Hindi opens in Hindi)
export const phoneLanguage = (codes) => browserLang(codes);
const browserLang = (codes) => {
  try {
    return [...(navigator.languages || [navigator.language])].map((l) => String(l).slice(0, 2)).find((c) => codes.includes(c));
  } catch { return undefined; }
};

// The saved choice; a screen with its own language (storageKey) starts in the phone's language
// (fromBrowser) or the app's until it is switched
const readLang = (storageKey = STORAGE_KEY, codes = APP_LANGUAGES, fromBrowser = false) => {
  try {
    const saved = localStorage.getItem(storageKey);
    if (codes.includes(saved)) return saved;
  } catch { /* storage blocked */ }
  if (storageKey === STORAGE_KEY) return 'en';
  const app = readLang();
  return (fromBrowser && browserLang(codes)) || (codes.includes(app) ? app : 'en');
};

export function translate(lang, text, vars) {
  if (typeof text !== 'string') return text;
  const bar = text.indexOf('|');
  const english = bar === -1 ? text : text.slice(0, bar);
  const out = (lang !== 'en' && DICTIONARIES[lang]?.[text]) || english;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : out;
}

// For code outside React components (toasts in hooks/utils): uses the saved language.
export const tNow = (text, vars) => translate(readLang(), text, vars);

/**
 * Fills {placeholders} in an already-translated sentence with elements, so each language
 * keeps its own word order: rich(t('Approve {number}?'), { number: <strong>PV-12</strong> }).
 */
export const rich = (text, parts) => String(text).split(/\{(\w+)\}/g)
  .map((piece, i) => (i % 2 ? <Fragment key={i}>{parts[piece] ?? `{${piece}}`}</Fragment> : piece));

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, languages: APP_LANGUAGES });

// The app has one provider (main.jsx). A TV display or a devotee page wraps itself in another
// with its own storageKey (and the devotee languages), so switching it leaves the app's alone.
export function LanguageProvider({ children, storageKey = STORAGE_KEY, languages = APP_LANGUAGES, fromBrowser = false }) {
  const [lang, setLangState] = useState(() => readLang(storageKey, languages, fromBrowser));

  useEffect(() => {
    const before = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = before; };
  }, [lang]);

  const setLang = useCallback((code) => {
    try { localStorage.setItem(storageKey, code); } catch { /* ignore */ }
    setLangState(code);
  }, [storageKey]);

  const value = useMemo(() => ({ lang, setLang, languages }), [lang, setLang, languages]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/** const t = useT(); t('Save') → 'जतन करा' in Marathi, 'Save' in English. */
export function useT() {
  const { lang } = useLanguage();
  return useCallback((text, vars) => translate(lang, text, vars), [lang]);
}

/** Compact English | मराठी switch (| हिंदी on devotee screens). */
export function LanguageSwitch({ className = '' }) {
  const { lang, setLang, languages } = useLanguage();
  return (
    <div role="radiogroup" aria-label="Language" className={`inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-sm ${className}`}>
      {LANGUAGES.filter((l) => languages.includes(l.code)).map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${lang === l.code ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
