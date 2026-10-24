import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { getPublicNotices } from '../../api/notice.api.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { noticeFor } from '../../utils/noticeText.js';

// Devotee notices running along the bottom of a TV screen (Mahaprasad and hall screens), in the
// screen's own language. Checks for new ones every 2 minutes; shows nothing when there are none.
// Posted from the app's Notice Board (for devotees, or devotees and staff).

const READ_SPEED = 6;   // characters a second — readable from across the room
const MIN_CHARS = 120;  // short notices are repeated so the line never runs out mid-screen

export default function NoticeTicker({ className = '', textClass = 'text-2xl' }) {
  const t = useT();
  const { lang } = useLanguage();
  const { data } = useQuery({
    queryKey: ['public-notices'],
    queryFn: () => getPublicNotices().then((r) => r.data.data),
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: true,
  });

  const lines = (data?.notices || [])
    .map((n) => noticeFor(n, lang))
    .filter((n) => n.title)
    .map((n) => (n.body ? `${n.title} — ${n.body.replace(/\s+/g, ' ')}` : n.title));
  if (!lines.length) return null;

  let items = lines;
  while (items.join('').length < MIN_CHARS) items = [...items, ...lines];
  const duration = Math.max(20, Math.round(items.join('').length / READ_SPEED));

  return (
    <div role="marquee" aria-label={t('Notices')}
      className={`flex shrink-0 items-stretch overflow-hidden rounded-xl bg-amber-300 font-semibold text-slate-950 ${textClass} ${className}`}>
      <span className="flex shrink-0 items-center gap-2 bg-amber-500 px-[1em]">
        <Megaphone className="h-[1em] w-[1em]" aria-hidden="true" />{t('Notices')}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="animate-ticker flex w-max whitespace-nowrap py-[0.4em]" style={{ '--ticker-duration': `${duration}s` }}>
          {[0, 1].map((copy) => (
            <span key={copy} aria-hidden={copy === 1 || undefined} className="flex">
              {items.map((text, i) => <span key={i} className="px-[1.5em]">✦ {text}</span>)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
