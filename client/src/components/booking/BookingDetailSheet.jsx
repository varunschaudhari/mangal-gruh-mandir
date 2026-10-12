import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Printer, FileText, MessageCircle, Send, Ban, Phone, MapPin, Mail, Users, AlertTriangle, CheckCircle2, Clock,
  PencilLine, CalendarClock, RotateCcw,
} from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Modal from '../ui/Modal.jsx';
import Badge from '../ui/Badge.jsx';
import Spinner from '../ui/Spinner.jsx';
import { checkInBooking, getBooking, getBookingOptions, resendReceipt, undoCheckIn, voidBooking } from '../../api/booking.api.js';
import { printBookingReceipt, printBookingSlip, whatsappShareUrl, fmtPujaDate } from '../../utils/bookingReceipt.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { localDateStr } from '../../utils/formatters.js';
import haptics from '../../utils/haptics.js';
import { formatAddress } from '../../utils/address.js';
import { useLanguage, useT, rich } from '../../i18n/index.jsx';
import { MODE_BADGE, MODE_LABEL, fmtDateTime, fmtDay, fmtTime, nPeople, rupees } from './registerUtils.js';
import { overrideText, verdictOf } from './checkin/checkInUtils.js';
import EditBookingSheet from './EditBookingSheet.jsx';
import MoveBookingSheet from './MoveBookingSheet.jsx';
import BookingHistory from './BookingHistory.jsx';

const QUICK_REASONS = ['Devotee cancelled', 'Entered by mistake', 'Wrong seva or date', 'Payment not received'];

const Section = ({ title, children }) => (
  <section className="mt-4">
    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-gray-100 bg-white p-3 sm:grid-cols-3">{children}</dl>
  </section>
);

const Item = ({ label, children, full }) => {
  if (children === undefined || children === null || children === '' || (Array.isArray(children) && !children.length)) return null;
  return (
    <div className={`min-w-0 ${full ? 'col-span-2 sm:col-span-3' : ''}`}>
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className="break-words text-sm text-gray-800">{children}</dd>
    </div>
  );
};

/**
 * Everything about one booking, with print / WhatsApp / resend / edit / move / void.
 * `booking` may be a full register row or a lighter day-sheet row — the full record is fetched.
 */
