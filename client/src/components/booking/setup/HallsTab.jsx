import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { ConfirmModal } from '../../ui/Modal.jsx';
import { ActiveBadge } from '../../ui/Badge.jsx';
import { FormField } from '../../ui/FormField.jsx';
import { createBookingHall, deleteBookingHall, updateBookingHall } from '../../../api/booking.api.js';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { hallHeading } from '../../../utils/halls.js';
import { HallChip, Switch, SwitchRow, errText, hallList, hallNamesOf, useRefreshBookings } from './setupUi.jsx';

// Setup → Halls: the halls batches run in. The short code (H1) is printed big on the slip and
// can't change once added; the names (English and Marathi) can, and show everywhere at once —
// "Shri Mangal Sabhagruh (H1)" on slips, receipts and the hall screen.

const CODE = /^[A-Z0-9-]{1,8}$/;

function HallSheet({ hall, halls, onClose }) {
  const t = useT();
  const { lang } = useLanguage();
  const refresh = useRefreshBookings();
  const isNew = !hall?._id;
  const [code, setCode] = useState(hall?.code || '');
  const [name, setName] = useState(hall?.name || '');
  const [nameMr, setNameMr] = useState(hall?.nameMr || '');
  const [isActive, setIsActive] = useState(hall?.isActive !== false);
  const [tried, setTried] = useState(false);

  const clean = code.trim().toUpperCase();
  const codeError = isNew && tried && (!clean
    ? t('{label} is required', { label: t('Hall code') })
    : !CODE.test(clean) ? t('Up to 8 capital letters or digits, like H1')
      : halls.some((h) => h.code.toUpperCase() === clean) ? t('Hall {hall} is already in the list', { hall: clean }) : '');
  const shown = clean || 'H1';
  const preview = hallHeading(t, shown, { [shown]: { name: name.trim(), nameMr: nameMr.trim() } }, lang);

  const mut = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), nameMr: nameMr.trim(), isActive };
      return isNew ? createBookingHall({ ...data, code: clean }) : updateBookingHall(hall._id, data);
    },
    onSuccess: () => {
      toast.success(isNew ? t('{hall} added', { hall: preview }) : t('{hall} saved', { hall: preview }));
      refresh();
      onClose();
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (isNew && (!CODE.test(clean) || halls.some((h) => h.code.toUpperCase() === clean))) return;
    mut.mutate();
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
      <button type="submit" form="hall-form" disabled={mut.isPending} className="btn-primary">
        {mut.isPending ? t('Saving…') : t('Save')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={isNew ? t('Add hall') : t('Edit hall {hall}', { hall: hall.code })} size="md" footer={footer}>
      <form id="hall-form" onSubmit={submit} className="space-y-5" noValidate>
        {isNew ? (
          <FormField label={t('Hall code')} required error={codeError}
            hint={t('Short code printed big on the slip and shown on the hall screen. It can’t be changed later.')}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} autoComplete="off" autoFocus
              className="input w-32 font-bold uppercase tracking-wide" placeholder="H4" />
          </FormField>
        ) : (
          <div>
            <p className="label">{t('Hall code')}</p>
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <HallChip hall={hall.code} halls={hallList([], halls)} />
              {t('The code can’t be changed — slips already carry it.')}
            </p>
          </div>
        )}

        <FormField label={t('Name')} hint={t('As devotees know the hall')}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="input"
            placeholder={t('e.g. {example}', { example: 'Shri Mangal Sabhagruh' })} />
        </FormField>
        <FormField label={t('Name in Marathi')} hint={t('Shown when the screen is in Marathi; the English name is used if left blank')}>
          <input value={nameMr} onChange={(e) => setNameMr(e.target.value)} maxLength={60} className="input" lang="mr"
            placeholder={t('e.g. {example}', { example: 'श्री मंगल सभागृह' })} />
        </FormField>

        <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {t('On slips and the hall screen:')} <b className="text-gray-900">{preview}</b>
        </p>

        <SwitchRow label={t('Active')} hint={t('Switched off, it can’t be chosen for new batches. Old bookings keep it.')}
          checked={isActive} onChange={setIsActive} />
      </form>
    </Sheet>
  );
}

