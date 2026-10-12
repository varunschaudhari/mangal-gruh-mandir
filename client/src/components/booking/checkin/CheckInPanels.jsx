import { AlertTriangle, CheckCircle2, Info, RefreshCw, RotateCcw, Users, X, XCircle } from 'lucide-react';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import Spinner from '../../ui/Spinner.jsx';
import { HallBadge } from '../counter/bits.jsx';
import { hallHeading, hallName, hallTitle } from '../../../utils/halls.js';
import { fmtDay } from '../counter/counterUtils.js';
import { fmtTime, nPeople } from '../registerUtils.js';
import { arrivedPercent, batchState, isLetIn, overrideText, verdictOf } from './checkInUtils.js';

const TONES = {
  green: { box: 'border-green-400 bg-green-50', title: 'text-green-800', Icon: CheckCircle2 },
  amber: { box: 'border-amber-400 bg-amber-50', title: 'text-amber-900', Icon: AlertTriangle },
  red:   { box: 'border-red-400 bg-red-50',     title: 'text-red-800',   Icon: XCircle },
  gray:  { box: 'border-gray-300 bg-gray-50',   title: 'text-gray-800',  Icon: Info },
};

// Hall and serial in big dark tiles — what the devotee is sent to.
const Tile = ({ label, value }) => (
  <div className="min-w-[4.5rem] rounded-xl bg-gray-900 px-3 py-2 text-center text-white">
    <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
    <p className="text-3xl font-black leading-8">{value}</p>
  </div>
);

/**
 * The answer to one scan, readable at arm's length.
 * `view` = { data: { result, checkedIn, canOverride, booking }, code } or { error }.
 */
