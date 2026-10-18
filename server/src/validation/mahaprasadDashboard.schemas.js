import { z } from 'zod';

// Mahaprasad dashboard (controllers/mahaprasadDashboard.controller.js)

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()), 'Not a date');

export const getDashboard = { query: z.object({ date: day.optional() }) };

// The day's total = Settings → Mahaprasad daily cap: a number of persons, 0 = no limit
export const setTarget = {
  body: z.object({
    target: z.preprocess((v) => (typeof v === 'string' ? Number(v.trim() || NaN) : v),
      z.number({ error: 'Total must be a number' }).int('Total must be a whole number')
        .min(0, 'Total can’t be negative').max(1000000, 'Total is too large')),
  }),
};
