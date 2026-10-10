import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute.jsx';
import AppLayout from './components/Layout/AppLayout.jsx';
import { PageLoader } from './components/ui/Spinner.jsx';
import { lazyPage } from './utils/lazyPage.js';
import ElectronSettings from './components/ElectronSettings.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import AppLock from './components/AppLock.jsx';

// Screens load on first use (only Login is in the main bundle).
import Login from './pages/auth/Login.jsx';
const Dashboard = lazyPage(() => import('./pages/dashboard/Dashboard.jsx'));
const ProductList = lazyPage(() => import('./pages/masters/products/ProductList.jsx'));
const ProductForm = lazyPage(() => import('./pages/masters/products/ProductForm.jsx'));
const ProductDetail = lazyPage(() => import('./pages/masters/products/ProductDetail.jsx'));
const DepartmentList = lazyPage(() => import('./pages/masters/departments/DepartmentList.jsx'));
const DepartmentForm = lazyPage(() => import('./pages/masters/departments/DepartmentForm.jsx'));
const SupplierList = lazyPage(() => import('./pages/masters/suppliers/SupplierList.jsx'));
const SupplierForm = lazyPage(() => import('./pages/masters/suppliers/SupplierForm.jsx'));
const CategoryList = lazyPage(() => import('./pages/masters/categories/CategoryList.jsx'));
const CategoryForm = lazyPage(() => import('./pages/masters/categories/CategoryForm.jsx'));
const UnitList = lazyPage(() => import('./pages/masters/units/UnitList.jsx'));
const UserList = lazyPage(() => import('./pages/admin/UserList.jsx'));
const UserForm = lazyPage(() => import('./pages/admin/UserForm.jsx'));
const StockIn = lazyPage(() => import('./pages/transactions/StockIn.jsx'));
const StockOut = lazyPage(() => import('./pages/transactions/StockOut.jsx'));
const Transfer = lazyPage(() => import('./pages/transactions/Transfer.jsx'));
const Wastage = lazyPage(() => import('./pages/transactions/Wastage.jsx'));
const TransactionHistory = lazyPage(() => import('./pages/transactions/TransactionHistory.jsx'));
const CurrentStock = lazyPage(() => import('./pages/inventory/CurrentStock.jsx'));
const StockLedger = lazyPage(() => import('./pages/inventory/StockLedger.jsx'));
const LowStockAlerts = lazyPage(() => import('./pages/reports/LowStockAlerts.jsx'));
const DailyMovement = lazyPage(() => import('./pages/reports/DailyMovement.jsx'));
const ExpiringStock = lazyPage(() => import('./pages/reports/ExpiringStock.jsx'));
const Profile = lazyPage(() => import('./pages/auth/Profile.jsx'));
const ChangePassword = lazyPage(() => import('./pages/auth/ChangePassword.jsx'));
const RoleList = lazyPage(() => import('./pages/admin/RoleList.jsx'));
const RoleForm = lazyPage(() => import('./pages/admin/RoleForm.jsx'));
const AssetList = lazyPage(() => import('./pages/assets/AssetList.jsx'));
const AssetForm = lazyPage(() => import('./pages/assets/AssetForm.jsx'));
const AssetTransactions = lazyPage(() => import('./pages/assets/AssetTransactions.jsx'));
const NewBorrowRequest = lazyPage(() => import('./pages/assets/NewBorrowRequest.jsx'));
const ReturnAsset = lazyPage(() => import('./pages/assets/ReturnAsset.jsx'));
const BorrowDetail = lazyPage(() => import('./pages/assets/BorrowDetail.jsx'));
const AssetReports = lazyPage(() => import('./pages/assets/AssetReports.jsx'));
const StockValuation = lazyPage(() => import('./pages/reports/StockValuation.jsx'));
const SupplierReport = lazyPage(() => import('./pages/reports/SupplierReport.jsx'));
const AssetHistory = lazyPage(() => import('./pages/assets/AssetHistory.jsx'));
const DonationList = lazyPage(() => import('./pages/donations/DonationList.jsx'));
const NewDonation = lazyPage(() => import('./pages/donations/NewDonation.jsx'));
const DonationDetail = lazyPage(() => import('./pages/donations/DonationDetail.jsx'));
const DonorDetail = lazyPage(() => import('./pages/donations/DonorDetail.jsx'));
const DonationOccasionList = lazyPage(() => import('./pages/donations/DonationOccasionList.jsx'));
const BorrowerHistory = lazyPage(() => import('./pages/assets/BorrowerHistory.jsx'));
const UpcomingReturns = lazyPage(() => import('./pages/assets/UpcomingReturns.jsx'));
const Settings = lazyPage(() => import('./pages/settings/Settings.jsx'));
const SupplierDetail = lazyPage(() => import('./pages/masters/suppliers/SupplierDetail.jsx'));
const SupplierPayments = lazyPage(() => import('./pages/payments/SupplierPayments.jsx'));
const NewSupplierPayment = lazyPage(() => import('./pages/payments/NewSupplierPayment.jsx'));
const SupplierPaymentDetail = lazyPage(() => import('./pages/payments/SupplierPaymentDetail.jsx'));
const PaymentTemplates = lazyPage(() => import('./pages/payments/PaymentTemplates.jsx'));
const UpcomingDues = lazyPage(() => import('./pages/payments/UpcomingDues.jsx'));
const SupplierAgingReport = lazyPage(() => import('./pages/reports/SupplierAgingReport.jsx'));
const FestivalCostReport = lazyPage(() => import('./pages/reports/FestivalCostReport.jsx'));
const ConsumptionTrend = lazyPage(() => import('./pages/reports/ConsumptionTrend.jsx'));
const ReorderSuggestions = lazyPage(() => import('./pages/reports/ReorderSuggestions.jsx'));
const AuditLog = lazyPage(() => import('./pages/admin/AuditLog.jsx'));
const AppErrors = lazyPage(() => import('./pages/admin/AppErrors.jsx'));
const InvoiceRegister = lazyPage(() => import('./pages/payments/InvoiceRegister.jsx'));
const PurchaseRegister = lazyPage(() => import('./pages/purchases/PurchaseRegister.jsx'));
const NewPurchaseEntry = lazyPage(() => import('./pages/purchases/NewPurchaseEntry.jsx'));
const PurchaseEntryDetail = lazyPage(() => import('./pages/purchases/PurchaseEntryDetail.jsx'));
const PurchaseEntryEdit = lazyPage(() => import('./pages/purchases/PurchaseEntryEdit.jsx'));
const ExpenseList = lazyPage(() => import('./pages/expenses/ExpenseList.jsx'));
const NewExpense = lazyPage(() => import('./pages/expenses/NewExpense.jsx'));
const ExpenseDetail = lazyPage(() => import('./pages/expenses/ExpenseDetail.jsx'));
const MonthlyPnL = lazyPage(() => import('./pages/reports/MonthlyPnL.jsx'));
const ReportsHub = lazyPage(() => import('./pages/reports/ReportsHub.jsx'));
const BudgetManager = lazyPage(() => import('./pages/expenses/BudgetManager.jsx'));
const MahaprasadCounter = lazyPage(() => import('./pages/mahaprasad/MahaprasadCounter.jsx'));
const MahaprasadRedeem = lazyPage(() => import('./pages/mahaprasad/MahaprasadRedeem.jsx'));
const MahaprasadHistory = lazyPage(() => import('./pages/mahaprasad/MahaprasadHistory.jsx'));
const MahaprasadReport = lazyPage(() => import('./pages/mahaprasad/MahaprasadReport.jsx'));
const MahaprasadOccasionList = lazyPage(() => import('./pages/mahaprasad/MahaprasadOccasionList.jsx'));
const OccasionsManager = lazyPage(() => import('./pages/admin/OccasionsManager.jsx'));
const AssetUnitList = lazyPage(() => import('./pages/assets/AssetUnitList.jsx'));
const AttendanceToday = lazyPage(() => import('./pages/attendance/AttendanceToday.jsx'));
const AttendanceRoster = lazyPage(() => import('./pages/attendance/Roster.jsx'));
const AttendanceRegister = lazyPage(() => import('./pages/attendance/Register.jsx'));
const StaffList = lazyPage(() => import('./pages/attendance/StaffList.jsx'));
const StaffForm = lazyPage(() => import('./pages/attendance/StaffForm.jsx'));
const AttendanceSettings = lazyPage(() => import('./pages/attendance/AttendanceSettings.jsx'));
const LeaveOvertime = lazyPage(() => import('./pages/attendance/LeaveOvertime.jsx'));
const SalaryMonth = lazyPage(() => import('./pages/salary/SalaryMonth.jsx'));
const SalaryAdvances = lazyPage(() => import('./pages/salary/Advances.jsx'));
const SalarySettings = lazyPage(() => import('./pages/salary/SalarySettings.jsx'));

