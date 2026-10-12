import { z } from 'zod';

// Building blocks for request schemas (used with middleware/validate.js). Each takes the field's
// name as people see it on screen; the messages appear as-is in the app's error toast.

// Forms send blank fields as '' (and sometimes null): treat both as "not given".
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const blankToUndefined = (v) => (blank(v) ? undefined : v);

const required = (label) => (iss) => (iss.input === undefined ? `${label} is required` : undefined);

/** Required text, trimmed. */
export const text = (label, { max = 200 } = {}) =>
  z.string({ error: (iss) => required(label)(iss) || `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} can be at most ${max} characters`);

/** Optional text, trimmed; blank becomes "not given". */
export const optionalText = (label, { max = 500 } = {}) =>
  z.preprocess(
    blankToUndefined,
    z.string({ error: `${label} must be text` }).trim().max(max, `${label} can be at most ${max} characters`).optional(),
  );

/** Optional text that can be cleared on an edit: blank stays '' (null too). */
export const clearableText = (label, { max = 500 } = {}) =>
  z.preprocess(
    (v) => (v === null ? '' : v),
    z.string({ error: `${label} must be text` }).trim().max(max, `${label} can be at most ${max} characters`).optional(),
  );

/** Optional text where blank means "none" (stored as null, e.g. a barcode that must stay unique). */
export const nullableText = (label, { max = 100 } = {}) =>
  z.preprocess(
    (v) => (blank(v) ? null : v),
    z.string({ error: `${label} must be text` }).trim().max(max, `${label} can be at most ${max} characters`).nullable().optional(),
  );

/** A number, also accepted as numeric text ("250"). */
export const number = (label, { min, max, integer = false, positive = false } = {}) => {
  let n = z.number({ error: (iss) => required(label)(iss) || `${label} must be a number` });
  if (integer) n = n.int(`${label} must be a whole number`);
  if (positive) n = n.gt(0, `${label} must be more than 0`);
  if (min !== undefined) n = n.min(min, `${label} must be at least ${min}`);
  if (max !== undefined) n = n.max(max, `${label} can be at most ${max}`);
  return z.preprocess((v) => (blank(v) ? undefined : typeof v === 'string' ? Number(v) : v), n);
};

/** Optional number; blank becomes "not given". */
export const optionalNumber = (label, opts) => z.preprocess(blankToUndefined, number(label, opts).optional());

/** Money amount above zero. */
export const amount = (label) =>
  z.preprocess(
    (v) => (blank(v) ? undefined : typeof v === 'string' ? Number(v) : v),
    z.number({ error: (iss) => required(label)(iss) || `${label} must be a number` })
      .gt(0, `${label} must be more than 0`)
      .max(1e9, `${label} is too large`),
  );

/** One of a fixed list of values. */
export const oneOf = (values, label) =>
  z.enum(values, { error: (iss) => required(label)(iss) || `${label} must be one of: ${values.join(', ')}` });

export const optionalOneOf = (values, label) => z.preprocess(blankToUndefined, oneOf(values, label).optional());

/** Date as text (2026-10-12 or a full ISO time); kept as text for the controller. */
export const date = (label) =>
  z.preprocess(
    blankToUndefined,
    z.string({ error: (iss) => required(label)(iss) || `${label} is not a valid date` })
      .refine((v) => !Number.isNaN(Date.parse(v)), `${label} is not a valid date`),
  );

export const optionalDate = (label) => z.preprocess(blankToUndefined, date(label).optional());

/** Database id of a record. */
export const objectId = (label) =>
  z.string({ error: (iss) => required(label)(iss) || `${label} is not valid` }).regex(/^[a-f\d]{24}$/i, `${label} is not valid`);

export const optionalObjectId = (label) => z.preprocess(blankToUndefined, objectId(label).optional());

/** Optional link that can be removed on an edit: blank becomes null. */
export const nullableObjectId = (label) => z.preprocess((v) => (blank(v) ? null : v), objectId(label).nullable().optional());

/** Optional number that can be removed on an edit: blank becomes null. */
export const nullableNumber = (label, opts) => z.preprocess((v) => (blank(v) ? null : v), number(label, opts).nullable().optional());

/** true/false, also accepted as "true"/"false" (query strings, form data). */
export const boolean = (label) =>
  z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean({ error: (iss) => required(label)(iss) || `${label} must be yes or no` }),
  );

export const optionalBoolean = (label) => z.preprocess(blankToUndefined, boolean(label).optional());

/** Indian PAN (ABCDE1234F); typed in any case, stored in capitals. */
export const optionalPan = (label = 'PAN') =>
  z.preprocess(
    (v) => (blank(v) ? undefined : typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.string({ error: `${label} must be text` }).regex(/^[A-Z]{5}\d{4}[A-Z]$/, `${label} must be 10 characters like ABCDE1234F`).optional(),
  );

/** `:id` in the URL. */
export const idParams = (label = 'Record id') => z.object({ id: objectId(label) });

/** ?page=&limit= for lists. */
export const paging = {
  page: optionalNumber('Page', { integer: true, min: 1 }),
  limit: optionalNumber('Limit', { integer: true, min: 1, max: 1000 }),
};
