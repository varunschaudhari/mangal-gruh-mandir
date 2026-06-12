import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    // ── Temple Info ──────────────────────────────────────────────────────────
    templeName:    { type: String, default: 'Mangal Grah Mandir' },
    templeAddress: { type: String, default: 'Amalner, Dist. Jalgaon, Maharashtra' },
    templePhone:   { type: String, default: '' },
    templeEmail:   { type: String, default: '' },
    templeWebsite: { type: String, default: '' },

    // ── WhatsApp (Meta Cloud API) ────────────────────────────────────────────
    waEnabled:       { type: Boolean, default: false },
    waPhoneNumberId: { type: String, default: '' },
    waAccessToken:   { type: String, default: '' },
    waTemplateName:  { type: String, default: 'stock_alert' },

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

settingsSchema.statics.getOrCreate = async function () {
  let s = await this.findOne();
  if (!s) s = await this.create({});
  return s;
};

export default mongoose.model('Settings', settingsSchema);