const App = () => (
  <>
  {window.electronAPI?.isElectron && <ElectronSettings />}
  <UpdatePrompt />
  <AppLock />
  <Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/login" element={<Login />} />

    <Route element={<PrivateRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Transactions */}
        <Route path="/transactions/stock-in" element={<StockIn />} />
        <Route path="/transactions/stock-out" element={<StockOut />} />
        <Route path="/transactions/transfer" element={<Transfer />} />
        <Route path="/transactions/wastage" element={<Wastage />} />
        <Route path="/transactions/history" element={<TransactionHistory />} />

        {/* Inventory */}
        <Route path="/inventory/current" element={<CurrentStock />} />
        <Route path="/inventory/ledger" element={<StockLedger />} />

        {/* Reports */}
        <Route path="/reports"                   element={<ReportsHub />} />
        <Route path="/reports/daily" element={<DailyMovement />} />
        <Route path="/reports/low-stock" element={<LowStockAlerts />} />
        <Route path="/reports/expiring-stock" element={<ExpiringStock />} />
        <Route path="/reports/valuation" element={<StockValuation />} />
        <Route path="/reports/suppliers" element={<SupplierReport />} />
        <Route path="/reports/supplier-aging"    element={<SupplierAgingReport />} />
        <Route path="/reports/festival-cost"     element={<FestivalCostReport />} />
        <Route path="/reports/consumption-trend" element={<ConsumptionTrend />} />
        <Route path="/reports/reorder"           element={<ReorderSuggestions />} />
        <Route path="/reports/pnl"               element={<MonthlyPnL />} />

        {/* Masters */}
        <Route path="/masters/products" element={<ProductList />} />
        <Route path="/masters/products/new" element={<ProductForm />} />
        <Route path="/masters/products/:id/edit" element={<ProductForm />} />
        <Route path="/masters/products/:id" element={<ProductDetail />} />

        <Route path="/masters/departments" element={<DepartmentList />} />
        <Route path="/masters/departments/new" element={<DepartmentForm />} />
        <Route path="/masters/departments/:id/edit" element={<DepartmentForm />} />

        <Route path="/masters/suppliers" element={<SupplierList />} />
        <Route path="/masters/suppliers/new" element={<SupplierForm />} />
        <Route path="/masters/suppliers/:id/edit" element={<SupplierForm />} />
        <Route path="/masters/suppliers/:id" element={<SupplierDetail />} />

        <Route path="/masters/categories" element={<CategoryList />} />
        <Route path="/masters/categories/new" element={<CategoryForm />} />
        <Route path="/masters/categories/:id/edit" element={<CategoryForm />} />

        <Route path="/masters/units" element={<UnitList />} />

        {/* Assets */}
        <Route path="/assets" element={<AssetList />} />
        <Route path="/assets/new" element={<AssetForm />} />
        <Route path="/assets/:id/edit" element={<AssetForm />} />
        <Route path="/assets/borrows" element={<AssetTransactions />} />
        <Route path="/assets/borrows/new" element={<NewBorrowRequest />} />
        <Route path="/assets/borrows/:txnId/return" element={<ReturnAsset />} />
        <Route path="/assets/borrows/groups/:groupId" element={<BorrowDetail />} />
        <Route path="/assets/borrows/:txnId" element={<BorrowDetail />} />
        <Route path="/assets/reports" element={<AssetReports />} />
        <Route path="/assets/upcoming" element={<UpcomingReturns />} />
        <Route path="/assets/:id/history" element={<AssetHistory />} />
        <Route path="/assets/:id/units"   element={<AssetUnitList />} />
        <Route path="/assets/borrowers/:userId" element={<BorrowerHistory />} />

        {/* Donations */}
        <Route path="/donations"                  element={<DonationList />} />
        <Route path="/donations/new"              element={<NewDonation />} />
        <Route path="/donations/donors/:id"       element={<DonorDetail />} />
        <Route path="/donations/:id"              element={<DonationDetail />} />

        {/* Payments */}
        <Route path="/payments" element={<SupplierPayments />} />
        <Route path="/payments/new" element={<NewSupplierPayment />} />
        <Route path="/payments/templates"        element={<PaymentTemplates />} />
        <Route path="/payments/upcoming"         element={<UpcomingDues />} />
        <Route path="/payments/invoice-register" element={<InvoiceRegister />} />
        <Route path="/payments/:id" element={<SupplierPaymentDetail />} />

        {/* Expenses */}
        <Route path="/expenses"          element={<ExpenseList />} />
        <Route path="/expenses/new"      element={<NewExpense />} />
        <Route path="/expenses/budget"   element={<BudgetManager />} />
        <Route path="/expenses/:id"      element={<ExpenseDetail />} />


        {/* Purchases */}
        <Route path="/purchases"          element={<PurchaseRegister />} />
        <Route path="/purchases/new"      element={<NewPurchaseEntry />} />
        <Route path="/purchases/:id"      element={<PurchaseEntryDetail />} />
        <Route path="/purchases/:id/edit" element={<PurchaseEntryEdit />} />

        {/* Mahaprasad */}
        <Route path="/mahaprasad"         element={<MahaprasadCounter />} />
        <Route path="/mahaprasad/redeem"  element={<MahaprasadRedeem />} />
        <Route path="/mahaprasad/history" element={<MahaprasadHistory />} />
        <Route path="/mahaprasad/report"    element={<MahaprasadReport />} />
        <Route path="/mahaprasad/occasions" element={<MahaprasadOccasionList />} />

        {/* Attendance */}
        <Route path="/attendance"                element={<AttendanceToday />} />
        <Route path="/attendance/roster"         element={<AttendanceRoster />} />
        <Route path="/attendance/register"       element={<AttendanceRegister />} />
        <Route path="/attendance/leave"          element={<LeaveOvertime />} />
        <Route path="/attendance/staff"          element={<StaffList />} />
        <Route path="/attendance/staff/new"      element={<StaffForm />} />
        <Route path="/attendance/staff/:id/edit" element={<StaffForm />} />
        <Route path="/attendance/settings"       element={<AttendanceSettings />} />

        {/* Salary */}
        <Route path="/salary"          element={<SalaryMonth />} />
        <Route path="/salary/advances" element={<SalaryAdvances />} />
        <Route path="/salary/settings" element={<SalarySettings />} />

        {/* Settings */}
        <Route path="/settings" element={<Settings />} />

        {/* Admin */}
        <Route path="/admin/users" element={<UserList />} />
        <Route path="/admin/users/new" element={<UserForm />} />
        <Route path="/admin/users/:id/edit" element={<UserForm />} />
        <Route path="/admin/donation-occasions" element={<DonationOccasionList />} />
        <Route path="/admin/occasions" element={<OccasionsManager />} />
        <Route path="/admin/roles" element={<RoleList />} />
        <Route path="/admin/roles/new" element={<RoleForm />} />
        <Route path="/admin/roles/:id/edit" element={<RoleForm />} />
        <Route path="/admin/audit-log" element={<AuditLog />} />
        <Route path="/admin/app-errors" element={<AppErrors />} />

        {/* Catch-all inside layout — any unknown path goes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Route>
  </Routes>
  </Suspense>
  </>
);

export default App;
