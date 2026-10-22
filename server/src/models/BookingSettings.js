import mongoose from 'mongoose';
import { DEVOTEE_LANGUAGES } from '../../../shared/devoteeLanguage.js';
import singleton from './singleton.js';

// Single document with booking options (Setup → Settings).
const bookingSettingsSchema = new mongoose.Schema(
  {
    receiptPrefix:  { type: String, trim: true, uppercase: true, default: 'ABH', maxlength: 8 },
    // What a batch's capacity counts: bookings, or people (sum of each booking's people count).
    capacityUnit:   { type: String, enum: ['bookings', 'people'], default: 'bookings' },
    maxAdvanceDays: { type: Number, default: 90, min: 1, max: 730 },
    // Counter thermal slip
    printerName:    { type: String, trim: true, default: '' },   // QZ Tray printer; blank = Mahaprasad printer
    paperWidth:     { type: Number, enum: [58, 80], default: 80 },
    receiptFooter:  { type: String, trim: true, default: 'Payments are non-refundable. Please arrive 15 minutes before your batch.' },
    // Receipt sent to the devotee's phone
    whatsappAuto:     { type: Boolean, default: true },   // needs WhatsApp set up in Settings
    whatsappTemplate: { type: String, trim: true, default: 'booking_confirmation' },
    whatsappImage:    { type: Boolean, default: true },   // the template has the slip picture on top (Header: Image)
    // The template is approved in these languages (same name in each); new bookings start in
    // whatsappLanguage and the counter can change it per devotee
    whatsappLanguages: { type: [{ type: String, enum: DEVOTEE_LANGUAGES }], default: ['mr', 'en'] },
    whatsappLanguage:  { type: String, enum: DEVOTEE_LANGUAGES, default: 'mr' },
    smsAuto:          { type: Boolean, default: false },  // needs MSG91 + a DLT-approved template
    smsTemplateId:    { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

bookingSettingsSchema.plugin(singleton);   // getOrCreate()

export default mongoose.model('BookingSettings', bookingSettingsSchema);
