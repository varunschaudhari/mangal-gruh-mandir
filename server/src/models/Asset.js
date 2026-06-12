import mongoose from 'mongoose';

export const ASSET_CATEGORIES = ['Electronics', 'Utensils', 'Furniture', 'Mandap', 'Vessels', 'Decoration', 'Other'];

const assetSchema = new mongoose.Schema(
  {
    assetCode:     { type: String, unique: true, sparse: true },
    name:          { type: String, required: true, trim: true },
    category:      { type: String, enum: ASSET_CATEGORIES, default: 'Other' },
    description:   { type: String, default: '' },
    totalQuantity: { type: Number, required: true, min: 1 },
    purchaseDate:  { type: Date },
    finePerDay:    { type: Number, default: 0, min: 0 },
    isBorrowable:  { type: Boolean, default: true },
    isActive:      { type: Boolean, default: true },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Asset', assetSchema);
