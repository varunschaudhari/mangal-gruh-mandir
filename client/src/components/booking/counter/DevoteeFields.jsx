import { useCallback } from 'react';
import { AlertTriangle, CalendarCheck, Loader2, MessageCircle, Minus, Phone, Plus, UserCheck, UserPlus } from 'lucide-react';
import PincodeFields from '../../ui/PincodeFields.jsx';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import haptics from '../../../utils/haptics.js';
import { fmtDay, isValidPhone, toKey } from './counterUtils.js';
import { bookingWhere } from '../bookingFixUtils.js';
import { Kbd } from './bits.jsx';

const Label = ({ htmlFor, children, required, right }) => (
  <label htmlFor={htmlFor} className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
    <span>{children}{required && <span className="ml-0.5 text-red-500">*</span>}</span>
    {right}
  </label>
);
const Err = ({ children }) => (children ? <p className="mt-1 text-xs font-medium text-red-600">{children}</p> : null);

const UPCOMING_SHOWN = 3;

/**
 * Mobile number (looked up as soon as it has 10 digits) and the devotee's name. A returning
 * devotee's bookings still ahead are listed; the one matching the chosen seva + date stands out.
 */
/** The language of the devotee's WhatsApp receipt: मराठी, हिंदी or English (names in their own script).
 * Hindi also gives a Hindi slip and receipt. */
