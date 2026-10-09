import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogOut, User, KeyRound, ChevronDown, ChevronLeft, Bell, ScanLine } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDashboardStats } from '../../api/dashboard.api.js';
import { ROLE_LABELS } from '../../utils/permissions.js';
import toast from 'react-hot-toast';
import { useAppBarTitle } from './AppBarContext.jsx';
import { useMobileNav } from '../../hooks/useMobileNav.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { isNative } from '../../utils/platform.js';
import { scanQrCode } from '../../utils/nativeScanner.js';
import { resolveScan } from '../../utils/scanResolver.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

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
      className="relative flex items-center justify-center h-10 w-10 lg:h-8 lg:w-8 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
      title={`${critical} critical · ${reorder} reorder`}
    >
      <Bell className="h-5 w-5 lg:h-4 lg:w-4" />
      <span className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white text-[10px] font-bold leading-none ${critical > 0 ? 'bg-red-500' : 'bg-yellow-400'}`}>
        {total > 99 ? '99+' : total}
      </span>
    </Link>
  );
};

// Mobile app: scan any label this app prints (product, asset, coupon) or a shop barcode
// and jump to it. See utils/scanResolver.js.
const ScanButton = () => {
  const navigate = useNavigate();
  const t = useT();
  const { can } = usePermissions();
  const [busy, setBusy] = useState(false);
  if (!isNative || !(can('masters:read') || can('assets:read') || can('mahaprasad:redeem'))) return null;

  const scan = async () => {
    setBusy(true);
    try {
      const text = await scanQrCode({ barcodes: true });
      if (!text) return;
      const result = await resolveScan(text);
      if (result.to) { haptics.success(); navigate(result.to); } else { haptics.error(); toast.error(result.error); }
    } catch (err) {
      toast.error(err?.message || t('Scanner not available'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={scan}
      disabled={busy}
      className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:opacity-50 lg:hidden"
      aria-label={t('Scan a label or barcode')}
    >
      <ScanLine className="h-5 w-5" />
    </button>
  );
};

// Mobile app bar: brand on the home screen, otherwise ← back + the page title
// (published by <PageHeader>). Desktop keeps the original bar.
const MobileTitle = () => {
  const navigate = useNavigate();
  const t = useT();
  const { pathname } = useLocation();
  const title = useAppBarTitle();
  const { rootPaths } = useMobileNav();
  const isRoot = rootPaths.includes(pathname);

  // React Router stores the history index; idx 0 means there is nothing to go back to.
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/dashboard', { replace: true }));

  if (pathname === '/dashboard') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-2 lg:hidden">
        <img src="/logo.png" alt="" className="h-8 w-8 rounded object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-gray-900">{t('Mangal Grah Mandir')}</p>
          <p className="text-[11px] text-gray-500">{t('Amalner')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 lg:hidden">
      {isRoot ? (
        <span className="w-2" />
      ) : (
        <button onClick={goBack} className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 active:bg-gray-100" aria-label={t('Back')}>
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <h1 className="truncate text-[17px] font-semibold text-gray-900">{title}</h1>
    </div>
  );
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success(t('Logged out'));
    navigate('/login');
  };

  return (
    <header className="shrink-0 border-b bg-white pt-safe">
      <div className="flex h-14 items-center justify-between gap-2 px-2 sm:px-4">
        <MobileTitle />

        {/* Desktop spacer */}
        <div className="hidden lg:block" />

        <div className="flex items-center gap-1 sm:gap-3">
          <ScanButton />
          <AlertBell />

          <div className="relative hidden lg:block">
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
                    <User className="h-4 w-4" /> {t('My Profile')}
                  </button>
                  <button
                    onClick={() => { setOpen(false); navigate('/change-password'); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <KeyRound className="h-4 w-4" /> {t('Change Password')}
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> {t('Logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
