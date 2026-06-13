/**
 * Expense Test Data Seed
 * Creates ~20 realistic temple expenses across March–June 2026
 * covering all 8 categories and all 3 payment modes.
 * Run after index.js (needs an admin user in DB).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Expense from '../models/Expense.js';
import { generateExpenseNumber } from '../services/expenseNumber.service.js';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
};

const seed = async () => {
  await connectDB();
  console.log('Seeding expense test data…');

  const admin = await User.findOne({ role: 'super_admin' }).lean();
  if (!admin) {
    console.error('No super_admin user found. Run index.js first.');
    process.exit(1);
  }

  const EXPENSES = [
    // Electricity
    { category: 'electricity', description: 'MSEDCL bill — March 2026',    amount: 4820,  payee: 'MSEDCL',             expenseDate: daysAgo(90), paymentMode: 'upi',    referenceNumber: 'T20260312001', status: 'approved' },
    { category: 'electricity', description: 'MSEDCL bill — April 2026',    amount: 5140,  payee: 'MSEDCL',             expenseDate: daysAgo(60), paymentMode: 'upi',    referenceNumber: 'T20260412003', status: 'approved' },
    { category: 'electricity', description: 'MSEDCL bill — May 2026',      amount: 5380,  payee: 'MSEDCL',             expenseDate: daysAgo(30), paymentMode: 'upi',    referenceNumber: 'T20260512007', status: 'approved' },
    { category: 'electricity', description: 'MSEDCL bill — June 2026',     amount: 5210,  payee: 'MSEDCL',             expenseDate: daysAgo(5),  paymentMode: 'upi',    referenceNumber: 'T20260605012', status: 'pending_approval' },

    // Water
    { category: 'water', description: 'Municipal water bill — March 2026', amount: 680,   payee: 'PMC Water Dept',     expenseDate: daysAgo(88), paymentMode: 'cash',   status: 'approved' },
    { category: 'water', description: 'Municipal water bill — April 2026', amount: 720,   payee: 'PMC Water Dept',     expenseDate: daysAgo(58), paymentMode: 'cash',   status: 'approved' },
    { category: 'water', description: 'Municipal water bill — May 2026',   amount: 695,   payee: 'PMC Water Dept',     expenseDate: daysAgo(28), paymentMode: 'cash',   status: 'pending_approval' },

    // Salary
    { category: 'salary', description: 'Salary — Pandit Ramesh (March)',   amount: 15000, payee: 'Pandit Ramesh',      expenseDate: daysAgo(85), paymentMode: 'upi',    referenceNumber: 'T20260301100', status: 'approved' },
    { category: 'salary', description: 'Salary — Watchman Suresh (March)', amount: 9500,  payee: 'Suresh Patil',       expenseDate: daysAgo(85), paymentMode: 'cash',   status: 'approved' },
    { category: 'salary', description: 'Salary — Pandit Ramesh (April)',   amount: 15000, payee: 'Pandit Ramesh',      expenseDate: daysAgo(55), paymentMode: 'upi',    referenceNumber: 'T20260401200', status: 'approved' },
    { category: 'salary', description: 'Salary — Watchman Suresh (April)', amount: 9500,  payee: 'Suresh Patil',       expenseDate: daysAgo(55), paymentMode: 'cash',   status: 'approved' },
    { category: 'salary', description: 'Salary — Pandit Ramesh (May)',     amount: 15000, payee: 'Pandit Ramesh',      expenseDate: daysAgo(25), paymentMode: 'upi',    referenceNumber: 'T20260501300', status: 'approved' },
    { category: 'salary', description: 'Salary — Watchman Suresh (May)',   amount: 9500,  payee: 'Suresh Patil',       expenseDate: daysAgo(25), paymentMode: 'cash',   status: 'pending_approval' },

    // Priest Fees
    { category: 'priest_fees', description: 'Ram Navami pooja dakshina',   amount: 5100,  payee: 'Pandit Vikram Joshi', expenseDate: daysAgo(75), paymentMode: 'cash',   status: 'approved' },
    { category: 'priest_fees', description: 'Satyanarayan katha dakshina', amount: 2100,  payee: 'Pandit Vikram Joshi', expenseDate: daysAgo(40), paymentMode: 'cash',   status: 'approved' },

    // Maintenance
    { category: 'maintenance', description: 'Plumbing repair — temple kitchen',  amount: 3200,  payee: 'Rajesh Plumbing Works', expenseDate: daysAgo(70), paymentMode: 'cash',   status: 'approved' },
    { category: 'maintenance', description: 'Generator service & oil change',    amount: 1850,  payee: 'Krishna Auto Service',  expenseDate: daysAgo(45), paymentMode: 'cheque', referenceNumber: '004521', status: 'approved' },
    { category: 'maintenance', description: 'AC servicing — main hall',          amount: 2400,  payee: 'Cool Air Services',     expenseDate: daysAgo(10), paymentMode: 'cash',   status: 'pending_approval' },

    // Decoration
    { category: 'decoration', description: 'Flowers & garlands — Ram Navami',   amount: 4500,  payee: 'Phool Bazar',           expenseDate: daysAgo(74), paymentMode: 'cash',   status: 'approved' },
    { category: 'decoration', description: 'Diya & rangoli material — Navratri', amount: 2800,  payee: 'Shree Arts',            expenseDate: daysAgo(20), paymentMode: 'cash',   status: 'approved' },

    // Printing
    { category: 'printing', description: 'Invitation cards — Navratri programme', amount: 1200, payee: 'Shree Print House',    expenseDate: daysAgo(22), paymentMode: 'cash',   status: 'approved' },
    { category: 'printing', description: 'Receipt book printing (2 sets)',         amount: 650,  payee: 'Shree Print House',    expenseDate: daysAgo(50), paymentMode: 'cash',   status: 'approved' },

    // Miscellaneous
    { category: 'miscellaneous', description: 'Internet recharge — broadband',    amount: 999,  payee: 'JioFiber',             expenseDate: daysAgo(35), paymentMode: 'upi',    referenceNumber: 'T20260508099', status: 'approved' },
    { category: 'miscellaneous', description: 'Cleaning supplies — bulk purchase', amount: 860, payee: 'Star Wholesale Mart',  expenseDate: daysAgo(15), paymentMode: 'cash',   status: 'rejected', rejectionReason: 'Duplicate entry — already recorded in purchases' },
  ];

  let created = 0;
  for (const e of EXPENSES) {
    const expenseNumber = await generateExpenseNumber(e.expenseDate);
    await Expense.create({
      expenseNumber,
      category:        e.category,
      description:     e.description,
      amount:          e.amount,
      payee:           e.payee,
      expenseDate:     e.expenseDate,
      paymentMode:     e.paymentMode,
      referenceNumber: e.referenceNumber || undefined,
      notes:           e.notes           || undefined,
      status:          e.status,
      createdBy:       admin._id,
      approvedBy:      e.status === 'approved'  ? admin._id : undefined,
      approvedAt:      e.status === 'approved'  ? new Date(e.expenseDate.getTime() + 24 * 60 * 60 * 1000) : undefined,
      rejectedBy:      e.status === 'rejected'  ? admin._id : undefined,
      rejectedAt:      e.status === 'rejected'  ? new Date(e.expenseDate.getTime() + 12 * 60 * 60 * 1000) : undefined,
      rejectionReason: e.rejectionReason        || undefined,
    });
    created++;
  }

  console.log(`✓ ${created} expenses created`);
  console.log('\nExpense seed complete!');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Expense seed failed:', err);
  process.exit(1);
});
