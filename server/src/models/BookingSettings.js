import mongoose from 'mongoose';

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
    smsAuto:          { type: Boolean, default: false },  // needs MSG91 + a DLT-approved template
    smsTemplateId:    { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

bookingSettingsSchema.statics.getOrCreate = async function getOrCreate() {
  return (await this.findOne()) || this.create({});
};

export default mongoose.model('BookingSettings', bookingSettingsSchema);
