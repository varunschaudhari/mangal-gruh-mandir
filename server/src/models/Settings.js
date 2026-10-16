import mongoose from 'mongoose';
import singleton from './singleton.js';

// WhatsApp template names (approved in WhatsApp Manager). An empty name means that message is not
// sent. The booking receipt's template is in BookingSettings.
export const WA_TEMPLATE_DEFAULTS = {
  stockAlert: 'stock_alert',
  donationThanks: 'donation_thankyou',
  mahaprasadCoupons: '',                      // off until named: the counter also has a "WhatsApp" button
  assetReminder: 'asset_reminder',
  paymentApproval: 'payment_approval_request',
  paymentStatus: 'payment_status_update',
  overdueSummary: 'payment_overdue_summary',
};

const settingsSchema = new mongoose.Schema(
  {
    // ── Temple Info ──────────────────────────────────────────────────────────
    templeName:    { type: String, default: 'Mangal Grah Mandir' },
    templeNameMr:  { type: String, default: 'श्री मंगळग्रह मंदिर, अमळनेर' },   // printed above the English name
    trustRegNumber: { type: String, default: '' },                            // public trust registration no.
    trustLegalName: { type: String, default: '' },                            // the trust that runs the temple, as on its PAN
    templeAddress: { type: String, default: 'Amalner, Dist. Jalgaon, Maharashtra' },
    templePhone:   { type: String, default: '' },
    templeEmail:   { type: String, default: '' },
    templeWebsite: { type: String, default: '' },

    // ── WhatsApp (Meta Cloud API) ────────────────────────────────────────────
    waEnabled:       { type: Boolean, default: false },
    waPhoneNumberId: { type: String, default: '' },
    waAccessToken:   { type: String, default: '' },
    waTemplates: Object.fromEntries(Object.entries(WA_TEMPLATE_DEFAULTS).map(([k, v]) => [k, { type: String, default: v }])),

    // ── SMS (MSG91) ──────────────────────────────────────────────────────────
    smsEnabled:      { type: Boolean, default: false },
    msg91AuthKey:    { type: String, default: '' },
    msg91TemplateId: { type: String, default: '' },

    // ── Stock Alert Defaults ─────────────────────────────────────────────────
    alertOnOutOfStock: { type: Boolean, default: true },
    alertOnLowStock:   { type: Boolean, default: true },
    alertOnReorder:    { type: Boolean, default: true },

    // ── 80G / Tax Exemption ──────────────────────────────────────────────────
    trustPAN:       { type: String, default: '' },
    reg80GNumber:   { type: String, default: '' },
    reg80GFrom:     { type: Date },
    reg80GTo:       { type: Date },

    // ── Asset Settings ───────────────────────────────────────────────────────
    assetMaxBorrowDays: { type: Number, default: 7, min: 1, max: 30 },

    // ── Mahaprasad ───────────────────────────────────────────────────────────
    mahaprasadDayPricing: {
      monday:    { type: Number, default: 0, min: 0 },
      tuesday:   { type: Number, default: 0, min: 0 },
      wednesday: { type: Number, default: 0, min: 0 },
      thursday:  { type: Number, default: 0, min: 0 },
      friday:    { type: Number, default: 0, min: 0 },
      saturday:  { type: Number, default: 0, min: 0 },
      sunday:    { type: Number, default: 0, min: 0 },
    },
    mahaprasadDailyCap:            { type: Number, default: 0,  min: 0 }, // 0 = no limit
    mahaprasadCouponValidityDays:  { type: Number, default: 1,  min: 0 }, // 0 = no expiry
    mahaprasadPrinterName:         { type: String, default: '' },
  },
  { timestamps: true }
);

settingsSchema.plugin(singleton);   // getOrCreate()

export default mongoose.model('Settings', settingsSchema);
