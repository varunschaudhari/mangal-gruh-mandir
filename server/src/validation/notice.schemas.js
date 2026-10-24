import { z } from 'zod';
import { clearableText, idParams, optionalBoolean, optionalOneOf } from './common.js';
import { NOTICE_AUDIENCES } from '../models/Notice.js';

// Notice board (controllers/notice.controller.js). Title and text are typed per language
// (Marathi, Hindi, English); at least one language needs a title.

const inLanguages = (label, max) => z.object({
  mr: clearableText(`${label} (Marathi)`, { max }),
  hi: clearableText(`${label} (Hindi)`, { max }),
  en: clearableText(`${label} (English)`, { max }),
}, { error: `${label} must be text per language` });

const hasTitle = (title) => Boolean(title && ['mr', 'hi', 'en'].some((l) => title[l]));
const TITLE_NEEDED = { message: 'Write the title in at least one language', path: ['title'] };

const shape = {
  title: inLanguages('Title', 150),
  body: inLanguages('Notice', 2000).optional(),
  audience: optionalOneOf(NOTICE_AUDIENCES, 'Who it is for'),
  isActive: optionalBoolean('Showing'),
};

export const create = {
  body: z.object(shape).refine((b) => hasTitle(b.title), TITLE_NEEDED),
};

export const update = {
  params: idParams('Notice id'),
  // Only the fields sent change; a title that is sent still needs one language
  body: z.object(shape).partial().refine((b) => b.title === undefined || hasTitle(b.title), TITLE_NEEDED),
};

export const byId = { params: idParams('Notice id') };
