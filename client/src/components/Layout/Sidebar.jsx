import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Trash2, Package, Warehouse, Users, Tag, Ruler, Truck, Shield,
  ChevronDown, ChevronRight, FlameKindling, History, AlertTriangle, BookOpen, CalendarClock,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions.js';

const navConfig = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    permission: null,
  },
  {
    label: 'Transactions',
    icon: ArrowLeftRight,
    permission: 'transactions:read',
    children: [
      { label: 'Stock In',   to: '/transactions/stock-in',  icon: ArrowDownToLine,  permission: 'transactions:create' },
      { label: 'Stock Out',  to: '/transactions/stock-out', icon: ArrowUpFromLine,  permission: 'transactions:create' },
      { label: 'Transfer',   to: '/transactions/transfer',  icon: ArrowLeftRight,   permission: 'transactions:create' },
      { label: 'Wastage',    to: '/transactions/wastage',   icon: Trash2,           permission: 'transactions:create' },
      { label: 'History',    to: '/transactions/history',   icon: History,          permission: 'transactions:read' },
    ],
  },
  {
    label: 'Inventory',
    icon: Package,
    permission: 'masters:read',
    children: [
      { label: 'Current Stock', to: '/inventory/current', icon: Package,   permission: 'masters:read' },
      { label: 'Stock Ledger',  to: '/inventory/ledger',  icon: BookOpen,  permission: 'transactions:read' },
    ],
  },
  {
    label: 'Reports',
    icon: FlameKindling,
    permission: 'reports:read',
    children: [
      { label: 'Daily Movement',   to: '/reports/daily',          icon: FlameKindling,  permission: 'reports:read' },
      { label: 'Low Stock Alerts', to: '/reports/low-stock',      icon: AlertTriangle,  permission: 'reports:read' },
      { label: 'Expiring Stock',   to: '/reports/expiring-stock', icon: CalendarClock,  permission: 'reports:read' },
    ],
  },
  {
    label: 'Masters',
    icon: Tag,
    permission: 'masters:read',
    children: [
      { label: 'Products',    to: '/masters/products',    icon: Package,    permission: 'masters:read' },
      { label: 'Departments', to: '/masters/departments', icon: Warehouse,  permission: 'masters:read' },
      { label: 'Suppliers',   to: '/masters/suppliers',   icon: Truck,      permission: 'masters:read' },
      { label: 'Categories',  to: '/masters/categories',  icon: Tag,        permission: 'masters:read' },
      { label: 'Units',       to: '/masters/units',       icon: Ruler,      permission: 'masters:read' },
    ],
  },
  {
    label: 'Admin',
    icon: Users,
    permission: 'users:read',
    children: [
      { label: 'Users', to: '/admin/users', icon: Users,   permission: 'users:read' },
      { label: 'Roles', to: '/admin/roles', icon: Shield,  permission: 'users:read' },
    ],
  },
];

const NavItem = ({ item, can }) => {
  const location = useLocation();
  const isActive = item.to && location.pathname.startsWith(item.to);
  const childActive = item.children?.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(true);

  if (item.permission && !can(item.permission)) return null;

  if (item.to) {
    return (
      <NavLink
        to={item.to}
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

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          childActive ? 'text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-gray-700 pl-3">
          {visibleChildren.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <child.icon className="h-3.5 w-3.5 shrink-0" />
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar = () => {
  const { can } = usePermissions();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-gray-700 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600">
          <FlameKindling className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold leading-tight text-white">Mangal Grah Mandir</p>
          <p className="text-xs text-gray-400">Stock Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navConfig.map((item, i) => (
          <NavItem key={i} item={item} can={can} />
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
