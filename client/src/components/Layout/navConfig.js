import {
  LayoutDashboard, ArrowUpFromLine, ArrowLeftRight,
  Trash2, Package, Warehouse, Users, Tag, Ruler, Truck, Shield,
  FlameKindling, History, AlertTriangle, BookOpen, CalendarClock,
  Armchair, ClipboardList, Settings2, BarChart2, TrendingUp, Heart, CreditCard, Plus,
  ShoppingCart, BookTemplate, FileText, Utensils, ScanLine, BarChart3, Receipt, PiggyBank, Bug,
  Fingerprint, CalendarDays, CalendarRange, UsersRound, Clock3, CalendarHeart, Wallet, HandCoins, IndianRupee,
  CalendarCheck, ListOrdered, ClipboardList as DaySheetIcon,
} from 'lucide-react';

// Single source of truth for navigation: the desktop sidebar, the mobile bottom tab bar,
// the mobile "More" sheet and the quick-action sheet all read from here.

export const navConfig = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    permission: null,
  },
  {
    label: 'Purchases',
    icon: ShoppingCart,
    permission: 'transactions:read',
    children: [
      { label: 'Purchase Register',  to: '/purchases',     icon: FileText, permission: 'transactions:read'   },
      { label: 'New Purchase Entry', to: '/purchases/new', icon: Plus,     permission: 'transactions:create' },
    ],
  },
  {
    label: 'Stock Movement',
    icon: ArrowLeftRight,
    permission: 'transactions:read',
    children: [
      { label: 'Stock Out', to: '/transactions/stock-out', icon: ArrowUpFromLine, permission: 'transactions:create' },
      { label: 'Transfer',  to: '/transactions/transfer',  icon: ArrowLeftRight,  permission: 'transactions:create' },
      { label: 'Wastage',   to: '/transactions/wastage',   icon: Trash2,          permission: 'transactions:create' },
      { label: 'History',   to: '/transactions/history',   icon: History,         permission: 'transactions:read'   },
    ],
  },
  {
    label: 'Inventory',
    icon: Package,
    permission: 'masters:read',
    children: [
      { label: 'Current Stock', to: '/inventory/current', icon: Package,  permission: 'masters:read'       },
      { label: 'Stock Ledger',  to: '/inventory/ledger',  icon: BookOpen, permission: 'transactions:read'  },
    ],
  },
  {
    label: 'Payments',
    icon: CreditCard,
    permission: 'payments:read',
    children: [
      { label: 'All Payments',      to: '/payments',                   icon: CreditCard,    permission: 'payments:read'  },
      { label: 'Record Payment',    to: '/payments/new',               icon: Plus,          permission: 'payments:write' },
      { label: 'Invoice Register',  to: '/payments/invoice-register',  icon: FileText,      permission: 'payments:read'  },
      { label: 'Upcoming Dues',     to: '/payments/upcoming',          icon: CalendarClock, permission: 'payments:read'  },
      { label: 'Templates',         to: '/payments/templates',         icon: BookTemplate,  permission: 'payments:write' },
    ],
  },
  {
    label: 'Expenses',
    icon: Receipt,
    permission: 'payments:read',
    children: [
      { label: 'All Expenses',  to: '/expenses',        icon: Receipt,    permission: 'payments:read'    },
      { label: 'New Expense',   to: '/expenses/new',    icon: Plus,       permission: 'payments:write'   },
      { label: 'Set Budgets',   to: '/expenses/budget', icon: PiggyBank,  permission: 'payments:approve' },
    ],
  },
  {
    label: 'Mahaprasad',
    icon: Utensils,
    permission: 'mahaprasad:read',
    children: [
      { label: 'Issue Coupons', to: '/mahaprasad',          icon: Utensils,  permission: 'mahaprasad:issue'  },
      { label: 'Redeem',        to: '/mahaprasad/redeem',  icon: ScanLine,  permission: 'mahaprasad:redeem' },
      { label: 'History',       to: '/mahaprasad/history', icon: History,   permission: 'mahaprasad:read'   },
      { label: 'Report',        to: '/mahaprasad/report',  icon: BarChart3, permission: 'mahaprasad:read'   },
    ],
  },
  {
    label: 'Donations',
    icon: Heart,
    permission: 'donations:read',
    children: [
      { label: 'History',   to: '/donations',     icon: History, permission: 'donations:read'  },
      { label: 'New Entry', to: '/donations/new', icon: Heart,   permission: 'donations:write' },
    ],
  },
  {
    label: 'Bookings',
    icon: CalendarCheck,
    permission: 'bookings:read',
    children: [
      { label: 'New Booking',      to: '/bookings/new',     icon: Plus,         permission: 'bookings:create' },
      { label: 'All Bookings',     to: '/bookings',         icon: ListOrdered,  permission: 'bookings:read'   },
      { label: 'Day Sheet',        to: '/bookings/day',     icon: DaySheetIcon, permission: 'bookings:read'   },
      { label: 'Booking Reports',  to: '/bookings/reports', icon: BarChart3,    permission: 'bookings:read'   },
      { label: 'Booking Setup',    to: '/bookings/setup',   icon: Settings2,    permission: 'bookings:manage' },
    ],
  },
  {
    label: 'Attendance',
    icon: Fingerprint,
    permission: 'attendance:read',
    children: [
      { label: 'Daily Attendance', to: '/attendance',          icon: Clock3,        permission: 'attendance:read'   },
      { label: 'Weekly Roster',    to: '/attendance/roster',   icon: CalendarRange, permission: 'attendance:read'   },
      { label: 'Monthly Register', to: '/attendance/register', icon: CalendarDays,  permission: 'attendance:read'   },
      { label: 'Leave & Overtime', to: '/attendance/leave',    icon: CalendarHeart, permission: 'attendance:read'   },
      { label: 'Staff Register',   to: '/attendance/staff',    icon: UsersRound,    permission: 'attendance:read'   },
      { label: 'Shifts & Machine', to: '/attendance/settings', icon: Settings2,     permission: 'attendance:manage' },
    ],
  },
  {
    label: 'Salary',
    icon: Wallet,
    permission: 'salary:read',
    children: [
      { label: 'Monthly Salary',  to: '/salary',          icon: IndianRupee, permission: 'salary:read'   },
      { label: 'Salary Advances', to: '/salary/advances', icon: HandCoins,   permission: 'salary:read'   },
      { label: 'Salary Settings', to: '/salary/settings', icon: Settings2,   permission: 'salary:manage' },
    ],
  },
  {
    label: 'Assets',
    icon: Armchair,
    permission: 'assets:read',
    children: [
      { label: 'Asset List',       to: '/assets',          icon: Armchair,      permission: 'assets:write' },
      { label: 'Borrow Requests',  to: '/assets/borrows',  icon: ClipboardList, permission: 'assets:read'  },
      { label: 'Upcoming Returns', to: '/assets/upcoming', icon: CalendarClock, permission: 'assets:read'  },
      { label: 'Reports',          to: '/assets/reports',  icon: BarChart2,     permission: 'assets:read'  },
    ],
  },
  {
    label: 'Reports',
    icon: FlameKindling,
    permission: 'reports:read',
    children: [
      { label: 'Daily Movement',    to: '/reports/daily',              icon: FlameKindling, permission: 'reports:read'   },
      { label: 'Low Stock Alerts',  to: '/reports/low-stock',          icon: AlertTriangle, permission: 'reports:read'   },
      { label: 'Expiring Stock',    to: '/reports/expiring-stock',     icon: CalendarClock, permission: 'reports:read'   },
      { label: 'Stock Valuation',   to: '/reports/valuation',          icon: TrendingUp,    permission: 'reports:read'   },
      { label: 'Supplier Report',   to: '/reports/suppliers',          icon: Truck,         permission: 'reports:read'   },
      { label: 'Supplier Aging',    to: '/reports/supplier-aging',     icon: AlertTriangle, permission: 'payments:read'  },
      { label: 'Festival Cost',     to: '/reports/festival-cost',      icon: FlameKindling, permission: 'reports:read'   },
      { label: 'Consumption Trend', to: '/reports/consumption-trend',  icon: TrendingUp,    permission: 'reports:read'   },
      { label: 'Reorder',           to: '/reports/reorder',            icon: ShoppingCart,  permission: 'reports:read'   },
      { label: 'Monthly P&L',      to: '/reports/pnl',                icon: TrendingUp,    permission: 'payments:read'  },
    ],
  },
  {
    label: 'Masters',
    icon: Tag,
    permission: 'masters:read',
    children: [
      { label: 'Products',    to: '/masters/products',    icon: Package,   permission: 'masters:read'  },
      { label: 'Departments', to: '/masters/departments', icon: Warehouse, permission: 'masters:read'  },
      { label: 'Suppliers',   to: '/masters/suppliers',   icon: Truck,     permission: 'masters:read'  },
      { label: 'Categories',  to: '/masters/categories',  icon: Tag,       permission: 'masters:read'  },
      { label: 'Units',       to: '/masters/units',       icon: Ruler,     permission: 'masters:read'  },
      { label: 'Occasions',   to: '/admin/occasions',     icon: Heart,     permission: 'masters:read'  },
    ],
  },
  {
    label: 'Admin',
    icon: Users,
    permission: 'users:read',
    children: [
      { label: 'Users',     to: '/admin/users',      icon: Users,     permission: 'users:read'  },
      { label: 'Roles',     to: '/admin/roles',      icon: Shield,    permission: 'users:read'  },
      { label: 'Audit Log', to: '/admin/audit-log',  icon: History,   permission: 'users:read'  },
      { label: 'App Errors', to: '/admin/app-errors', icon: Bug,      permission: 'users:read'  },
      { label: 'Settings',  to: '/settings',         icon: Settings2, permission: 'users:write' },
    ],
  },
];

