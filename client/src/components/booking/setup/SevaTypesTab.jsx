import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { ConfirmModal } from '../../ui/Modal.jsx';
import { ActiveBadge } from '../../ui/Badge.jsx';
import MobileCard from '../../ui/MobileCard.jsx';
import { deleteSevaType, updateSevaType } from '../../../api/booking.api.js';
import { useT } from '../../../i18n/index.jsx';
import SevaTypeSheet from './SevaTypeSheet.jsx';
import { ScheduleBadge, Switch, errText, rupees, useRefreshBookings, weekdaysText } from './setupUi.jsx';

const servesSeva = (batch, seva) => !batch.sevaTypes?.length || batch.sevaTypes.some((id) => String(id) === String(seva._id));

/** One-line summary of when / how a seva is done. Returns { text, warn }. */
function useSevaDetails(batches, capacityUnit) {
  const t = useT();
  return (s) => {
    const parts = [];
    let warn = false;
    if (s.schedule === 'batch') {
      const n = batches.filter((b) => b.isActive && servesSeva(b, s)).length;
      if (n) parts.push(n === 1 ? t('1 batch') : t('{n} batches', { n }));
      else { parts.push(t('No active batch — add one in the Batches tab')); warn = true; }
    } else if (s.schedule === 'slot') {
      if (s.slotTime) parts.push(s.slotTime);
      parts.push(weekdaysText(t, s.weekdays));
      if (s.dailyLimit === 1) parts.push(capacityUnit === 'people' ? t('only 1 person a day') : t('only 1 booking a day'));
      else if (s.dailyLimit) parts.push(capacityUnit === 'people' ? t('up to {n} people a day', { n: s.dailyLimit }) : t('up to {n} bookings a day', { n: s.dailyLimit }));
      else parts.push(t('no daily limit'));
    } else if (s.schedule === 'arrangement') {
      parts.push(t('Date agreed with the office'));
    } else {
      parts.push(t("done on the devotee's behalf"));
    }
    if (s.duration) parts.push(s.duration);
    if (s.maxPeople) parts.push(t('max {n} people', { n: s.maxPeople }));
    if (s.needsPostalAddress) parts.push(t('postal address'));
    return { text: parts.join(' · '), warn };
  };
}

