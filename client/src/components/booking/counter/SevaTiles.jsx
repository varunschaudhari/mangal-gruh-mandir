import { Check } from 'lucide-react';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { fmtMoney } from './counterUtils.js';
import { Kbd, radioTab, rovingKeyDown } from './bits.jsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "1 hour" / "3 hours" / "45 min" from Setup → translated; anything else is shown as typed.
function durationText(t, s) {
  const text = String(s || '').trim();
  let m;
  if ((m = text.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)$/i))) return Number(m[1]) === 1 ? t('1 hour') : t('{n} hours', { n: m[1] });
  if ((m = text.match(/^(\d+)\s*(?:min|mins|minutes?)$/i))) return t('{n} min', { n: m[1] });
  return text;
}

/** One line under the seva name saying how it is scheduled. */
export function scheduleHint(t, seva) {
  switch (seva.schedule) {
    case 'batch':
      return [t('In batches'), seva.duration && durationText(t, seva.duration)].filter(Boolean).join(' · ');
    case 'slot': {
      const days = seva.weekdays?.length && seva.weekdays.length < 7 ? seva.weekdays.map((d) => t(WEEKDAYS[d])).join(', ') : t('Daily');
      return [days, seva.slotTime].filter(Boolean).join(' · ');
    }
    case 'arrangement':
      return t('Date fixed with the office');
    case 'none':
      return t('No date · by post');
    default:
      return '';
  }
}

/** Seva name in the screen's language, with the other language underneath. */
export function sevaNames(seva, lang) {
  if (!seva) return { primary: '', secondary: '' };
  return lang === 'mr' && seva.nameMr
    ? { primary: seva.nameMr, secondary: seva.name }
    : { primary: seva.name, secondary: seva.nameMr || '' };
}

/** Big seva tiles with the fixed price. Alt+1…9 picks a tile from anywhere (handled by the page). */
export default function SevaTiles({ sevaTypes, value, onChange, error }) {
  const t = useT();
  const { lang } = useLanguage();
  const any = sevaTypes.some((s) => s._id === value);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t('Seva')}
        onKeyDown={rovingKeyDown}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {sevaTypes.map((s, i) => {
          const selected = s._id === value;
          const { primary, secondary } = sevaNames(s, lang);
          return (
            <button
              key={s._id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={radioTab(selected, i === 0, any)}
              data-enter-books
              title={s.description || undefined}
              onClick={() => onChange(s)}
              className={`relative flex min-h-[76px] flex-col items-start rounded-xl border-2 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 ${
                selected
                  ? 'border-primary-500 bg-primary-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
              }`}
            >
              {/* Phones: price on its own line so long names don't collide with it */}
              <span className="flex w-full items-start justify-between gap-2">
                <span className={`min-w-0 text-sm font-bold leading-snug ${selected ? 'text-primary-800' : 'text-gray-900'}`}>{primary}</span>
                <span className={`hidden shrink-0 text-sm font-black tabular-nums sm:inline ${selected ? 'text-primary-700' : 'text-gray-700'}`}>₹{fmtMoney(s.price)}</span>
              </span>
              {secondary && <span className="mt-0.5 text-xs leading-snug text-gray-500">{secondary}</span>}
              <span className="mt-auto flex w-full items-end justify-between gap-1 pt-1">
                <span className="min-w-0">
                  <span className={`block text-base font-black tabular-nums sm:hidden ${selected ? 'text-primary-700' : 'text-gray-800'}`}>₹{fmtMoney(s.price)}</span>
                  <span className="block text-[11px] leading-tight text-gray-400">{scheduleHint(t, s)}</span>
                </span>
                {i < 9 && <Kbd className="shrink-0">Alt+{i + 1}</Kbd>}
              </span>
              {selected && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white shadow">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