export function CheckInResult({ view, sevaNameOf, hallNames, onOverride, onUndo, onDismiss, busy, undoing }) {
  const t = useT();
  const { lang } = useLanguage();

  if (view.error) {
    const { box, title, Icon } = TONES.red;
    return (
      <div role="alert" className={`card flex items-start gap-3 border-2 p-4 ${box}`}>
        <Icon className={`h-8 w-8 shrink-0 ${title}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-xl font-black ${title}`}>{t('Not a valid slip')}</p>
          <p className="mt-0.5 break-words text-sm text-red-900">{t(view.error)}</p>
        </div>
        <button type="button" onClick={onDismiss} className="-m-1 rounded-lg p-2 text-red-400 hover:bg-red-100" aria-label={t('Close')}>
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const { result, canOverride, booking: b } = view.data;
  const v = verdictOf(result);
  const { box, title, Icon } = TONES[v.tone];
  const letIn = isLetIn(result);
  const seva = sevaNameOf(b.sevaType, b.sevaName);
  const when = [b.dateKey && fmtDay(b.dateKey, lang, { weekday: 'short', day: 'numeric', month: 'short' }), b.batchLabel].filter(Boolean).join(' · ');

  const detail = {
    overridden: t(overrideText(b.checkInOverride)),
    already: t('Checked in at {time} by {name}', { time: fmtTime(b.checkedInAt), name: b.checkedInBy?.name || '—' }),
    'other-hall': t('Send the devotee to {hall}', { hall: hallHeading(t, b.hall, hallNames, lang) }),
    'batch-over': t('The {batch} batch has finished', { batch: b.batchLabel }),
    early: t('Booked for {when}', { when }),
    past: t('Booked for {when}', { when }),
    voided: t('The receipt was voided at the counter — do not let in'),
    'no-visit': t('{seva} is performed on the devotee’s behalf — there is no visit', { seva }),
  }[result];

  return (
    <div role="status" aria-live="assertive" className={`card border-2 p-4 ${box}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-8 w-8 shrink-0 ${title}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-xl font-black ${title}`}>{t(v.title)}</p>
          {detail && <p className="mt-0.5 text-sm font-medium text-gray-800">{detail}</p>}
        </div>
        {!letIn && (
          <button type="button" onClick={onDismiss} className="-m-1 rounded-lg p-2 text-gray-400 hover:bg-white/60" aria-label={t('Close')}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2">
        {b.hall && <Tile label={t('Hall')} value={b.hall} />}
        {b.serialNo != null && <Tile label={t('Serial')} value={b.serialNo} />}
        <div className="min-w-0 flex-1 rounded-xl bg-white/70 px-3 py-2">
          <p className="break-words text-lg font-bold leading-tight text-gray-900">{b.devotee?.name}</p>
          <p className="mt-0.5 text-sm text-gray-700">{[seva, b.batchLabel, hallName(b.hall, hallNames, lang)].filter(Boolean).join(' · ')}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1 font-semibold text-gray-800"><Users className="h-3.5 w-3.5" /> {nPeople(t, b.peopleCount || 1)}</span>
            {b.devotee?.gotra && <span>{t('Gotra')}: {b.devotee.gotra}</span>}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-gray-400">{b.receiptNo}</p>
        </div>
      </div>

      {(canOverride || letIn) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canOverride && (
            <button type="button" onClick={onOverride} disabled={busy}
              className="btn min-h-[48px] flex-1 bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500">
              {busy ? <Spinner size="sm" /> : <CheckCircle2 className="h-5 w-5" />}
              {t(result === 'other-hall' ? 'Let in here anyway' : 'Let in anyway')}
            </button>
          )}
          {letIn && (
            <button type="button" onClick={onUndo} disabled={undoing} className="btn-secondary min-h-[44px] text-sm">
              {undoing ? <Spinner size="sm" /> : <RotateCcw className="h-4 w-4" />} {t('Undo check-in')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Today's arrivals: in total and per batch, with the running batch marked. */
export function Arrivals({ query, hall }) {
  const t = useT();
  const { lang } = useLanguage();
  const s = query.data;
  const now = new Date();
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {t('Arrivals today')}{hall ? ` · ${hallTitle(hall, s?.hallNames, lang)}` : ''}
        </h2>
        <button type="button" onClick={() => query.refetch()} aria-label={t('Refresh')} title={t('Refresh')}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 max-lg:p-2.5">
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {query.isLoading ? <div className="flex justify-center py-4"><Spinner /></div> : !s?.groups?.length ? (
        <p className="py-2 text-sm text-gray-400">{query.isError ? t('Could not load arrivals') : t('No bookings for today')}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <p className="text-3xl font-black tabular-nums leading-none text-gray-900">
              {s.totals.arrived}<span className="text-lg font-bold text-gray-400">/{s.totals.bookings}</span>
            </p>
            <p className="text-right text-xs text-gray-500">
              {t('{n} of {total} arrived', { n: s.totals.arrived, total: s.totals.bookings })}<br />
              {t('{n} of {total} people', { n: s.totals.arrivedPeople, total: s.totals.people })}
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {s.groups.map((g) => {
              const state = batchState(g.label, now);
              const pct = arrivedPercent(g.arrived, g.bookings);
              return (
                <li key={`${g.batch || g.label}|${g.hall}`} className={`rounded-lg px-2.5 py-2 ${state === 'now' ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-gray-50'} ${state === 'over' ? 'opacity-70' : ''}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">{g.label || g.sevaNames.join(', ')}</span>
                    {state === 'now' && <span className="rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{t('Now')}</span>}
                    <HallBadge hall={g.hall} title={hallTitle(g.hall, s?.hallNames, lang)} />
                    <span className="w-14 shrink-0 text-right font-bold tabular-nums text-gray-900">{g.arrived}/{g.bookings}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {g.label && <p className="mt-1 truncate text-[11px] text-gray-500">{g.sevaNames.join(', ')} · {nPeople(t, g.people)}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** The latest check-ins here, each with Undo. */
export function RecentCheckIns({ list = [], onUndo, undoingId }) {
  const t = useT();
  return (
    <div className="card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('Latest check-ins')}</h2>
      {!list.length ? <p className="py-2 text-sm text-gray-400">{t('Devotees you check in will appear here.')}</p> : (
        <ul className="divide-y divide-gray-100">
          {list.map((b) => (
            <li key={b._id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{b.devotee?.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <HallBadge hall={b.hall} />
                  {b.serialNo != null && <span className="font-semibold text-gray-700">#{b.serialNo}</span>}
                  <span className="truncate">{fmtTime(b.checkedInAt)}{b.checkedInBy?.name ? ` · ${b.checkedInBy.name}` : ''}</span>
                </p>
              </div>
              <button type="button" onClick={() => onUndo(b._id)} disabled={undoingId === b._id}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 max-lg:h-11"
                aria-label={`${t('Undo check-in')}: ${b.devotee?.name}`}>
                {undoingId === b._id ? <Spinner size="sm" /> : <RotateCcw className="h-3.5 w-3.5" />} {t('Undo')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
