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