export default function BookingDetailSheet({ booking: initial, onClose }) {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const id = initial?._id;

  const { data: full } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBooking(id),
    select: (r) => r.data.data,
    enabled: !!id,
  });
  const { data: options } = useQuery({
    queryKey: ['booking-options'],
    queryFn: getBookingOptions,
    select: (r) => r.data.data,
    staleTime: 5 * 60 * 1000,
  });
  const settings = options?.settings || {};

  const b = full || initial;
  const ready = Boolean(full || initial?.paidAt);
  const voided = b?.status === 'voided';

  const [printing, setPrinting] = useState(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const noticeRef = useRef(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [checkInWarn, setCheckInWarn] = useState(null); // 'batch-over' — let in anyway?
  const [reason, setReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reprint, setReprint] = useState(false); // details changed — offer a fresh slip

  // The notice sits at the bottom of the sheet — bring it into view when it appears.
  useEffect(() => {
    if (notSetUp) noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [notSetUp]);

  const close = () => {
    setNotSetUp(false); setVoidOpen(false); setReason('');
    setEditOpen(false); setMoveOpen(false); setReprint(false); setCheckInWarn(null);
    onClose();
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['booking', id] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['booking-day-sheet'] });
    qc.invalidateQueries({ queryKey: ['booking-summary'] });
    qc.invalidateQueries({ queryKey: ['booking-availability'] });
    qc.invalidateQueries({ queryKey: ['booking-devotee'] });
    qc.invalidateQueries({ queryKey: ['booking-checkin-summary'] });
  };

  // Edit / move answer with the full booking: show it at once (printing then uses the new details).
  const applyChange = (res) => {
    if (res?.data?.data) qc.setQueryData(['booking', id], res);
    refresh();
  };
  const onEdited = (res) => {
    setEditOpen(false);
    if (res?.data?.message === 'Nothing changed') { toast(t('Nothing changed')); return; }
    toast.success(t('Booking updated'));
    applyChange(res);
    setReprint(true);
  };
  const onMoved = (res) => {
    setMoveOpen(false);
    const n = res?.data?.data?.serialNo;
    toast.success(n != null ? t('Moved — new serial {n}', { n }) : t('Booking moved'));
    applyChange(res);
    setReprint(true);
  };

  const print = async (kind) => {
    setPrinting(kind);
    try {
      if (kind === 'slip') await printBookingSlip(b, settings);
      else await printBookingReceipt(b, settings);
    } catch (err) {
      toast.error(err?.message ? t('Could not print: {reason}', { reason: err.message }) : t('Could not print'));
    } finally {
      setPrinting(null);
    }
  };

  const resendMut = useMutation({
    mutationFn: () => resendReceipt(id),
    onSuccess: (res) => {
      const r = res.data.data || {};
      const sent = [r.whatsapp === 'sent' && 'WhatsApp', r.sms === 'sent' && 'SMS'].filter(Boolean);
      if (sent.length) {
        haptics.success();
        toast.success(t('Receipt sent by {channels}', { channels: sent.join(' + ') }));
        setNotSetUp(false);
        refresh();
      } else if (r.whatsapp === 'off' && r.sms === 'off') {
        toast(t('WhatsApp / SMS sending is not set up'));
        setNotSetUp(true);
      } else {
        haptics.error();
        toast.error(t('Could not send the receipt. Use the WhatsApp link instead.'));
        setNotSetUp(true);
      }
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const voidMut = useMutation({
    mutationFn: () => voidBooking(id, reason.trim()),
    onSuccess: () => {
      haptics.success();
      const seatFreed = b.dateKey && b.dateKey >= localDateStr();
      toast.success(seatFreed ? t('Booking voided — the seat is free again') : t('Booking voided'));
      setVoidOpen(false);
      setReason('');
      refresh();
    },
    onError: (e) => { haptics.error(); toast.error(e.response?.data?.message || t('Failed')); },
  });

  // Hall check-in by hand (devotee without the slip), and undo.
  const checkInMut = useMutation({
    mutationFn: (override) => checkInBooking(id, override).then((r) => r.data.data),
    onSuccess: (r) => {
      if (r.checkedIn) {
        haptics.success();
        toast.success(t('Checked in'));
        setCheckInWarn(null);
        refresh();
      } else if (r.canOverride) {
        haptics.warning();
        setCheckInWarn(r.result);
      } else {
        haptics.error();
        toast.error(t(verdictOf(r.result).title));
        refresh();
      }
    },
    onError: (e) => { haptics.error(); toast.error(t(e.response?.data?.message || 'Failed')); },
  });
  const undoCheckInMut = useMutation({
    mutationFn: () => undoCheckIn(id),
    onSuccess: () => { haptics.success(); toast.success(t('Check-in undone')); refresh(); },
    onError: (e) => { haptics.error(); toast.error(t(e.response?.data?.message || 'Failed')); },
  });

  if (!b) return null;
  const d = b.devotee || {};
  // Seva name in Marathi when the seva type has one (day-sheet rows carry only the name).
  const seva = (options?.sevaTypes || []).find((s) => String(s._id) === String(b.sevaType) || s.name === b.sevaName);
  const sevaName = (lang === 'mr' && seva?.nameMr) || b.sevaName;
  const waUrl = whatsappShareUrl(b);
  // Edit / move need the full record (all devotee fields, batch, shift, who took it).
  const canFix = Boolean(full) && !voided && can('bookings:create');

  const footer = ready && (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      <button onClick={() => print('slip')} disabled={!!printing} className="btn-secondary">
        {printing === 'slip' ? <Spinner size="sm" /> : <Printer className="h-4 w-4" />} {t('Print slip')}
      </button>
      <button onClick={() => print('a4')} disabled={!!printing} className="btn-secondary">
        {printing === 'a4' ? <Spinner size="sm" /> : <FileText className="h-4 w-4" />} {t('A4 receipt')}
      </button>
      {!voided && (
        <a href={waUrl} target="_blank" rel="noreferrer" className="btn-secondary text-green-700">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      )}
      {!voided && can('bookings:create') && (
        <button onClick={() => resendMut.mutate()} disabled={resendMut.isPending} className="btn-secondary">
          {resendMut.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />} {t('Resend')}
        </button>
      )}
      {/* Fix without voiding: same receipt number and amount */}
      {canFix && (
        <button onClick={() => setEditOpen(true)} className={`btn-secondary ${b.dateKey ? '' : 'col-span-2'}`}>
          <PencilLine className="h-4 w-4" /> {t('Edit details')}
        </button>
      )}
      {canFix && b.dateKey && (
        <button onClick={() => setMoveOpen(true)} className="btn-secondary">
          <CalendarClock className="h-4 w-4" /> {t('Move')}
        </button>
      )}
      {!voided && can('bookings:void') && (
        <button onClick={() => { haptics.warning(); setVoidOpen(true); }} className="btn col-span-2 border border-red-200 bg-white text-red-600 hover:bg-red-50 focus:ring-red-400">
          <Ban className="h-4 w-4" /> {t('Void')}
        </button>
      )}
    </div>
  );

  return (
    <>
      <Sheet open={!!initial} onClose={close} title={t('Booking details')} size="lg" footer={footer} full>
        {reprint && !voided && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="min-w-[12rem] flex-1">{t('Saved. Print a new slip so the devotee has the right details.')}</span>
            <button onClick={() => print('slip')} disabled={!!printing} className="btn-secondary shrink-0">
              {printing === 'slip' ? <Spinner size="sm" /> : <Printer className="h-4 w-4" />} {t('Print slip')}
            </button>
          </div>
        )}

        {/* Who and what */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-primary-700">{b.receiptNo}</p>
            <p className="mt-0.5 break-words text-lg font-bold text-gray-900">{d.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              {d.phone && (
                <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 text-primary-700">
                  <Phone className="h-3.5 w-3.5" /> {d.phone}
                </a>
              )}
              {b.peopleCount > 1 && (
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {nPeople(t, b.peopleCount)}</span>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold text-gray-900">{rupees(b.amount)}</p>
            {voided
              ? <Badge variant="red">{t('Voided')}</Badge>
              : b.paymentMode && <Badge variant={MODE_BADGE[b.paymentMode]}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Badge>}
          </div>
        </div>

        {voided && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="flex items-center gap-1.5 font-semibold"><Ban className="h-4 w-4" /> {t('This booking was voided')}</p>
            {b.voidReason && <p className="mt-1">{t('Reason')}: {b.voidReason}</p>}
            <p className="mt-0.5 text-xs text-red-700">
              {[b.voidedBy?.name, b.voidedAt && fmtDateTime(b.voidedAt)].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}

        {/* The puja: date, batch, hall and serial — what the devotee asks about at the hall */}
        <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/60 p-3">
          <p className="font-semibold text-gray-900">{sevaName}</p>
          {b.dateKey ? (
            <p className="text-sm text-gray-700">{fmtPujaDate(b)}{b.batchLabel ? ` · ${b.batchLabel}` : ''}</p>
          ) : (
            <p className="text-sm text-gray-600">{b.schedule === 'none' ? t('Performed on the devotee’s behalf (no visit)') : '—'}</p>
          )}
          {(b.hall || b.serialNo) && (
            <div className="mt-2.5 flex gap-2">
              {b.hall && (
                <div className="min-w-[5.5rem] rounded-lg bg-gray-900 px-3 py-1.5 text-center text-white">
                  <p className="text-[10px] uppercase tracking-wide opacity-80">{t('Hall')}</p>
                  <p className="text-xl font-bold leading-6">{b.hall}</p>
                </div>
              )}
              {b.serialNo != null && (
                <div className="min-w-[5.5rem] rounded-lg bg-gray-900 px-3 py-1.5 text-center text-white">
                  <p className="text-[10px] uppercase tracking-wide opacity-80">{t('Serial')}</p>
                  <p className="text-xl font-bold leading-6">{b.serialNo}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hall check-in: when the devotee came, or mark it by hand on the day */}
        {full && b.checkedInAt ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="min-w-[12rem] flex-1">
              {t('Checked in at {time} by {name}', { time: fmtTime(b.checkedInAt), name: b.checkedInBy?.name || '—' })}
              {b.checkInOverride && <span className="block text-xs text-amber-700">{t(overrideText(b.checkInOverride))}</span>}
            </span>
            {can('bookings:checkin') && (
              <button onClick={() => undoCheckInMut.mutate()} disabled={undoCheckInMut.isPending} className="btn-secondary shrink-0 text-sm">
                {undoCheckInMut.isPending ? <Spinner size="sm" /> : <RotateCcw className="h-4 w-4" />} {t('Undo check-in')}
              </button>
            )}
          </div>
        ) : full && !voided && b.dateKey === localDateStr() && can('bookings:checkin') && (
          <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-[10rem] flex-1 text-gray-600">{t('Not arrived yet')}</span>
              <button onClick={() => checkInMut.mutate(false)} disabled={checkInMut.isPending} className="btn-secondary shrink-0 text-sm text-green-700">
                {checkInMut.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-4 w-4" />} {t('Check in')}
              </button>
            </div>
            {checkInWarn && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{t(verdictOf(checkInWarn).title)}</span>
                <button onClick={() => checkInMut.mutate(true)} disabled={checkInMut.isPending} className="btn shrink-0 bg-amber-600 text-sm text-white hover:bg-amber-700">
                  {t('Let in anyway')}
                </button>
              </div>
            )}
          </div>
        )}

        {!ready && <div className="flex justify-center py-6"><Spinner /></div>}

        {/* Sankalp — what the pujari reads out */}
        <Section title={t('Sankalp')}>
          <Item label={t('Gotra')}>{d.gotra || '—'}</Item>
          <Item label={t('Rashi')}>{d.rashi}</Item>
          <Item label={t('Nakshatra')}>{d.nakshatra}</Item>
          <Item label={t('Family names')} full>{d.familyNames?.length ? d.familyNames.join(', ') : undefined}</Item>
          <Item label={t('Date of birth')}>{d.dob ? fmtDay(d.dob) : undefined}</Item>
          <Item label={t('Birth time')}>{d.birthTime}</Item>
          <Item label={t('Birth place')}>{d.birthPlace}</Item>
          <Item label={t('Marital status')}>{d.maritalStatus ? t(d.maritalStatus === 'married' ? 'Married' : 'Unmarried') : undefined}</Item>
          <Item label={t('People')}>{b.peopleCount}</Item>
        </Section>

        {(d.email || formatAddress(d) || b.notes) && (
          <Section title={t('Contact & notes')}>
            <Item label={t('Email')} full>{d.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-gray-400" />{d.email}</span>}</Item>
            <Item label={b.schedule === 'none' ? t('Postal address') : t('Address')} full>
              {formatAddress(d) && <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />{formatAddress(d)}</span>}
            </Item>
            <Item label={t('Notes')} full>{b.notes}</Item>
          </Section>
        )}

        {ready && (
          <Section title={t('Payment')}>
            <Item label={t('Amount')}>{rupees(b.amount)}</Item>
            <Item label={t('Payment Mode')}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Item>
            <Item label={t('Reference No.')}>{b.paymentRef}</Item>
            <Item label={t('Booked on')}>{fmtDateTime(b.paidAt)}</Item>
            <Item label={t('Booked by')}>{b.createdBy?.name || (b.channel === 'online' ? t('Online') : '—')}</Item>
            <Item label={t('Channel')}>{b.channel && t(b.channel === 'online' ? 'Online' : 'Counter')}</Item>
          </Section>
        )}

        {ready && !voided && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('Receipt sent to devotee')}</h3>
            <div className="space-y-1.5 rounded-xl border border-gray-100 bg-white p-3 text-sm">
              {[['WhatsApp', b.whatsappSentAt], ['SMS', b.smsSentAt]].map(([label, at]) => (
                <p key={label} className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">{label}</span>
                  {at
                    ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> {fmtDateTime(at)}</span>
                    : <span className="inline-flex items-center gap-1 text-gray-400"><Clock className="h-4 w-4" /> {t('Not sent')}</span>}
                </p>
              ))}
            </div>
            {notSetUp && (
              <div ref={noticeRef} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t('Automatic WhatsApp / SMS sending is not set up. Send the receipt link from your own WhatsApp instead.')}
                </p>
                <a href={waUrl} target="_blank" rel="noreferrer" className="btn mt-2 w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
                  <MessageCircle className="h-4 w-4" /> {t('Open WhatsApp')}
                </a>
              </div>
            )}
          </section>
        )}

        {/* Edits and moves after booking */}
        <BookingHistory history={b.history} />
      </Sheet>

      {editOpen && full && (
        <EditBookingSheet
          booking={full} seva={seva} sevaTypes={options?.sevaTypes || []}
          onClose={() => setEditOpen(false)} onSaved={onEdited}
        />
      )}
      {moveOpen && full && (
        <MoveBookingSheet
          booking={full} seva={seva} sevaTypes={options?.sevaTypes || []} settings={settings}
          onClose={() => setMoveOpen(false)} onMoved={onMoved}
        />
      )}

      {/* Void: reason is required; the seat goes back on sale */}
      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title={t('Void booking')} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {rich(t('Void receipt {receipt} for {name}? The amount is removed from collections and cannot be restored.'), {
              receipt: <strong className="font-mono">{b.receiptNo}</strong>,
              name: <strong>{d.name}</strong>,
            })}
          </p>
          {b.dateKey && b.dateKey >= localDateStr() && b.serialNo != null && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{t('The seat in this batch becomes free for another devotee.')}</p>
          )}
          <div>
            <label className="label" htmlFor="void-reason">{t('Reason')} <span className="text-red-500">*</span></label>
            <textarea
              id="void-reason" rows={2} value={reason} maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              className="input" placeholder={t('Why is this booking being voided?')}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(t(r))}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 max-sm:py-1.5">
                  {t(r)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button onClick={() => setVoidOpen(false)} className="btn-secondary">{t('Keep')}</button>
            <button onClick={() => voidMut.mutate()} disabled={!reason.trim() || voidMut.isPending} className="btn-danger">
              {voidMut.isPending ? t('Voiding…') : t('Void booking')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
