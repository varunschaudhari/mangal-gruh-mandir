import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutGrid, Plus } from 'lucide-react';
import { useMobileNav } from '../../hooks/useMobileNav.js';
import { useNavBadges } from '../../hooks/useNavBadges.js';
import { isTaskRoute, resolveActiveTab } from './navConfig.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

const TabButton = ({ label, icon: Icon, active, badge, dot, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5"
    aria-current={active ? 'page' : undefined}
  >
    <span
      className={`relative flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-primary-100 text-primary-700' : 'text-gray-500'
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
      {dot && !badge && <span className="absolute top-0 right-3.5 h-2 w-2 rounded-full bg-red-500" />}
      {badge > 0 && (
        <span className="absolute -top-1 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
    <span className={`text-[11px] leading-tight ${active ? 'font-semibold text-primary-700' : 'font-medium text-gray-500'}`}>
      {label}
    </span>
  </button>
);

// Phones and tablets (< lg). Hidden on full-screen task routes and while the keyboard is up.
const MobileTabBar = ({ onQuickActions, onReselect }) => {
  const { pathname } = useLocation();
  const t = useT();
  const navigate = useNavigate();
  const { tabs, quickActions } = useMobileNav();
  const badges = useNavBadges();

  if (isTaskRoute(pathname)) return null;

  const active = resolveActiveTab(pathname, tabs);
  const go = (key, to) => {
    haptics.tap();
    if (key === active && pathname === to) onReselect?.();
    else navigate(to);
  };

  const middle = tabs.map((tab) => (
    <TabButton
      key={tab.key}
      label={t(tab.label)}
      icon={tab.icon}
      active={active === tab.key}
      badge={tab.badge ? badges[tab.badge] : 0}
      onClick={() => go(tab.key, tab.to)}
    />
  ));

  if (quickActions.length) {
    middle.splice(1, 0, (
      <div key="quick" className="flex flex-1 items-start justify-center">
        <button
          onClick={() => { haptics.tap(); onQuickActions(); }}
          className="-mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 ring-4 ring-white active:scale-95 transition-transform"
          aria-label={t('Quick actions')}
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    ));
  }

  const moreBadge = Object.entries(badges).some(([to, n]) => n && !tabs.some((tab) => tab.badge === to));

  return (
    <nav className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur pb-safe lg:hidden">
      <div className="mx-auto flex h-16 max-w-xl items-stretch">
        <TabButton label={t('Home')} icon={Home} active={active === 'home'} onClick={() => go('home', '/dashboard')} />
        {middle}
        <TabButton
          label={t('More')}
          icon={LayoutGrid}
          active={active === 'more'}
          dot={moreBadge}
          onClick={() => go('more', '/more')}
        />
      </div>
    </nav>
  );
};

export default MobileTabBar;
