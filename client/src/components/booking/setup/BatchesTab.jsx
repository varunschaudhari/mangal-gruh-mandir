import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { ConfirmModal } from '../../ui/Modal.jsx';
import { ActiveBadge } from '../../ui/Badge.jsx';
import { deleteBookingBatch, updateBookingBatch } from '../../../api/booking.api.js';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { hallName, hallTitle } from '../../../utils/halls.js';
import BatchSheet from './BatchSheet.jsx';
import BulkCapacitySheet from './BulkCapacitySheet.jsx';
import {
  HallChip, Switch, batchTime, errText, hallList, hallNamesOf, lengthText, toMinutes, useRefreshBookings, weekdaysText,
} from './setupUi.jsx';

const PART_OF_DAY = [
  { label: /*t*/ 'Morning', until: 12 * 60 },
  { label: /*t*/ 'Afternoon', until: 17 * 60 },
  { label: /*t*/ 'Evening', until: 24 * 60 },
];
const SEED_CAPACITY = 50; // the starting number every seeded batch got
const DISMISS_KEY = 'mgm-booking-capacity-hint';

export default function BatchesTab({ setup, canManage }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const { lang } = useLanguage();
  const { batches, sevaTypes, settings, halls: hallRows = [] } = setup;
  const unit = settings.capacityUnit;
  const halls = hallList(batches, hallRows);
  const names = hallNamesOf(hallRows);
  const title = (code) => hallTitle(code, names, lang);
  const usedHalls = halls.filter((h) => batches.some((b) => b.hall === h));

  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });

  const sorted = useMemo(() => [...batches].sort((a, b) => a.start.localeCompare(b.start)
    || halls.indexOf(a.hall) - halls.indexOf(b.hall)), [batches, halls]);
  const groups = PART_OF_DAY.map((p, i) => ({
    label: p.label,
    rows: sorted.filter((b) => toMinutes(b.start) < p.until && toMinutes(b.start) >= (i ? PART_OF_DAY[i - 1].until : 0)),
  })).filter((g) => g.rows.length);

  const sevaName = (id) => sevaTypes.find((s) => String(s._id) === String(id))?.name;
  const sevasText = (b) => (b.sevaTypes?.length ? b.sevaTypes.map(sevaName).filter(Boolean).join(', ') : t('All batch sevas'));

  const active = batches.filter((b) => b.isActive);
  const totalSeats = active.reduce((sum, b) => sum + (b.capacity || 0), 0);
  const allPlaceholder = active.length > 0 && active.every((b) => b.capacity === SEED_CAPACITY);
  const batchSevaCount = sevaTypes.filter((s) => s.schedule === 'batch' && s.isActive).length;

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectMany = (ids) => setSelected(ids);

  const activeMut = useMutation({
    mutationFn: ({ batch, isActive }) => updateBookingBatch(batch._id, { isActive }),
    onMutate: ({ batch }) => setBusyId(batch._id),
    onSuccess: (_, { batch, isActive }) => {
      const label = `${batchTime(batch)}, ${title(batch.hall)}`;
      toast.success(isActive ? t('Batch {label} is now active', { label }) : t('Batch {label} is switched off', { label }));
      refresh();
      setBlocked(null);
    },
    onError: (err) => toast.error(errText(t, err)),
    onSettled: () => setBusyId(null),
  });

  const deleteMut = useMutation({
    mutationFn: (batch) => deleteBookingBatch(batch._id),
    onSuccess: (_, batch) => {
      toast.success(t('Batch {label} deleted', { label: `${batchTime(batch)}, ${title(batch.hall)}` }));
      setSelected((cur) => cur.filter((id) => id !== batch._id));
      refresh();
      setToDelete(null);
    },
    onError: (err, batch) => {
      setToDelete(null);
      if (err.response?.status === 400) setBlocked({ batch, message: errText(t, err) });
      else toast.error(errText(t, err));
    },
  });

  const dismissHint = () => { setHintDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ } };

  const actions = (b) => canManage && (
    <>
      <button type="button" onClick={() => setEditing(b)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-primary-700 md:h-9 md:w-9" aria-label={t('Edit')} title={t('Edit')}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setToDelete(b)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-red-600 md:h-9 md:w-9" aria-label={t('Delete')} title={t('Delete')}>
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
  const activeCell = (b) => (canManage
    ? <Switch checked={b.isActive} busy={busyId === b._id} onChange={(v) => activeMut.mutate({ batch: b, isActive: v })} label={b.isActive ? t('Active') : t('Inactive')} />
    : <ActiveBadge isActive={b.isActive} />);
  const checkbox = (b) => (
    <label className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:h-8 md:w-8">
      <input type="checkbox" className="h-5 w-5 rounded md:h-4 md:w-4" checked={selected.includes(b._id)} onChange={() => toggle(b._id)} aria-label={t('Tick {label}', { label: `${batchTime(b)} ${title(b.hall)}` })} />
    </label>
  );

  return (
    <div className="space-y-3">
      {/* Summary + main actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {t('{n} active batches in {halls} halls', { n: active.length, halls: new Set(active.map((b) => b.hall)).size })}
          {' · '}
          {unit === 'people' ? t('{n} people a day in all', { n: totalSeats }) : t('{n} bookings a day in all', { n: totalSeats })}
        </p>
        {canManage && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={() => setBulkOpen(true)} className="btn-secondary" disabled={!batches.length}>
              <Users className="h-4 w-4" />{selected.length ? t('Set seats ({n})', { n: selected.length }) : t('Set seats')}
            </button>
            <button type="button" onClick={() => setEditing({})} className="btn-primary">
              <Plus className="h-4 w-4" />{t('Add batch')}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {unit === 'people'
          ? t('Seats count people: a family of 4 uses 4 seats.')
          : t('Seats count bookings: one booking uses one seat, however many people come.')}
        {canManage && <> <Link to="?tab=settings" className="text-primary-700 hover:underline">{t('Change this in Settings')}</Link></>}
      </p>

      {canManage && allPlaceholder && !hintDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t('Every batch still has {n} seats — the starting number.', { n: SEED_CAPACITY })}</p>
            <p className="mt-0.5 text-amber-800">{t('Set the real number of seats for each hall before the counter starts booking.')}</p>
            <button type="button" onClick={() => setBulkOpen(true)} className="btn-secondary mt-2 border-amber-300 bg-white">{t('Set seats')}</button>
          </div>
          <button type="button" onClick={dismissHint} className="btn-ghost -m-1 h-11 w-11 p-0 text-amber-700" aria-label={t('Dismiss')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {batchSevaCount === 0 && (
        <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">{t('No active seva is booked in batches, so these batches are not used at the counter now.')}</p>
      )}

      {/* Quick selection, for setting seats on many at once */}
      {canManage && batches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-gray-500">{t('Tick:')}</span>
          <button type="button" onClick={() => selectMany(batches.map((b) => b._id))} className="h-11 rounded-full border border-gray-200 bg-white px-3 font-medium text-gray-600 hover:border-gray-300 sm:h-8">{t('All')}</button>
          {usedHalls.map((h) => (
            <button key={h} type="button" onClick={() => selectMany(batches.filter((b) => b.hall === h).map((b) => b._id))} title={title(h)} className="h-11 rounded-full border border-gray-200 bg-white px-3 font-medium text-gray-600 hover:border-gray-300 sm:h-8">
              {t('Hall {hall}', { hall: h })}
            </button>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="h-11 rounded-full px-3 font-medium text-primary-700 hover:underline sm:h-8">
              {t('Clear ({n})', { n: selected.length })}
            </button>
          )}
        </div>
      )}

      {batches.length === 0 && (
        <div className="card px-4 py-10 text-center text-sm text-gray-400">{t('No batches yet.')}</div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(g.label)}</h3>

          {/* Phones: cards */}
          <div className="space-y-2 md:hidden">
            {g.rows.map((b) => (
              <div key={b._id} className={`card p-3 ${selected.includes(b._id) ? 'ring-2 ring-primary-400' : ''}`}>
                <div className="flex items-start gap-3">
                  {canManage && <div className="pt-0.5">{checkbox(b)}</div>}
                  <div className={`min-w-0 flex-1 ${b.isActive ? '' : 'opacity-60'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-gray-900">{batchTime(b)}</span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {hallName(b.hall, names, lang) && <span className="truncate text-xs text-gray-500">{hallName(b.hall, names, lang)}</span>}
                        <HallChip hall={b.hall} halls={halls} />
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-600">
                      <span><span className="font-semibold text-gray-900">{b.capacity}</span> {t('seats')}</span>
                      <span>{lengthText(t, b.start, b.end)}</span>
                      <span>{weekdaysText(t, b.weekdays)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{sevasText(b)}</p>
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-1">
                    <span className="flex items-center text-sm text-gray-600">{activeCell(b)}{b.isActive ? t('Active') : t('Inactive')}</span>
                    <span className="flex">{actions(b)}</span>
                  </div>
                ) : (
                  !b.isActive && <div className="mt-2"><ActiveBadge isActive={false} /></div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full">
              <thead>
                <tr>
                  {canManage && <th className="table-th w-10"><span className="sr-only">{t('Tick')}</span></th>}
                  <th className="table-th">{t('Time')}</th>
                  <th className="table-th">{t('Hall')}</th>
                  <th className="table-th text-right">{t('Seats')}</th>
                  <th className="table-th">{t('Days')}</th>
                  <th className="table-th">{t('Sevas')}</th>
                  <th className="table-th">{t('Active')}</th>
                  {canManage && <th className="table-th w-24"><span className="sr-only">{t('Actions')}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.rows.map((b) => (
                  <tr key={b._id} className={selected.includes(b._id) ? 'bg-primary-50/50' : b.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60'}>
                    {canManage && <td className="table-td py-2">{checkbox(b)}</td>}
                    <td className={`table-td whitespace-nowrap ${b.isActive ? '' : 'opacity-60'}`}>
                      <span className="font-medium text-gray-900">{batchTime(b)}</span>
                      <span className="ml-2 text-xs text-gray-400">{lengthText(t, b.start, b.end)}</span>
                    </td>
                    <td className={`table-td ${b.isActive ? '' : 'opacity-60'}`}>
                      <span className="flex items-center gap-2">
                        <HallChip hall={b.hall} halls={halls} />
                        <span className="max-w-[12rem] truncate text-xs text-gray-500">{hallName(b.hall, names, lang)}</span>
                      </span>
                    </td>
                    <td className={`table-td text-right text-base font-semibold text-gray-900 ${b.isActive ? '' : 'opacity-60'}`}>{b.capacity}</td>
                    <td className={`table-td ${b.isActive ? '' : 'opacity-60'}`}>{weekdaysText(t, b.weekdays)}</td>
                    <td className={`table-td max-w-[16rem] text-xs text-gray-500 ${b.isActive ? '' : 'opacity-60'}`}>{sevasText(b)}</td>
                    <td className="table-td py-1">{activeCell(b)}</td>
                    {canManage && <td className="table-td py-1"><div className="flex justify-end">{actions(b)}</div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {editing && (
        <BatchSheet batch={editing} onClose={() => setEditing(null)} batches={batches} halls={hallRows} sevaTypes={sevaTypes} capacityUnit={unit} />
      )}

      {bulkOpen && (
        <BulkCapacitySheet
          batches={sorted} halls={hallRows} selectedIds={selected} capacityUnit={unit}
          onClose={() => setBulkOpen(false)} onDone={() => setSelected([])}
        />
      )}

      <ConfirmModal
        open={Boolean(toDelete)} onClose={() => setToDelete(null)}
        onConfirm={() => deleteMut.mutate(toDelete)} loading={deleteMut.isPending}
        title={/*t*/ 'Delete batch'}
        message={toDelete && `${t('Delete the batch {label}? This cannot be undone.', { label: `${batchTime(toDelete)}, ${title(toDelete.hall)}` })} ${t('A batch that already has bookings cannot be deleted — switch it off instead.')}`}
      />

      <ConfirmModal
        open={Boolean(blocked)} onClose={() => setBlocked(null)}
        onConfirm={() => (blocked.batch.isActive ? activeMut.mutate({ batch: blocked.batch, isActive: false }) : setBlocked(null))}
        loading={activeMut.isPending}
        title={/*t*/ 'Cannot delete'}
        message={blocked && (blocked.batch.isActive
          ? `${blocked.message}. ${t('Switch this batch off so the counter stops offering it? Its old bookings stay.')}`
          : blocked.message)}
        confirmLabel={blocked?.batch.isActive ? /*t*/ 'Switch off' : 'Close'}
        confirmClass="btn-primary"
      />
    </div>
  );
}
