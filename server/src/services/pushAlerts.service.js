import Expense from '../models/Expense.js';
import SupplierPayment from '../models/SupplierPayment.js';
import { sendToPermission, sendToUsers, pushEnabled } from './push.service.js';
import { getStockAlertCounts } from './stockAlerts.service.js';

// What the mobile apps get notified about. Each function is fire-and-forget.

const rupees = (n) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(n || 0))}`;

// A supplier payment needs approval → everyone who can approve payments.
export function pushPaymentSubmitted({ payment, supplierName, submitterId, submitterName }) {
  sendToPermission('payments:approve', {
    title: 'Payment to approve',
    body: `${rupees(payment.totalAmount)} to ${supplierName || 'supplier'} · ${payment.paymentNumber} (by ${submitterName})`,
    url: `/payments/${payment._id}`,
  }, { exceptUserId: submitterId });
}

// A supplier payment was approved/rejected → whoever submitted it.
export function pushPaymentDecision({ payment, approverName }) {
  const userId = payment.createdBy?._id || payment.createdBy;
  if (!userId) return;
  const approved = payment.status === 'approved';
  sendToUsers([userId], {
    title: approved ? 'Payment approved' : 'Payment rejected',
    body: `${payment.paymentNumber} · ${rupees(payment.totalAmount)} — ${approved ? 'approved' : 'rejected'} by ${approverName}`,
    url: `/payments/${payment._id}`,
  });
}

// An expense was recorded (it starts as pending approval) → expense approvers.
export function pushExpenseSubmitted({ expense, submitterId, submitterName }) {
  sendToPermission('payments:approve', {
    title: 'Expense to approve',
    body: `${rupees(expense.amount)} · ${expense.description} (by ${submitterName})`,
    url: `/expenses/${expense._id}`,
  }, { exceptUserId: submitterId });
}

// An expense was approved/rejected → whoever recorded it.
export function pushExpenseDecision({ expense, approverName }) {
  const userId = expense.createdBy?._id || expense.createdBy;
  if (!userId) return;
  const approved = expense.status === 'approved';
  sendToUsers([userId], {
    title: approved ? 'Expense approved' : 'Expense rejected',
    body: `${expense.expenseNumber} · ${rupees(expense.amount)} — ${approved ? 'approved' : 'rejected'} by ${approverName}`,
    url: `/expenses/${expense._id}`,
  });
}

// Morning summary (scheduled in index.js): stock that needs attention and pending approvals.
export async function pushMorningDigest() {
  if (!pushEnabled()) return;

  const { outOfStock, lowStock, reorder } = await getStockAlertCounts();
  const stockLines = [
    outOfStock && `${outOfStock} out of stock`,
    lowStock - outOfStock && `${lowStock - outOfStock} running low`,
    reorder && `${reorder} to reorder`,
  ].filter(Boolean);
  if (stockLines.length) {
    await sendToPermission('reports:read', {
      title: 'Stock needs attention',
      body: stockLines.join(' · '),
      url: '/reports/low-stock',
    });
  }

  const [pendingPayments, pendingExpenses] = await Promise.all([
    SupplierPayment.countDocuments({ status: 'pending_approval' }),
    Expense.countDocuments({ status: 'pending_approval' }),
  ]);
  const approvalLines = [
    pendingPayments && `${pendingPayments} payment${pendingPayments > 1 ? 's' : ''}`,
    pendingExpenses && `${pendingExpenses} expense${pendingExpenses > 1 ? 's' : ''}`,
  ].filter(Boolean);
  if (approvalLines.length) {
    await sendToPermission('payments:approve', {
      title: 'Waiting for your approval',
      body: approvalLines.join(' · '),
      url: pendingPayments ? '/payments?status=pending_approval' : '/expenses?status=pending_approval',
    });
  }
}
