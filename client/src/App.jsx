import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute.jsx';
import AppLayout from './components/Layout/AppLayout.jsx';
import Login from './pages/auth/Login.jsx';
import Dashboard from './pages/dashboard/Dashboard.jsx';
import ProductList from './pages/masters/products/ProductList.jsx';
import ProductForm from './pages/masters/products/ProductForm.jsx';
import ProductDetail from './pages/masters/products/ProductDetail.jsx';
import DepartmentList from './pages/masters/departments/DepartmentList.jsx';
import DepartmentForm from './pages/masters/departments/DepartmentForm.jsx';
import SupplierList from './pages/masters/suppliers/SupplierList.jsx';
import SupplierForm from './pages/masters/suppliers/SupplierForm.jsx';
import CategoryList from './pages/masters/categories/CategoryList.jsx';
import CategoryForm from './pages/masters/categories/CategoryForm.jsx';
import UnitList from './pages/masters/units/UnitList.jsx';
import UserList from './pages/admin/UserList.jsx';
import UserForm from './pages/admin/UserForm.jsx';
import StockIn from './pages/transactions/StockIn.jsx';
import StockOut from './pages/transactions/StockOut.jsx';
import Transfer from './pages/transactions/Transfer.jsx';
import Wastage from './pages/transactions/Wastage.jsx';
import TransactionHistory from './pages/transactions/TransactionHistory.jsx';
import CurrentStock from './pages/inventory/CurrentStock.jsx';
import StockLedger from './pages/inventory/StockLedger.jsx';
import LowStockAlerts from './pages/reports/LowStockAlerts.jsx';
import DailyMovement from './pages/reports/DailyMovement.jsx';
import ExpiringStock from './pages/reports/ExpiringStock.jsx';
import Profile from './pages/auth/Profile.jsx';
import ChangePassword from './pages/auth/ChangePassword.jsx';
import RoleList from './pages/admin/RoleList.jsx';
import RoleForm from './pages/admin/RoleForm.jsx';
import AssetList from './pages/assets/AssetList.jsx';
import AssetForm from './pages/assets/AssetForm.jsx';
import AssetTransactions from './pages/assets/AssetTransactions.jsx';
import NewBorrowRequest from './pages/assets/NewBorrowRequest.jsx';
import ReturnAsset from './pages/assets/ReturnAsset.jsx';
import BorrowDetail from './pages/assets/BorrowDetail.jsx';
import AssetReports from './pages/assets/AssetReports.jsx';
import StockValuation from './pages/reports/StockValuation.jsx';
import SupplierReport from './pages/reports/SupplierReport.jsx';
import AssetHistory from './pages/assets/AssetHistory.jsx';
import DonationList from './pages/donations/DonationList.jsx';
import NewDonation from './pages/donations/NewDonation.jsx';
import DonationDetail from './pages/donations/DonationDetail.jsx';
import DonorDetail from './pages/donations/DonorDetail.jsx';
import DonationOccasionList from './pages/donations/DonationOccasionList.jsx';
import BorrowerHistory from './pages/assets/BorrowerHistory.jsx';
import UpcomingReturns from './pages/assets/UpcomingReturns.jsx';
import Settings from './pages/settings/Settings.jsx';

const App = () => (
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
        <Route path="/reports/daily" element={<DailyMovement />} />
        <Route path="/reports/low-stock" element={<LowStockAlerts />} />
        <Route path="/reports/expiring-stock" element={<ExpiringStock />} />
        <Route path="/reports/valuation" element={<StockValuation />} />
        <Route path="/reports/suppliers" element={<SupplierReport />} />

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
        <Route path="/assets/borrowers/:userId" element={<BorrowerHistory />} />

        {/* Donations */}
        <Route path="/donations"                  element={<DonationList />} />
        <Route path="/donations/new"              element={<NewDonation />} />
        <Route path="/donations/donors/:id"       element={<DonorDetail />} />
        <Route path="/donations/:id"              element={<DonationDetail />} />

        {/* Settings */}
        <Route path="/settings" element={<Settings />} />

        {/* Admin */}
        <Route path="/admin/users" element={<UserList />} />
        <Route path="/admin/users/new" element={<UserForm />} />
        <Route path="/admin/users/:id/edit" element={<UserForm />} />
        <Route path="/admin/donation-occasions" element={<DonationOccasionList />} />
        <Route path="/admin/roles" element={<RoleList />} />
        <Route path="/admin/roles/new" element={<RoleForm />} />
        <Route path="/admin/roles/:id/edit" element={<RoleForm />} />

        {/* Catch-all inside layout — any unknown path goes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Route>
  </Routes>
);

export default App;
