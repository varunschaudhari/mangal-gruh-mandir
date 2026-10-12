import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { ChevronRight, History, KeyRound, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader.jsx';
import { navConfig } from '../components/Layout/navConfig.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { useNavBadges } from '../hooks/useNavBadges.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../utils/permissions.js';
import { isNative } from '../utils/platform.js';
import { addRecent, getRecent } from '../utils/recentNav.js';
import haptics from '../utils/haptics.js';
import { useT, LanguageSwitch } from '../i18n/index.jsx';
import { useTemple } from '../utils/temple.js';

// The full menu for phones and tablets — the "More" tab. A page rather than a pop-up, so Back
// from an option returns here at the same scroll position (AppLayout restores it), and the
// options opened most recently sit at the top.

const Tile = ({ item, badge, onOpen, t }) => (
  <button
    type="button"
    onClick={() => onOpen(item.to)}
    className="relative flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-1 py-3 text-center shadow-sm active:bg-gray-50"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
      <item.icon className="h-5 w-5" />
    </span>
    <span className="text-xs font-medium leading-tight text-gray-700">{t(item.label)}</span>
    {badge > 0 && (
      <span className="absolute right-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

const MorePage = () => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user, logout } = useAuth();
  const badges = useNavBadges();
  const t = useT();
  const { name: templeName } = useTemple();
  const userId = user?._id || user?.id;
  const [recent, setRecent] = useState(() => getRecent(userId));
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (isNative) App.getInfo().then((i) => setVersion(`${i.version} (${i.build})`)).catch(() => {});
  }, []);

  const groups = useMemo(() => navConfig
    .filter((g) => g.children)
    .map((g) => ({ ...g, items: g.children.filter((c) => !c.permission || can(c.permission)) }))
    .filter((g) => g.items.length),
  // `can` is recreated every render; the user's permissions are what matter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [user?.role, user?.permissions]);

  // Recently used: only options this person can still open.
  const byPath = useMemo(() => new Map(groups.flatMap((g) => g.items).map((i) => [i.to, i])), [groups]);
  const recentItems = recent.map((p) => byPath.get(p)).filter(Boolean);

  const open = (to) => {
    haptics.tap();
    if (byPath.has(to)) setRecent(addRecent(userId, to));
    navigate(to);
  };

  const handleLogout = async () => {
    await logout();
    toast.success(t('Logged out'));
    navigate('/login');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="More" />

      {/* Who is signed in */}
      <button type="button" onClick={() => open('/profile')}
        className="mb-5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-bold text-primary-700">
          {user?.name?.[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-gray-900">{user?.name}</span>
          <span className="block truncate text-xs text-gray-500">{t(ROLE_LABELS[user?.role] || user?.role)} · {t('View profile')}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      </button>

      <div className="space-y-5">
        {recentItems.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <History className="h-3.5 w-3.5" /> {t('Recently used')}
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {recentItems.map((item) => <Tile key={item.to} item={item} badge={badges[item.to]} onOpen={open} t={t} />)}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{t(g.label)}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.items.map((item) => <Tile key={item.to} item={item} badge={badges[item.to]} onOpen={open} t={t} />)}
            </div>
          </section>
        ))}

        <section className="divide-y overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <button type="button" onClick={() => open('/change-password')} className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-gray-700 active:bg-gray-50">
            <KeyRound className="h-5 w-5 text-gray-400" />
            <span className="flex-1 text-left">{t('Change Password')}</span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
          <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-600 active:bg-red-50">
            <LogOut className="h-5 w-5" />
            <span className="flex-1 text-left">{t('Logout')}</span>
          </button>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-700">{t('Language')}</span>
          <LanguageSwitch />
        </div>

        <p className="pb-2 text-center text-xs text-gray-400">
          {t(templeName)}{version && ` · v${version}`}
        </p>
      </div>
    </div>
  );
};

export default MorePage;
