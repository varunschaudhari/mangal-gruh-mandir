import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, ArrowUpFromLine, ArrowLeftRight,
  Trash2, Package, Warehouse, Users, Tag, Ruler, Truck, Shield,
  ChevronDown, ChevronRight, FlameKindling, History, AlertTriangle, BookOpen, CalendarClock,
  X, Armchair, ClipboardList, Settings2, BarChart2, TrendingUp, Heart, CreditCard, Plus,
  ShoppingCart, BookTemplate, FileText,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions.js';
import { getAssetCounts } from '../../api/assetTransaction.api.js';
import { getPaymentCounts } from '../../api/supplierPayment.api.js';

const navConfig = [
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
      { label: 'All Payments',    to: '/payments',              icon: CreditCard,    permission: 'payments:read'  },
      { label: 'Record Payment',  to: '/payments/new',          icon: Plus,          permission: 'payments:write' },
      { label: 'Upcoming Dues',   to: '/payments/upcoming',     icon: CalendarClock, permission: 'payments:read'  },
      { label: 'Templates',       to: '/payments/templates',    icon: BookTemplate,  permission: 'payments:write' },
    ],
  },
  {
    label: 'Donations',
    icon: Heart,
    permission: 'donations:read',
    children: [
      { label: 'History',   to: '/donations',                icon: History, permission: 'donations:read'  },
      { label: 'New Entry', to: '/donations/new',            icon: Heart,   permission: 'donations:write' },
      { label: 'Occasions', to: '/admin/donation-occasions', icon: Tag,     permission: 'masters:write'   },
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
    ],
  },
  {
    label: 'Masters',
    icon: Tag,
    permission: 'masters:read',
    children: [
      { label: 'Products',    to: '/masters/products',    icon: Package,   permission: 'masters:read' },
      { label: 'Departments', to: '/masters/departments', icon: Warehouse, permission: 'masters:read' },
      { label: 'Suppliers',   to: '/masters/suppliers',   icon: Truck,     permission: 'masters:read' },
      { label: 'Categories',  to: '/masters/categories',  icon: Tag,       permission: 'masters:read' },
      { label: 'Units',       to: '/masters/units',       icon: Ruler,     permission: 'masters:read' },
    ],
  },
  {
    label: 'Admin',
    icon: Users,
    permission: 'users:read',
    children: [
      { label: 'Users',     to: '/admin/users',      icon: Users,     permission: 'users:read' },
      { label: 'Roles',     to: '/admin/roles',      icon: Shield,    permission: 'users:read' },
      { label: 'Audit Log', to: '/admin/audit-log',  icon: History,   permission: 'users:read' },
      { label: 'Settings',  to: '/settings',         icon: Settings2, permission: 'users:write' },
    ],
  },
];

const NavItem = ({ item, can, onNavigate, badges = {} }) => {
  const location = useLocation();
  const childActive = item.children?.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(true);

  if (item.permission && !can(item.permission)) return null;

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.label}
      </NavLink>
    );
  }

  const visibleChildren = item.children?.filter((c) => !c.permission || can(c.permission));
  if (!visibleChildren?.length) return null;

  // Show a red dot on the group button if any child has a badge
  const groupHasBadge = visibleChildren.some((c) => badges[c.to]);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          childActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <div className="relative shrink-0">
          <item.icon className="h-4 w-4" />
          {groupHasBadge && !open && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </div>
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-gray-700 pl-3">
          {visibleChildren.map((child) => {
            const badge = badges[child.to];
            return (
              <NavLink
                key={child.to}
                to={child.to}
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{child.label}</span>
                {badge > 0 && (
                  <span className="ml-auto shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ isOpen, onClose }) => {
  const { can } = usePermissions();

  const { data: countsRes } = useQuery({
    queryKey: ['asset-counts'],
    queryFn: getAssetCounts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: can('assets:read'),
  });

  const { data: payCountsRes } = useQuery({
    queryKey: ['payment-counts'],
    queryFn: getPaymentCounts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: can('payments:read'),
  });

  const overdue       = countsRes?.data?.data?.overdue     || 0;
  const pendingPayments = payCountsRes?.data?.data?.pending || 0;
  const badges        = {
    '/assets/borrows': overdue          || null,
    '/payments':       pendingPayments  || null,
  };

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-gray-900
        transform transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Logo + close button */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white p-1">
            <img
              src="/logo.png"
              alt="Mangal Grah Mandir"
              className="h-10 w-10 rounded object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight text-white">Mangal Grah Mandir</p>
            <p className="text-xs text-gray-400">Stock Management</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navConfig.map((item, i) => (
          <NavItem key={i} item={item} can={can} onNavigate={onClose} badges={badges} />
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
