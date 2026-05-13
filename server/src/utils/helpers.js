import Product from '../models/Product.js';

export const generateProductCode = async () => {
  const last = await Product.findOne({}, { code: 1 }).sort({ createdAt: -1 });
  if (!last?.code) return 'PRD-0001';
  const num = parseInt(last.code.split('-')[1], 10) + 1;
  return `PRD-${String(num).padStart(4, '0')}`;
};

export const paginate = (query, { page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  return query.skip(skip).limit(Number(limit));
};
