import { useMemo } from 'react';
import { usePermissions } from './usePermissions.js';
import { getMobileTabs, QUICK_ACTIONS } from '../components/Layout/navConfig.js';

// Bottom-tab layout for the signed-in user: Home · tab · (+) · tab · More,
// or Home · tab · tab · tab · More when the user has nothing to create.
export const useMobileNav = () => {
  const { can, role, user } = usePermissions();

  return useMemo(() => {
    const quickActions = QUICK_ACTIONS.filter((a) => can(a.permission));
    const tabs = getMobileTabs(role, can, quickActions.length ? 2 : 3);
    const rootPaths = ['/dashboard', ...tabs.map((t) => t.to)];
    return { tabs, quickActions, rootPaths };
    // `can` is recreated every render; the user's permissions are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.permissions]);
};

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
