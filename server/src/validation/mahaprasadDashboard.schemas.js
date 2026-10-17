import { z } from 'zod';

// Mahaprasad dashboard (controllers/mahaprasadDashboard.controller.js)

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()), 'Not a date');

export const getDashboard = { query: z.object({ date: day.optional() }) };

export const setTarget = {
  body: z.object({
    date: day.optional(),
    // a number of persons; null with a date = back to the usual total
    target: z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v),
      z.number({ error: 'Total must be a number' }).int('Total must be a whole number')
        .min(0, 'Total can’t be negative').max(1000000, 'Total is too large').nullable()),
  }).refine((b) => b.target !== null || b.date, { message: 'The usual daily total needs a number', path: ['target'] }),
};
