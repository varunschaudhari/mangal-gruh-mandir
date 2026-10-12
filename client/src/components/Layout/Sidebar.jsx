import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useNavBadges } from '../../hooks/useNavBadges.js';
import { navConfig } from './navConfig.js';
import { useT } from '../../i18n/index.jsx';
import { useTemple } from '../../utils/temple.js';

const NavItem = ({ item, can, onNavigate, badges = {} }) => {
  const location = useLocation();
  const t = useT();
  const childActive = item.children?.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(true);

  // For leaf items check permission directly; groups rely on visibleChildren below
  if (!item.children && item.permission && !can(item.permission)) return null;

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
        {t(item.label)}
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
        <span className="flex-1 text-left">{t(item.label)}</span>
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
                <span className="flex-1">{t(child.label)}</span>
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

// Desktop-only (lg+). Phones and tablets use MobileTabBar and the More page (/more) instead.
const Sidebar = () => {
  const { can } = usePermissions();
  const t = useT();
  const { name: templeName } = useTemple();
  const badges  = useNavBadges();

  return (
    <aside
      className="hidden lg:flex h-dvh w-64 shrink-0 flex-col bg-gray-900"
    >
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white p-1">
            <img
              src="/logo.png"
              alt={templeName}
              className="h-10 w-10 rounded object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight text-white">{t(templeName)}</p>
            <p className="text-xs text-gray-400">{t('Stock Management')}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navConfig.map((item, i) => (
          <NavItem key={i} item={item} can={can} badges={badges} />
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