export default function SevaTypesTab({ setup, canManage }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const { sevaTypes, batches, settings } = setup;
  const details = useSevaDetails(batches, settings.capacityUnit);

  const [editing, setEditing] = useState(null);       // seva or {} for a new one
  const [toDelete, setToDelete] = useState(null);
  const [blocked, setBlocked] = useState(null);       // delete refused: { seva, message }
  const [busyId, setBusyId] = useState(null);

  const activeMut = useMutation({
    mutationFn: ({ seva, isActive }) => updateSevaType(seva._id, { isActive }),
    onMutate: ({ seva }) => setBusyId(seva._id),
    onSuccess: (_, { seva, isActive }) => {
      toast.success(isActive ? t('"{name}" is now active', { name: seva.name }) : t('"{name}" is switched off', { name: seva.name }));
      refresh();
      setBlocked(null);
    },
    onError: (err) => toast.error(errText(t, err)),
    onSettled: () => setBusyId(null),
  });

  const deleteMut = useMutation({
    mutationFn: (seva) => deleteSevaType(seva._id),
    onSuccess: (_, seva) => { toast.success(t('"{name}" deleted', { name: seva.name })); refresh(); setToDelete(null); },
    onError: (err, seva) => {
      setToDelete(null);
      // Has bookings → offer to switch it off instead
      if (err.response?.status === 400) setBlocked({ seva, message: errText(t, err) });
      else toast.error(errText(t, err));
    },
  });

  const nextSortOrder = sevaTypes.reduce((m, s) => Math.max(m, s.sortOrder || 0), 0) + 1;
  const activeCount = sevaTypes.filter((s) => s.isActive).length;

  const actions = (s) => canManage && (
    <>
      <button type="button" onClick={() => setEditing(s)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-primary-700 md:h-9 md:w-9" aria-label={t('Edit')} title={t('Edit')}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setToDelete(s)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-red-600 md:h-9 md:w-9" aria-label={t('Delete')} title={t('Delete')}>
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  const activeCell = (s) => (canManage
    ? <Switch checked={s.isActive} busy={busyId === s._id} onChange={(v) => activeMut.mutate({ seva: s, isActive: v })} label={s.isActive ? t('Active') : t('Inactive')} />
    : <ActiveBadge isActive={s.isActive} />);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {t('{active} of {total} sevas are offered at the counter.', { active: activeCount, total: sevaTypes.length })}
        </p>
        {canManage && (
          <button type="button" onClick={() => setEditing({})} className="btn-primary max-sm:w-full">
            <Plus className="h-4 w-4" />{t('Add seva type')}
          </button>
        )}
      </div>

      {sevaTypes.length === 0 && (
        <div className="card px-4 py-10 text-center text-sm text-gray-400">{t('No seva types yet.')}</div>
      )}

      {/* Phones: cards */}
      <div className="space-y-2 md:hidden">
        {sevaTypes.map((s) => {
          const d = details(s);
          return (
            <MobileCard
              key={s._id}
              className={s.isActive ? '' : 'opacity-60'}
              onClick={canManage ? () => setEditing(s) : undefined}
              title={<>{s.name}{s.code && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 align-middle font-mono text-[11px] text-gray-500">{s.code}</span>}</>}
              subtitle={s.nameMr}
              aside={<span className="text-base font-bold text-gray-900">{rupees(s.price)}</span>}
              fields={[
                { label: t('How it is booked'), value: <span className="flex flex-col items-start gap-1"><ScheduleBadge schedule={s.schedule} /><span className={d.warn ? 'text-amber-700' : ''}>{d.text}</span></span>, full: true },
              ]}
              footer={canManage ? (
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center text-sm text-gray-600">{activeCell(s)}{s.isActive ? t('Active') : t('Inactive')}</span>
                  <span className="flex">{actions(s)}</span>
                </div>
              ) : <ActiveBadge isActive={s.isActive} />}
            />
          );
        })}
      </div>

      {/* Desktop: table */}
      {sevaTypes.length > 0 && (
        <div className="card hidden overflow-hidden md:block">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">{t('Seva')}</th>
                <th className="table-th text-right">{t('Price')}</th>
                <th className="table-th">{t('How it is booked')}</th>
                <th className="table-th">{t('Active')}</th>
                {canManage && <th className="table-th w-24"><span className="sr-only">{t('Actions')}</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sevaTypes.map((s) => {
                const d = details(s);
                return (
                  <tr key={s._id} className={s.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60 text-gray-400'}>
                    <td className={`table-td ${s.isActive ? '' : 'opacity-60'}`}>
                      <div className="font-medium text-gray-900">
                        {s.name}
                        {s.code && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">{s.code}</span>}
                      </div>
                      {s.nameMr && <div className="text-sm text-gray-500" lang="mr">{s.nameMr}</div>}
                    </td>
                    <td className={`table-td whitespace-nowrap text-right font-semibold text-gray-900 ${s.isActive ? '' : 'opacity-60'}`}>{rupees(s.price)}</td>
                    <td className={`table-td ${s.isActive ? '' : 'opacity-60'}`}>
                      <div className="flex flex-col items-start gap-1">
                        <ScheduleBadge schedule={s.schedule} />
                        <span className={`text-xs ${d.warn ? 'flex items-center gap-1 text-amber-700' : 'text-gray-500'}`}>
                          {d.warn && <TriangleAlert className="h-3.5 w-3.5" />}{d.text}
                        </span>
                      </div>
                    </td>
                    <td className="table-td">{activeCell(s)}</td>
                    {canManage && <td className="table-td"><div className="flex justify-end">{actions(s)}</div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SevaTypeSheet
          seva={editing} onClose={() => setEditing(null)}
          batches={batches} capacityUnit={settings.capacityUnit} nextSortOrder={nextSortOrder}
        />
      )}

      <ConfirmModal
        open={Boolean(toDelete)} onClose={() => setToDelete(null)}
        onConfirm={() => deleteMut.mutate(toDelete)} loading={deleteMut.isPending}
        title={/*t*/ 'Delete seva type'}
        message={toDelete && `${t('Delete "{name}"? This cannot be undone.', { name: toDelete.name })} ${t('A seva that already has bookings cannot be deleted — switch it off instead.')}`}
      />

      {/* Delete refused (it has bookings): offer to switch it off */}
      <ConfirmModal
        open={Boolean(blocked)} onClose={() => setBlocked(null)}
        onConfirm={() => (blocked.seva.isActive ? activeMut.mutate({ seva: blocked.seva, isActive: false }) : setBlocked(null))}
        loading={activeMut.isPending}
        title={/*t*/ 'Cannot delete'}
        message={blocked && (blocked.seva.isActive
          ? `${blocked.message}. ${t('Switch "{name}" off so the counter stops offering it? Its old bookings stay.', { name: blocked.seva.name })}`
          : blocked.message)}
        confirmLabel={blocked?.seva.isActive ? /*t*/ 'Switch off' : 'Close'}
        confirmClass="btn-primary"
      />
    </div>
  );
}