// ── Mobile bottom tab bar ─────────────────────────────────────────────────────
// `match` lists the path prefixes that light the tab up (longest prefix wins).
export const MOBILE_TABS = {
  stock:      { label: 'Stock',      to: '/inventory/current',  icon: Package,      permission: 'masters:read',      match: ['/inventory', '/transactions'] },
  purchases:  { label: 'Purchases',  to: '/purchases',          icon: ShoppingCart, permission: 'transactions:read', match: ['/purchases'] },
  payments:   { label: 'Payments',   to: '/payments',           icon: CreditCard,   permission: 'payments:read',     match: ['/payments'], badge: '/payments' },
  expenses:   { label: 'Expenses',   to: '/expenses',           icon: Receipt,      permission: 'payments:read',     match: ['/expenses'] },
  scan:       { label: 'Scan',       to: '/mahaprasad/redeem',  icon: ScanLine,     permission: 'mahaprasad:redeem', match: ['/mahaprasad/redeem'] },
  coupons:    { label: 'Coupons',    to: '/mahaprasad',         icon: Utensils,     permission: 'mahaprasad:issue',  match: ['/mahaprasad'] },
  prasad:     { label: 'Mahaprasad', to: '/mahaprasad/history', icon: Utensils,     permission: 'mahaprasad:read',   match: ['/mahaprasad'] },
  donations:  { label: 'Donations',  to: '/donations',          icon: Heart,        permission: 'donations:read',    match: ['/donations'] },
  reports:    { label: 'Reports',    to: '/reports',            icon: BarChart3,    permission: 'reports:read',      match: ['/reports'] },
  attendance: { label: 'Attendance', to: '/attendance',         icon: Fingerprint,  permission: 'attendance:read',   match: ['/attendance'] },
  roster:     { label: 'Roster',     to: '/attendance/roster',  icon: CalendarRange, permission: 'attendance:read',  match: ['/attendance/roster'] },
  bookings:   { label: 'Bookings',   to: '/bookings',           icon: CalendarCheck, permission: 'bookings:read',    match: ['/bookings'] },
  daySheet:   { label: 'Day Sheet',  to: '/bookings/day',       icon: DaySheetIcon,  permission: 'bookings:read',    match: ['/bookings/day'] },
};

