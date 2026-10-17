import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../models/Expense.js';
import {
  clearableText, idParams, objectId, optionalBoolean, optionalDate, optionalNumber,
  optionalObjectId, optionalOneOf, optionalText, text,
} from './common.js';

// Sign-in, users, roles, settings, budgets, payment templates.

const password = (label) => z.string({ error: `${label} is required` })
  .min(6, `${label} must be at least 6 characters`).max(128, `${label} can be at most 128 characters`);
const email = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.email({ error: (iss) => (iss.input === undefined ? 'Email is required' : 'Email is not valid') }));
// A form sends an empty checkbox group as false (or one value): normalise to a list of ids
const departments = z.preprocess(
  (v) => [].concat(v ?? []).filter((d) => typeof d === 'string' && d.trim()),
  z.array(objectId('Department')).max(50),
).optional();
const flag = (label) => optionalBoolean(label);

// ── Sign-in ─────────────────────────────────────────────────────────────────
export const login = {
  body: z.object({
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), text('Email', { max: 200 })),
    password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
    client: optionalOneOf(['web', 'app'], 'Client'),
  }),
};
// /auth/refresh is left as it is: a missing token must stay a 401, which the app treats as "signed out".
export const updateProfile = { body: z.object({ name: text('Name', { max: 100 }), phone: clearableText('Phone', { max: 20 }) }) };
export const changePassword = {
  body: z.object({ currentPassword: z.string({ error: 'Current password is required' }).min(1, 'Current password is required').max(128), newPassword: password('New password') }),
};

// ── Users ───────────────────────────────────────────────────────────────────
// staffProfile (attendance & salary details) is checked by services/staffProfile.service.js
// A user without a profile comes back from GET as staffProfile: null — that means "no change"
const staffProfile = z.preprocess((v) => (v === null ? undefined : v), z.record(z.string(), z.unknown()).optional());

export const createUser = {
  body: z.object({
    name: text('Name', { max: 100 }),
    email,
    password: password('Password'),
    phone: clearableText('Phone', { max: 20 }),
    role: text('Role', { max: 50 }),
    departments,
    whatsappAlertsEnabled: flag('WhatsApp alerts'),
    smsAlertsEnabled: flag('SMS alerts'),
    canApproveAssets: flag('Can approve assets'),
    canApprovePayments: flag('Can approve payments'),
    staffProfile,
  }),
};
export const updateUser = {
  params: idParams('User id'),
  body: z.object({
    name: text('Name', { max: 100 }).optional(),
    phone: clearableText('Phone', { max: 20 }),
    role: optionalText('Role', { max: 50 }),
    departments,
    isActive: flag('Active'),
    whatsappAlertsEnabled: flag('WhatsApp alerts'),
    smsAlertsEnabled: flag('SMS alerts'),
    canApproveAssets: flag('Can approve assets'),
    canApprovePayments: flag('Can approve payments'),
    staffProfile,
  }),
};
export const userById = { params: idParams('User id') };
export const resetPassword = { params: idParams('User id'), body: z.object({ newPassword: password('Password') }) };

// ── Roles ───────────────────────────────────────────────────────────────────
// "module:action", or "*" (everything — only a super admin may grant it; see role.controller.js)
const permissions = z.array(
  z.string().regex(/^(\*|[a-z_]+:[a-z_]+)$/, 'Unknown permission format'),
  { error: 'Permissions must be a list' },
).max(200).optional();

export const createRole = {
  body: z.object({
    slug: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v),
      z.string({ error: 'Slug is required' }).regex(/^[a-z0-9_]+$/, 'Slug must be lowercase letters, numbers, underscores only').max(50)),
    name: text('Name', { max: 100 }),
    description: clearableText('Description', { max: 500 }),
    permissions,
  }),
};
export const updateRole = {
  params: idParams('Role id'),
  body: z.object({
    name: text('Name', { max: 100 }).optional(),
    description: clearableText('Description', { max: 500 }),
    permissions,
    isActive: flag('Active'),
  }),
};
export const roleById = { params: idParams('Role id') };

// ── Settings ────────────────────────────────────────────────────────────────
const dayPrice = optionalNumber('Price', { min: 0, max: 100000 });
// A WhatsApp template's name as in WhatsApp Manager; empty = that message is not sent
const waTemplate = (label) => z.preprocess((v) => (typeof v === 'string' ? v.trim() : v === null ? '' : v),
  z.string({ error: `${label} template must be text` }).max(512, `${label} template name is too long`)
    .regex(/^[a-z0-9_]*$/, `${label} template: use the name exactly as in WhatsApp Manager (small letters, numbers and _)`).optional());
const clearableDate = z.union([z.literal(''), z.null(), optionalDate('Date')]).optional();

