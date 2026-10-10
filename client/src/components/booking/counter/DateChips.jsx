import { CalendarDays } from 'lucide-react';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { dateChoices, fmtDay, lastBookableDay } from './counterUtils.js';
import { radioTab, rovingKeyDown } from './bits.jsx';

/** Today / Tomorrow / next Tuesday chips (or the seva's next days), plus any other date. */
export default function DateChips({ seva, today, value, onChange, maxAdvanceDays }) {
  const t = useT();
  const { lang } = useLanguage();
  const weekdays = seva?.schedule === 'slot' ? seva.weekdays : null;
  const chips = dateChoices({ today, weekdays, maxAdvanceDays });
  const last = lastBookableDay(today, maxAdvanceDays);
  const inChips = chips.some((c) => c.key === value);

  const chipCls = (on) => `flex min-h-[44px] flex-col items-start justify-center rounded-xl border-2 px-3 py-1 text-left leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
    on ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
  }`;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-stretch gap-2">
        <div role="radiogroup" aria-label={t('Puja date')} onKeyDown={rovingKeyDown} className="contents">
          {chips.map((c, i) => {
            const on = c.key === value;
            const title = c.kind === 'today' ? t('Today') : c.kind === 'tomorrow' ? t('Tomorrow') : fmtDay(c.key, lang, { weekday: 'long' });
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={radioTab(on, i === 0, inChips)}
                data-enter-books
                onClick={() => onChange(c.key)}
                className={chipCls(on)}
              >
                <span className="text-sm font-semibold">{title}</span>
                <span className={`text-[11px] ${on ? 'text-primary-600' : 'text-gray-400'}`}>
                  {fmtDay(c.key, lang, c.kind === 'date' ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>
        <label className={`${chipCls(!inChips && value)} relative min-w-[150px] flex-1 cursor-pointer sm:flex-none`}>
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <CalendarDays className="h-3 w-3" /> {t('Other date')}
          </span>
          <input
            type="date"
            min={today}
            max={last}
            value={inChips ? '' : value || ''}
            onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
            aria-label={t('Other date')}
            className="w-full bg-transparent text-sm font-semibold text-gray-800 focus:outline-none"
          />
        </label>
      </div>
      {value && (
        <p className="text-xs text-gray-500">
          {t('Puja on {date}', { date: fmtDay(value, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) })}
        </p>
      )}
    </div>
  );
}
