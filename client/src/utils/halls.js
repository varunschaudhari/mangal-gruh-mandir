import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBookingOptions } from '../api/booking.api.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { useLanguage } from '../i18n/index.jsx';

// Halls (Bookings → Setup → Halls). Batches, bookings and slips carry the hall's short code
// (H1); the names come from the hall list as { H1: { name, nameMr } } — in the booking options
// (settings.hallNames), the hall board and the check-in summary.

/** The hall's name in the chosen language ('' when it has none). */
export function hallName(code, names, lang) {
  const h = names?.[code];
  return (lang !== 'en' && h?.nameMr) || h?.name || '';   // Hindi shows the Marathi name too
}

/** "Shri Mangal Sabhagruh (H1)" — or just "H1" for a hall with no name. */
export function hallTitle(code, names, lang) {
  if (!code) return '';
  const name = hallName(code, names, lang);
  return name ? `${name} (${code})` : code;
}

/** For headings and sentences: "Shri Mangal Sabhagruh (H1)", or "Hall H1" for a hall with no name. */
export function hallHeading(t, code, names, lang) {
  if (!code) return '';
  const name = hallName(code, names, lang);
  return name ? `${name} (${code})` : t('Hall {hall}', { hall: code });
}

/**
 * Hall names for this screen: the ones passed in (hall board, check-in summary), else from
 * the booking options for people who can read bookings. Returns { names, name(code), title(code) }.
 */
export function useHallNames(given) {
  const { can } = usePermissions();
  const { lang } = useLanguage();
  const q = useQuery({
    queryKey: ['booking-options'],
    queryFn: getBookingOptions,
    select: (r) => r.data.data?.settings?.hallNames,
    staleTime: 5 * 60_000,
    enabled: !given && can('bookings:read'),
  });
  const names = given || q.data || EMPTY;
  const name = useCallback((code) => hallName(code, names, lang), [names, lang]);
  const title = useCallback((code) => hallTitle(code, names, lang), [names, lang]);
  return { names, name, title };
}

const EMPTY = {};
