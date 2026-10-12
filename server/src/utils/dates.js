// Calendar helpers for the app's time zone (IST — see config/timezone.js).

import { localDateStr } from '../../../shared/dates.js';

export const APP_TIMEZONE = process.env.TZ || 'Asia/Kolkata';

// YYYY-MM-DD of the local (IST) day — shared with the app (see /shared/dates.js)
export { localDateStr };
