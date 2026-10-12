import ApiError from '../utils/ApiError.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Checks a request against zod schemas before the controller runs:
 *
 *   router.post('/', authorize('payments:write'), validate(createExpense), createExpense);
 *
 * where createExpense = { body: z.object({…}), query?: …, params?: … } (see src/validation/).
 * The controller then reads the cleaned values from req.body / req.query / req.params: text is
 * trimmed, numbers sent as text are numbers, and fields the schema doesn't name are dropped.
 *
 * Any problem → 400, with every message in `message` (shown as-is in the app's toast) and each
 * field in `errors`:
 *   { success: false, message: 'Amount must be more than 0. Payment mode is required',
 *     errors: [{ field: 'amount', message: 'Amount must be more than 0' }, …] }
 */
export default function validate(schemas) {
  return (req, res, next) => {
    const errors = [];
    const clean = {};
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) clean[part] = result.data;
      else errors.push(...result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    if (errors.length) {
      return next(new ApiError(400, [...new Set(errors.map((e) => e.message))].join('. '), errors));
    }
    for (const [part, value] of Object.entries(clean)) {
      // Express 5 serves req.query from a getter, so the cleaned value is set on this request
      Object.defineProperty(req, part, { value, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
}
