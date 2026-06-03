import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, KeyRound, ChevronDown, Bell, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDashboardStats } from '../../api/dashboard.api.js';
import { ROLE_LABELS } from '../../utils/permissions.js';
import toast from 'react-hot-toast';

const AlertBell = () => {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const counts = data?.data?.data?.counts || {};
  const critical = counts.lowStockItems ?? 0;
  const reorder  = counts.reorderItems  ?? 0;
  const total    = critical + reorder;

  if (total === 0) return null;

  return (
    <Link
      to="/reports/low-stock"
      className="relative flex items-center justify-center h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
      title={`${critical} critical · ${reorder} reorder`}
    >
      <Bell className="h-4 w-4" />
      <span className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white text-[10px] font-bold leading-none ${critical > 0 ? 'bg-red-500' : 'bg-yellow-400'}`}>
        {total > 99 ? '99+' : total}
      </span>
    </Link>
  );
};

const Navbar = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden rounded-md p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop spacer */}
      <div className="hidden lg:block" />

      <div className="flex items-center gap-2 sm:gap-3">
        <AlertBell />

        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-md px-2 sm:px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold shrink-0">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            {/* Hide name on very small screens */}
            <div className="text-left hidden sm:block">
              <p className="font-medium leading-tight">{user?.name}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[user?.role] || user?.role}</p>
            </div>
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg bg-white shadow-lg border border-gray-100 py-1">
                <button
                  onClick={() => { setOpen(false); navigate('/profile'); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User className="h-4 w-4" /> My Profile
                </button>
                <button
                  onClick={() => { setOpen(false); navigate('/change-password'); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <KeyRound className="h-4 w-4" /> Change Password
                </button>
                <hr className="my-1" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
