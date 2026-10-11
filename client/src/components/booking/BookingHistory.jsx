import { ArrowRight, CalendarClock, PencilLine } from 'lucide-react';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { HISTORY_LABELS, historyEntries, historyValue } from './bookingFixUtils.js';
import { fmtDateTime } from './registerUtils.js';

/** Corrections made after booking (details edited, moved), newest first. Nothing when there are none. */
export default function BookingHistory({ history }) {
  const t = useT();
  const { lang } = useLanguage();
  const entries = historyEntries(history);
  if (!entries.length) return null;

  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('History')}</h3>
      <ol className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
        {entries.map((h, i) => {
          const moved = h.action === 'move';
          const Icon = moved ? CalendarClock : PencilLine;
          return (
            <li key={`${h.at}-${i}`} className="p-3">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className={`inline-flex items-center gap-1 font-semibold ${moved ? 'text-blue-700' : 'text-gray-800'}`}>
                  <Icon className="h-4 w-4 shrink-0" /> {moved ? t('Moved') : t('Details edited')}
                </span>
                <span className="text-xs text-gray-400">{[h.by?.name, h.at && fmtDateTime(h.at)].filter(Boolean).join(' · ')}</span>
              </p>
              {h.reason && <p className="mt-0.5 text-xs text-gray-600">{t('Reason')}: {h.reason}</p>}
              {h.changes.length > 0 && (
                <dl className="mt-2 space-y-1.5">
                  {h.changes.map(({ field, before, after }) => {
                    const from = historyValue(field, before, { t, lang });
                    const to = historyValue(field, after, { t, lang });
                    return (
                      <div key={field} className="text-sm">
                        <dt className="text-[11px] text-gray-400">{t(HISTORY_LABELS[field] || field)}</dt>
                        <dd className="flex flex-wrap items-center gap-x-1.5 break-words">
                          <span className={from ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-400'}>{from || '—'}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                          <span className="sr-only">{t('changed to')}</span>
                          <span className="font-medium text-gray-900">{to || '—'}</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
