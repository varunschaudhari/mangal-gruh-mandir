import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    aliases: [{ type: String, trim: true }],
    // Manufacturer barcode (EAN/UPC…) printed on packaged goods, so the app can scan it.
    barcode: { type: String, trim: true, default: undefined },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
    description: { type: String, default: '' },
    minStockLevel: { type: Number, default: 0, min: 0 },
    reorderPoint: { type: Number, default: 0, min: 0 },
    isPerishable: { type: Boolean, default: false },
    shelfLifeDays: { type: Number, default: null },
    standardRate: { type: Number, default: 0, min: 0 },
    isPujaItem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', aliases: 'text' });
productSchema.index({ barcode: 1 }, { sparse: true });

export default mongoose.model('Product', productSchema);
