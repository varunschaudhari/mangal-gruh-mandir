import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Megaphone } from 'lucide-react';
import { getPublicNotices } from '../../api/notice.api.js';
import Spinner from '../../components/ui/Spinner.jsx';
import { Shell } from '../mahaprasad/PublicCoupons.jsx';
import { DEVOTEE_LANGUAGES, LanguageProvider, useLanguage, useT } from '../../i18n/index.jsx';
import { noticeFor } from '../../utils/noticeText.js';

// The temple's notice board for devotees (/notices) — no sign-in. Its link (or a printed QR of it)
// is shared with devotees; the same notices run along the bottom of the TV screens. Posted from
// the app's Notice Board ("for devotees" or "devotees and staff").

const dayText = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function NoticesPage() {
  const t = useT();
  const { lang } = useLanguage();
  const q = useQuery({
    queryKey: ['public-notices'],
    queryFn: () => getPublicNotices().then((r) => r.data.data),
    refetchInterval: 5 * 60_000,
  });
  const notices = (q.data?.notices || []).map((n) => ({ ...n, ...noticeFor(n, lang) })).filter((n) => n.title);
  const phone = q.data?.temple?.phone;

  useEffect(() => { document.title = t('Notice Board'); }, [t]);

  return (
    <Shell temple={q.data?.temple?.name ? q.data.temple : undefined} subtitle="Notice Board">
      {q.isLoading ? (
        <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
      ) : q.isError && !q.data ? (
        <div className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-lg font-bold text-gray-900">{t('Could not load the notices')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('Check your internet connection and try again.')}</p>
          <button type="button" onClick={() => q.refetch()} className="btn-primary mt-4">{t('Try again')}</button>
        </div>
      ) : notices.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Megaphone className="mx-auto h-10 w-10 text-primary-300" />
          <p className="mt-3 text-gray-600">{t('No notices right now.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <article key={n._id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold leading-snug text-gray-900">{n.title}</h2>
              {n.body && <p className="mt-1.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-700">{n.body}</p>}
              <p className="mt-2 text-xs text-gray-400">{dayText(n.createdAt)}</p>
            </article>
          ))}
        </div>
      )}
      {phone && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {t('Questions? Call the temple office:')}{' '}
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-700">{phone}</a>
        </p>
      )}
    </Shell>
  );
}

// A devotee's page: English, Marathi or Hindi — at first the phone's language — with the same saved
// choice as the other devotee pages (/m, /r, /prasad), kept apart from the staff app's language
export default function PublicNotices() {
  return <LanguageProvider storageKey="mgm-lang-devotee" languages={DEVOTEE_LANGUAGES} fromBrowser><NoticesPage /></LanguageProvider>;
}