export default function HallsTab({ setup, canManage }) {
  const t = useT();
  const { lang } = useLanguage();
  const refresh = useRefreshBookings();
  const { halls = [], batches } = setup;
  const codes = hallList([], halls);
  const names = hallNamesOf(halls);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const usage = (h) => {
    const mine = batches.filter((b) => b.hall === h.code);
    return { active: mine.filter((b) => b.isActive).length, all: mine.length };
  };
  const usageText = (h) => {
    const u = usage(h);
    if (!u.all) return t('No batches');
    return u.active === u.all ? t('{n} batches', { n: u.all }) : t('{n} batches ({active} active)', { n: u.all, active: u.active });
  };

  const activeMut = useMutation({
    mutationFn: ({ hall, isActive }) => updateBookingHall(hall._id, { isActive }),
    onMutate: ({ hall }) => setBusyId(hall._id),
    onSuccess: (_, { hall, isActive }) => {
      const label = hallHeading(t, hall.code, names, lang);
      toast.success(isActive ? t('{hall} is now active', { hall: label }) : t('{hall} is switched off', { hall: label }));
      refresh();
    },
    onError: (err) => toast.error(errText(t, err), { duration: 6000 }),
    onSettled: () => setBusyId(null),
  });

  const deleteMut = useMutation({
    mutationFn: (hall) => deleteBookingHall(hall._id),
    onSuccess: (_, hall) => {
      toast.success(t('{hall} deleted', { hall: t('Hall {hall}', { hall: hall.code }) }));
      refresh();
      setToDelete(null);
    },
    onError: (err) => { setToDelete(null); toast.error(errText(t, err), { duration: 6000 }); },
  });

  const actions = (h) => canManage && (
    <>
      <button type="button" onClick={() => setEditing(h)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-primary-700 md:h-9 md:w-9" aria-label={t('Edit')} title={t('Edit')}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setToDelete(h)} className="btn-ghost h-11 w-11 p-0 text-gray-500 hover:text-red-600 md:h-9 md:w-9" aria-label={t('Delete')} title={t('Delete')}>
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
  const activeCell = (h) => (canManage
    ? <Switch checked={h.isActive} busy={busyId === h._id} onChange={(v) => activeMut.mutate({ hall: h, isActive: v })} label={h.isActive ? t('Active') : t('Inactive')} />
    : <ActiveBadge isActive={h.isActive} />);
  const nameCell = (h) => (
    <div className="min-w-0">
      <p className={`truncate font-medium ${h.name ? 'text-gray-900' : 'text-gray-400'}`}>{h.name || t('No name yet')}</p>
      {h.nameMr && <p className="truncate text-sm text-gray-500" lang="mr">{h.nameMr}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{t('Each batch runs in one hall. Slips and the hall screen show the name with the code.')}</p>
        {canManage && (
          <button type="button" onClick={() => setEditing({})} className="btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" />{t('Add hall')}
          </button>
        )}
      </div>

      {halls.length === 0 && (
        <div className="card px-4 py-10 text-center text-sm text-gray-400">{t('No halls yet. Add the halls first, then the batches.')}</div>
      )}

      {/* Phones: cards */}
      <div className="space-y-2 md:hidden">
        {halls.map((h) => (
          <div key={h._id} className="card p-3">
            <div className={`flex items-start gap-3 ${h.isActive ? '' : 'opacity-60'}`}>
              <HallChip hall={h.code} halls={codes} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                {nameCell(h)}
                <p className="mt-0.5 text-xs text-gray-500">{usageText(h)}</p>
              </div>
            </div>
            {canManage ? (
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-1">
                <span className="flex items-center text-sm text-gray-600">{activeCell(h)}{h.isActive ? t('Active') : t('Inactive')}</span>
                <span className="flex">{actions(h)}</span>
              </div>
            ) : (
              !h.isActive && <div className="mt-2"><ActiveBadge isActive={false} /></div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      {halls.length > 0 && (
        <div className="card hidden overflow-hidden md:block">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th w-20">{t('Code')}</th>
                <th className="table-th">{t('Name')}</th>
                <th className="table-th">{t('Batches')}</th>
                <th className="table-th">{t('Active')}</th>
                {canManage && <th className="table-th w-24"><span className="sr-only">{t('Actions')}</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {halls.map((h) => (
                <tr key={h._id} className={h.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60'}>
                  <td className={`table-td ${h.isActive ? '' : 'opacity-60'}`}><HallChip hall={h.code} halls={codes} /></td>
                  <td className={`table-td max-w-[24rem] ${h.isActive ? '' : 'opacity-60'}`}>{nameCell(h)}</td>
                  <td className={`table-td text-sm text-gray-600 ${h.isActive ? '' : 'opacity-60'}`}>{usageText(h)}</td>
                  <td className="table-td py-1">{activeCell(h)}</td>
                  {canManage && <td className="table-td py-1"><div className="flex justify-end">{actions(h)}</div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <HallSheet hall={editing} halls={halls} onClose={() => setEditing(null)} />}

      <ConfirmModal
        open={Boolean(toDelete)} onClose={() => setToDelete(null)}
        onConfirm={() => deleteMut.mutate(toDelete)} loading={deleteMut.isPending}
        title={/*t*/ 'Delete hall'}
        message={toDelete && `${t('Delete {hall}?', { hall: hallHeading(t, toDelete.code, names, lang) })} ${t('A hall that batches or bookings use cannot be deleted — switch it off instead.')}`}
      />
    </div>
  );
}
