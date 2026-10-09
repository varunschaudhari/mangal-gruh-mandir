import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { ChevronRight, KeyRound, LogOut, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Sheet from '../ui/Sheet.jsx';
import { navConfig } from './navConfig.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useNavBadges } from '../../hooks/useNavBadges.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../utils/permissions.js';
import { isNative } from '../../utils/platform.js';
import haptics from '../../utils/haptics.js';
import { useT, LanguageSwitch } from '../../i18n/index.jsx';

// Full menu for phones/tablets, opened from the "More" tab. Mirrors the desktop sidebar.
const MoreSheet = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user, logout } = useAuth();
  const badges = useNavBadges();
  const [version, setVersion] = useState(null);
  const t = useT();

  useEffect(() => {
    if (open && isNative && !version) {
      App.getInfo().then((i) => setVersion(`${i.version} (${i.build})`)).catch(() => {});
    }
  }, [open, version]);

  const go = (to) => {
    haptics.tap();
    onClose();
    navigate(to);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    toast.success(t('Logged out'));
    navigate('/login');
  };

  const groups = navConfig
    .filter((g) => g.children)
    .map((g) => ({ ...g, items: g.children.filter((c) => !c.permission || can(c.permission)) }))
    .filter((g) => g.items.length);

  return (
    <Sheet open={open} onClose={onClose} full size="lg" bodyClassName="!px-0 !pt-0 bg-gray-50">
      {/* Header: who is signed in */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={() => go('/profile')} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-bold text-primary-700">
            {user?.name?.[0]?.toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-gray-900">{user?.name}</span>
            <span className="block truncate text-xs text-gray-500">{t(ROLE_LABELS[user?.role] || user?.role)} · {t('View profile')}</span>
          </span>
        </button>
        <button onClick={onClose} className="btn-ghost -mr-2 rounded-full p-2" aria-label={t('Close')}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-4">
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{t(g.label)}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.items.map((item) => {
                const badge = badges[item.to];
                return (
                  <button
                    key={item.to}
                    onClick={() => go(item.to)}
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
              })}
            </div>
          </section>
        ))}

        <section className="divide-y overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <button onClick={() => go('/change-password')} className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-gray-700 active:bg-gray-50">
            <KeyRound className="h-5 w-5 text-gray-400" />
            <span className="flex-1 text-left">{t('Change Password')}</span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-600 active:bg-red-50">
            <LogOut className="h-5 w-5" />
            <span className="flex-1 text-left">{t('Logout')}</span>
          </button>
        </section>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-700">{t('Language')}</span>
          <LanguageSwitch />
        </div>

        <p className="pb-2 text-center text-xs text-gray-400">
          {t('Mangal Grah Mandir, Amalner')}{version && ` · v${version}`}
        </p>
      </div>
    </Sheet>
  );
};

export default MoreSheet;