export function MessageLanguage({ value, onChange }) {
  const t = useT();
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 text-gray-500"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />{t('WhatsApp message in')}</span>
      <span className="inline-flex rounded-full bg-gray-100 p-0.5" role="radiogroup" aria-label={t('WhatsApp message in')}>
        {[['mr', 'मराठी'], ['hi', 'हिंदी'], ['en', 'English']].map(([code, label]) => (
          <button key={code} type="button" role="radio" aria-checked={value === code} onClick={() => onChange(code)}
            className={`min-h-[28px] rounded-full px-3 font-semibold transition-colors ${value === code ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-200' : 'text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function PhoneAndName({ phone, onPhone, phoneRef, lookup, errors, name, onName, nameRef, sevaTypes, sevaId, date, messageLang, onMessageLang }) {
  const t = useT();
  const { lang } = useLanguage();
  const valid = isValidPhone(phone);
  const found = valid && lookup.isSuccess ? lookup.data : null;
  const last = found?.lastBooking;
  const lastSeva = last && (lang === 'mr' ? sevaTypes.find((s) => s.name === last.sevaName)?.nameMr : null) || last?.sevaName;
  const lastDay = last ? (last.dateKey || (last.paidAt && toKey(new Date(last.paidAt)))) : '';
  const upcoming = found?.upcoming || [];
  const isMatch = (u) => Boolean(sevaId && date) && String(u.sevaType) === String(sevaId) && u.dateKey === date;
  // The matching booking is always shown, even when it isn't among the first few.
  const shown = upcoming.filter((u, i) => i < UPCOMING_SHOWN || isMatch(u)).slice(0, UPCOMING_SHOWN + 1);
  const seva = (u) => (lang === 'mr' && sevaTypes.find((s) => String(s._id) === String(u.sevaType))?.nameMr) || u.sevaName;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div>
        <Label htmlFor="bk-phone" required right={<Kbd>F2</Kbd>}>{t('Mobile number')}</Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="bk-phone"
            ref={phoneRef}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="98XXXXXXXX"
            aria-invalid={Boolean(errors.phone)}
            className={`input h-12 pl-9 pr-16 text-xl font-bold tracking-wide tabular-nums sm:text-xl ${errors.phone ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs tabular-nums text-gray-400">
            {lookup.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : `${phone.length}/10`}
          </span>
        </div>
        {errors.phone ? <Err>{errors.phone}</Err> : (
          <div className="mt-1 min-h-[20px] text-xs">
            {found ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800">
                  <UserCheck className="h-3 w-3" />
                  {t(found.bookings === 1 ? 'Returning devotee · {n} booking' : 'Returning devotee · {n} bookings', { n: found.bookings })}
                </span>
                {last && <span className="text-gray-500">{t('Last: {seva}, {date}', { seva: lastSeva, date: fmtDay(lastDay, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>}
              </span>
            ) : valid && (lookup.isSuccess || lookup.isError) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                <UserPlus className="h-3 w-3" /> {t('New devotee')}
              </span>
            ) : phone.length === 10 && !valid ? (
              <span className="font-medium text-red-600">{t('Enter a valid 10-digit mobile number')}</span>
            ) : null}
          </div>
        )}
        {shown.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-xs" aria-label={t('Already booked')}>
            {shown.map((u) => {
              const match = isMatch(u);
              return (
                <li key={u._id} className={`flex items-start gap-1.5 rounded-md px-2 py-1 ${match ? 'bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-400' : 'bg-amber-50 text-amber-800'}`}>
                  {match ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> : <CalendarCheck className="mt-px h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 break-words">
                    {t('Already booked: {booking}', { booking: [seva(u), bookingWhere(u, lang)].filter(Boolean).join(' · ') })}
                    {match && <span className="ml-1 whitespace-nowrap rounded bg-amber-600 px-1 py-px text-[10px] font-bold uppercase text-white">{t('Same seva & date')}</span>}
                  </span>
                </li>
              );
            })}
            {upcoming.length > shown.length && (
              <li className="px-2 text-amber-700">{t('+{n} more', { n: upcoming.length - shown.length })}</li>
            )}
          </ul>
        )}
      </div>
      <div>
        <Label htmlFor="bk-name" required>{t('Devotee name')}</Label>
        <input
          id="bk-name"
          ref={nameRef}
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={120}
          placeholder={t('Full name')}
          aria-invalid={Boolean(errors.name)}
          className={`input h-12 text-base font-semibold ${errors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
        />
        <Err>{errors.name}</Err>
        {messageLang && <MessageLanguage value={messageLang} onChange={onMessageLang} />}
      </div>
    </div>
  );
}

/** Address (needed for sevas sent by post), email and the number of people. */
export function DevoteeMore({ seva, devotee, setField, peopleCount, setPeopleCount, errors, addressRef }) {
  const t = useT();
  const postal = Boolean(seva?.needsPostalAddress);
  const max = seva?.maxPeople || 0;
  // The PIN fills city, district and state (several fields at once)
  const setPlace = useCallback((patch) => Object.entries(patch).forEach(([k, v]) => setField(k, v)), [setField]);
  const step = (d) => {
    haptics.tap();
    setPeopleCount(Math.max(1, Math.min(max || 99, peopleCount + d)));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="bk-address" required={postal}>{postal ? t('Postal address') : t('Address')}</Label>
        {postal ? (
          <textarea
            id="bk-address"
            ref={addressRef}
            rows={2}
            value={devotee.address}
            onChange={(e) => setField('address', e.target.value)}
            placeholder={t('House / building, street')}
            maxLength={400}
            aria-invalid={Boolean(errors.address)}
            className={`input resize-y ${errors.address ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
          />
        ) : (
          <input
            id="bk-address"
            ref={addressRef}
            value={devotee.address}
            onChange={(e) => setField('address', e.target.value)}
            placeholder={t('Village / city (optional)')}
            maxLength={400}
            className="input"
          />
        )}
        {postal && !errors.address && <p className="mt-1 text-xs text-gray-400">{t('Prasad is sent to this address.')}</p>}
        <Err>{errors.address}</Err>
        <PincodeFields value={devotee} onChange={setPlace} required={postal} className="mt-2" />
      </div>
      <div>
        <Label htmlFor="bk-email">{t('Email')} <span className="font-normal normal-case tracking-normal text-gray-400">{t('(optional)')}</span></Label>
        <input
          id="bk-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={devotee.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="name@example.com"
          maxLength={120}
          className={`input ${errors.email ? 'border-red-400' : ''}`}
        />
        <Err>{errors.email}</Err>
      </div>
      <div>
        <Label htmlFor="bk-people">{t('People')}</Label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} disabled={peopleCount <= 1} aria-label={t('One less person')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-30">
            <Minus className="h-4 w-4" />
          </button>
          <input
            id="bk-people"
            type="number"
            inputMode="numeric"
            min={1}
            max={max || 99}
            value={peopleCount}
            onChange={(e) => setPeopleCount(Math.max(1, Math.min(max || 99, parseInt(e.target.value, 10) || 1)))}
            onFocus={(e) => e.target.select()}
            className="input h-11 w-16 text-center text-lg font-bold tabular-nums"
          />
          <button type="button" onClick={() => step(1)} disabled={Boolean(max) && peopleCount >= max} aria-label={t('One more person')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-30">
            <Plus className="h-4 w-4" />
          </button>
          {max > 0 && <span className="text-xs text-gray-400">{t('max {n}', { n: max })}</span>}
        </div>
        <Err>{errors.people}</Err>
      </div>
    </div>
  );
}
