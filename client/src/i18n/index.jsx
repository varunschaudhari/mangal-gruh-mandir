import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import common from './mr/common.js';
import mahaprasad from './mr/mahaprasad.js';
import stock from './mr/stock.js';
import dashboard from './mr/dashboard.js';
import attendance from './mr/attendance.js';
import salary from './mr/salary.js';
import booking from './mr/booking.js';
import bookingRegister from './mr/bookingRegister.js';
import bookingSetup from './mr/bookingSetup.js';
import bookingFix from './mr/bookingFix.js';
import bookingShift from './mr/bookingShift.js';

// English / मराठी. The English text *is* the key — t('Save') looks it up in the Marathi
// dictionary and falls back to the English when there's no entry yet, so screens can be
// translated one at a time. Placeholders: t('{n} items', { n: 3 }).
// When one English word needs two translations, add a context after '|':
// t('Paid|coupon') shows "Paid" in English and its own Marathi (सशुल्क, not भरलेले).
// Dictionaries are split by area (mr/*.js) so they can be edited independently.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'मराठी' },
];

const DICTIONARIES = {
  mr: { ...common, ...mahaprasad, ...stock, ...dashboard, ...attendance, ...salary, ...booking, ...bookingRegister, ...bookingSetup, ...bookingFix, ...bookingShift },
};

const STORAGE_KEY = 'mgm-lang';

const readLang = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((l) => l.code === saved) ? saved : 'en';
  } catch { return 'en'; }
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

const LanguageContext = createContext({ lang: 'en', setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readLang);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((code) => {
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    setLangState(code);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/** const t = useT(); t('Save') → 'जतन करा' in Marathi, 'Save' in English. */
export function useT() {
  const { lang } = useLanguage();
  return useCallback((text, vars) => translate(lang, text, vars), [lang]);
}

/** Compact English | मराठी switch. */
export function LanguageSwitch({ className = '' }) {
  const { lang, setLang } = useLanguage();
  return (
    <div role="radiogroup" aria-label="Language" className={`inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-sm ${className}`}>
      {LANGUAGES.map((l) => (
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
