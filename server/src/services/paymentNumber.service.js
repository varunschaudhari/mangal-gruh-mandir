import SupplierPayment from '../models/SupplierPayment.js';

function formatDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function generatePaymentNumber(date = new Date()) {
  const dateStr = formatDateKey(date);
  const prefix  = `PAY-${dateStr}-`;
  const last    = await SupplierPayment.findOne(
    { paymentNumber: { $regex: `^${prefix}` } },
    { paymentNumber: 1 },
    { sort: { paymentNumber: -1 } }
  ).lean();
  let seq = 1;
  if (last?.paymentNumber) {
    const parts = last.paymentNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}