// Tabs per built-in role, most-used first. Custom roles fall back to TAB_PRIORITY.
const ROLE_TABS = {
  super_admin:        ['stock', 'payments', 'reports'],
  admin:              ['stock', 'payments', 'reports'],
  store_manager:      ['stock', 'purchases', 'reports'],
  staff:              ['stock', 'scan', 'coupons'],
  viewer:             ['stock', 'reports', 'donations'],
  mahaprasad_counter: ['coupons', 'prasad'],
  mahaprasad_redeem:  ['scan'],
  donation_desk:      ['donations'],
  accountant:         ['payments', 'reports', 'donations'],
  cashier:            ['payments', 'expenses', 'reports'],
  attendance_supervisor: ['attendance', 'roster'],
  booking_counter:    ['bookings', 'daySheet'],
};
const TAB_PRIORITY = ['stock', 'scan', 'coupons', 'payments', 'purchases', 'donations', 'reports', 'prasad', 'expenses', 'attendance'];

// Returns the middle tabs (Home and More are always present).
// With a quick-action button there is room for 2 tabs, otherwise 3.
export const getMobileTabs = (role, can, max) => {
  const preferred = ROLE_TABS[role] || TAB_PRIORITY;
  const keys = [...preferred, ...TAB_PRIORITY.filter((k) => !preferred.includes(k))];
  return keys
    .map((k) => ({ key: k, ...MOBILE_TABS[k] }))
    .filter((t) => can(t.permission))
    .slice(0, max);
};

