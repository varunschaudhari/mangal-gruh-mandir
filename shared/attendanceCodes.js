// Attendance register codes: the same letters on the Register screen and in the Excel export.

export const STATUS_CODES = {
  present: 'P',
  half_day: 'H',
  absent: 'A',
  leave: 'L',
  off: 'WO',
  holiday: 'HO',
  worked_off: 'WP',
  on_duty: 'OD',
  missing_punch: 'MP',
  working: 'IN',
  not_in: '·',
  upcoming: '',
  unscheduled: 'U',
  none: '',
  not_employed: '–',
};

/**
 * Register code for a day. An absent or leave day shows what covered it: PL paid leave,
 * EL extra leave, A / UL unpaid (absent / planned unpaid leave). A "+" marks a double shift.
 */
export function dayCode(day) {
  if (!day) return '';
  if ((day.status === 'absent' || day.status === 'leave') && day.cover) {
    const { paid, extra, unpaid } = day.cover;
    if (paid > 0 && paid >= extra && paid >= unpaid) return 'PL';
    if (extra > 0 && extra >= unpaid) return 'EL';
    return day.status === 'leave' ? 'UL' : 'A';
  }
  const code = STATUS_CODES[day.status] ?? '';
  return code && day.double ? `${code}+` : code;
}
