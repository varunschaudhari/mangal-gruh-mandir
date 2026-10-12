import SupplierPayment from '../models/SupplierPayment.js';
import { dayKey, nextNumber } from './sequence.service.js';

/** PAY-YYYYMMDD-NNN, numbered per payment date. */
export function generatePaymentNumber(date = new Date()) {
  return nextNumber({ prefix: `PAY-${dayKey(date)}-`, sources: [{ model: SupplierPayment, field: 'paymentNumber' }] });
}