// ── Quick actions (centre "+" button on mobile) ───────────────────────────────
export const QUICK_ACTIONS = [
  { label: 'New Booking',    to: '/bookings/new',           icon: CalendarCheck,   permission: 'bookings:create',     tone: 'orange' },
  { label: 'Scan Coupon',    to: '/mahaprasad/redeem',      icon: ScanLine,        permission: 'mahaprasad:redeem',   tone: 'orange' },
  { label: 'Issue Coupons',  to: '/mahaprasad',             icon: Utensils,        permission: 'mahaprasad:issue',    tone: 'orange' },
  { label: 'New Purchase',   to: '/purchases/new',          icon: ShoppingCart,    permission: 'transactions:create', tone: 'blue'   },
  { label: 'Stock Out',      to: '/transactions/stock-out', icon: ArrowUpFromLine, permission: 'transactions:create', tone: 'blue'   },
  { label: 'Transfer',       to: '/transactions/transfer',  icon: ArrowLeftRight,  permission: 'transactions:create', tone: 'blue'   },
  { label: 'Wastage',        to: '/transactions/wastage',   icon: Trash2,          permission: 'transactions:create', tone: 'blue'   },
  { label: 'Record Payment', to: '/payments/new',           icon: CreditCard,      permission: 'payments:write',      tone: 'green'  },
  { label: 'New Expense',    to: '/expenses/new',           icon: Receipt,         permission: 'payments:write',      tone: 'green'  },
  { label: 'New Donation',   to: '/donations/new',          icon: Heart,           permission: 'donations:write',     tone: 'pink'   },
];

// Which tab lights up for a path: 'home', a tab key, or 'more'.
export const resolveActiveTab = (pathname, tabs) => {
  if (pathname === '/dashboard' || pathname === '/') return 'home';
  let best = null;
  let bestLen = 0;
  for (const t of tabs) {
    for (const prefix of [t.to, ...(t.match || [])]) {
      const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (hit && prefix.length > bestLen) { best = t.key; bestLen = prefix.length; }
    }
  }
  return best || 'more';
};

// Full-screen task routes (forms) hide the bottom tab bar on mobile, like a pushed screen.
const TASK_ROUTE = /(\/new|\/edit|\/return)$|^\/transactions\/(stock-in|stock-out|transfer|wastage)$|^\/change-password$/;
export const isTaskRoute = (pathname) => TASK_ROUTE.test(pathname);