export const updateSettings = {
  body: z.object({
    templeName: clearableText('Temple name', { max: 150 }),
    templeNameMr: clearableText('Temple name in Marathi', { max: 150 }),
    trustRegNumber: clearableText('Trust registration number', { max: 100 }),
    trustLegalName: clearableText('Trust legal name', { max: 150 }),
    templeAddress: clearableText('Temple address', { max: 300 }),
    templePhone: clearableText('Temple phone', { max: 30 }),
    templeEmail: clearableText('Temple email', { max: 150 }),
    templeWebsite: clearableText('Temple website', { max: 200 }),
    allowExcelExport: flag('Excel downloads'),
    waEnabled: flag('WhatsApp'),
    waPhoneNumberId: clearableText('WhatsApp phone number id', { max: 50 }),
    waAccessToken: clearableText('WhatsApp access token', { max: 1000 }),
    waTemplates: z.object({
      stockAlert: waTemplate('Stock alert'),
      donationThanks: waTemplate('Donation thank-you'),
      mahaprasadCoupons: waTemplate('Mahaprasad coupons'),
      assetReminder: waTemplate('Asset reminder'),
      paymentApproval: waTemplate('Payment approval'),
      paymentStatus: waTemplate('Payment approved / rejected'),
      overdueSummary: waTemplate('Overdue invoices'),
    }, { error: 'WhatsApp templates must be a list of names' }).optional(),
    waLanguages: z.object({
      donationThanks: optionalOneOf(['mr', 'en'], 'Donation message language'),
      mahaprasadCoupons: optionalOneOf(['mr', 'en'], 'Mahaprasad message language'),
    }, { error: 'WhatsApp languages must be a list' }).optional(),
    smsEnabled: flag('SMS'),
    msg91AuthKey: clearableText('MSG91 key', { max: 200 }),
    msg91TemplateId: clearableText('MSG91 template', { max: 100 }),
    alertOnOutOfStock: flag('Out-of-stock alerts'),
    alertOnLowStock: flag('Low-stock alerts'),
    alertOnReorder: flag('Reorder alerts'),
    trustPAN: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v === null ? '' : v),
      z.string().regex(/^([A-Z]{5}\d{4}[A-Z])?$/, 'Trust PAN must be 10 characters like ABCDE1234F').optional()),
    reg80GNumber: clearableText('80G registration number', { max: 100 }),
    reg80GFrom: clearableDate,
    reg80GTo: clearableDate,
    assetMaxBorrowDays: optionalNumber('Maximum borrow days', { integer: true, min: 1, max: 30 }),
    mahaprasadDayPricing: z.object({
      monday: dayPrice, tuesday: dayPrice, wednesday: dayPrice, thursday: dayPrice,
      friday: dayPrice, saturday: dayPrice, sunday: dayPrice,
    }).optional(),
    mahaprasadDailyCap: optionalNumber('Daily coupon limit', { integer: true, min: 0, max: 1000000 }),
    mahaprasadCouponValidityDays: optionalNumber('Coupon validity (days)', { integer: true, min: 0, max: 365 }),
    mahaprasadPrinterName: clearableText('Printer', { max: 200 }),
    mahaprasadOnlineEnabled: flag('Online Mahaprasad coupons'),
    mahaprasadOnlineDaysAhead: optionalNumber('Days ahead for online coupons', { integer: true, min: 0, max: 60 }),
    mahaprasadOnlineMaxPlates: optionalNumber('Plates per online order', { integer: true, min: 1, max: 50 }),
    mahaprasadOnlineCutoff: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v === null ? '' : v),
      z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Last time for today’s online coupons must be a time like 11:30').optional()),
  }),
};
export const testWhatsApp = { body: z.object({ phone: clearableText('Phone number', { max: 20 }) }) };

// ── Budgets ─────────────────────────────────────────────────────────────────
export const upsertBudgets = {
  body: z.object({
    year: optionalNumber('Year', { integer: true, min: 2000, max: 2100 }).refine((v) => v !== undefined, 'Year is required'),
    month: optionalNumber('Month', { integer: true, min: 1, max: 12 }).refine((v) => v !== undefined, 'Month is required'),
    budgets: z.partialRecord(z.enum(EXPENSE_CATEGORIES, { error: 'Unknown expense category' }), optionalNumber('Budget', { min: 0, max: 1e10 }),
      { error: 'Budgets must be a list of amounts by category' }),
  }),
};

// ── Payment templates ───────────────────────────────────────────────────────
export const createTemplate = {
  body: z.object({
    name: text('Template name', { max: 100 }),
    supplier: objectId('Supplier'),
    paymentMode: optionalOneOf(['cash', 'upi', 'neft', 'rtgs', 'cheque'], 'Payment mode'),
    bankName: optionalText('Bank', { max: 200 }),
    selectedBankAccountId: optionalObjectId('Bank account'),
    notes: optionalText('Notes', { max: 1000 }),
  }),
};
export const templateById = { params: idParams('Template id') };
