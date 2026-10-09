import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { RefreshCw, CloudOff } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import MoreSheet from './MoreSheet.jsx';
import QuickActionsSheet from './QuickActionsSheet.jsx';
import { AppBarProvider } from './AppBarContext.jsx';
import { isTaskRoute } from './navConfig.js';
import { usePullToRefresh } from '../../hooks/usePullToRefresh.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { isNative } from '../../utils/platform.js';

const RESUME_REFRESH_AFTER_MS = 60 * 1000;

// Native apps stay alive in the background for hours; refresh what's on screen when the
// user comes back after a while (the web app has refetchOnWindowFocus turned off).
const useRefreshOnResume = (queryClient) => {
  useEffect(() => {
    if (!isNative) return undefined;
    let hiddenAt = 0;
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > RESUME_REFRESH_AFTER_MS) queryClient.refetchQueries({ type: 'active' });
    });
    return () => { handle.then((h) => h.remove()); };
  }, [queryClient]);
};

const useOnline = () => {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
};

const AppLayout = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const isTouchLayout = useMediaQuery('(max-width: 1023px)');
  const online = useOnline();
  useRefreshOnResume(queryClient);

  // <main> is the scroll container, so reset it on navigation like a page load would.
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [pathname]);

  const { pull, refreshing, threshold } = usePullToRefresh(
    mainRef,
    () => queryClient.refetchQueries({ type: 'active' }),
    { enabled: isTouchLayout },
  );

  const withTabBar = !isTaskRoute(pathname);

  return (
    <AppBarProvider>
      <div className="flex h-dvh overflow-hidden bg-gray-50">
        <Sidebar />

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Navbar />
          {!online && (
            <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-800">
              <CloudOff className="h-3.5 w-3.5" /> You're offline — check your internet connection
            </div>
          )}
          <main
            ref={mainRef}
            className={`relative flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 ${withTabBar ? 'pb-tabbar lg:pb-6' : 'pb-[calc(1rem+var(--safe-bottom))]'}`}
          >
            {/* Pull-to-refresh indicator */}
            {(pull > 0 || refreshing) && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
                style={{ transform: `translateY(${pull - 36}px)` }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md">
                  <RefreshCw
                    className={`h-4 w-4 text-primary-600 ${refreshing ? 'animate-spin' : ''}`}
                    style={refreshing ? undefined : { transform: `rotate(${(pull / threshold) * 270}deg)`, opacity: Math.min(1, pull / threshold) }}
                  />
                </span>
              </div>
            )}
            <div style={pull > 0 ? { transform: `translateY(${pull}px)` } : undefined} className={pull > 0 ? '' : 'transition-transform'}>
              <Outlet />
            </div>
          </main>
        </div>

        <MobileTabBar
          onMore={() => setMoreOpen(true)}
          onQuickActions={() => setQuickOpen(true)}
          onReselect={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      </div>
    </AppBarProvider>
  );
};

export default AppLayout;
