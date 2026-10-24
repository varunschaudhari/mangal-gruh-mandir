import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Megaphone } from 'lucide-react';
import { getStaffNotices } from '../../api/notice.api.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { isNew, noticeFor } from '../../utils/noticeText.js';

// The latest staff notices on the dashboard, for everyone signed in; the ones posted since the
// Notice Board was last opened on this device are marked new. Nothing when there are none.
export default function NoticeDashboardCard({ className = '' }) {
  const t = useT();
  const { lang } = useLanguage();
  const { data } = useQuery({
    queryKey: ['notices', 'staff'],
    queryFn: () => getStaffNotices().then((r) => r.data.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const notices = data || [];
  if (!notices.length) return null;
  const fresh = notices.filter((n) => isNew(n)).length;

  return (
    <Link to="/notice-board" className={`card block p-4 transition-colors hover:border-primary-300 ${className}`}>
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary-600" />
        <h2 className="flex-1 font-semibold text-gray-800">{t('Notice Board')}</h2>
        {fresh > 0 && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">{t('{n} new', { n: fresh })}</span>}
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
      <ul className="mt-2 space-y-1.5">
        {notices.slice(0, 3).map((n) => (
          <li key={n._id} className={`truncate text-sm ${isNew(n) ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
            {noticeFor(n, lang).title}
          </li>
        ))}
      </ul>
    </Link>
  );
}
