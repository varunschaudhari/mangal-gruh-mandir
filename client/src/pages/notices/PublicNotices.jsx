import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, MapPin, Megaphone, Phone, RefreshCw, Share2 } from 'lucide-react';
import { getPublicNotices } from '../../api/notice.api.js';
import { temple as cachedTemple } from '../../utils/temple.js';
import { DEVOTEE_LANGUAGES, LanguageProvider, LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { noticeFor } from '../../utils/noticeText.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import NoticesTv from './NoticesTv.jsx';

// The temple's notice board for devotees (/notices) — no sign-in. Its link (or a printed QR of it)
// is shared with devotees, and a TV in the hall shows it full screen (NoticesTv.jsx); the same
// notices also run along the bottom of the hall and Mahaprasad TV screens. Posted from
// the app's Notice Board ("for devotees" or "devotees and staff"). A shared notice's link
// (/notices#n-<id>) opens the page at that notice.

const LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

// A TV in the hall (a big landscape screen) gets the TV layout (NoticesTv.jsx); phones get the list.
// ?tv=1 / ?tv=0 in the link decides it instead — some TV browsers report a small screen.
function useTvLayout() {
  const wide = useMediaQuery('(min-width: 900px) and (min-aspect-ratio: 4/3)');
  const forced = new URLSearchParams(window.location.search).get('tv');
  return forced === '1' ? true : forced === '0' ? false : wide;
}
const NEW_DAYS = 3;        // "New" for notices posted in the last 3 days
const CLAMP = 'line-clamp-5';   // longer notices open with "Read more"

/** "2 days ago", "२ दिवसांपूर्वी", "3 घंटे पहले" — or the date once it's a month old */
function postedText(date, lang) {
  const locale = LOCALE[lang] || 'en-IN';
  const mins = Math.round((Date.now() - new Date(date)) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (mins < 60) return rtf.format(-Math.max(1, mins), 'minute');
  if (mins < 24 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
  if (mins < 30 * 24 * 60) return rtf.format(-Math.round(mins / (24 * 60)), 'day');
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Saffron sun rays from the top corner, behind the header
const HERO_BG = {
  backgroundImage: [
    'radial-gradient(circle at 88% -20%, rgba(255,255,255,0.35), transparent 45%)',
    'repeating-conic-gradient(from 0deg at 88% -20%, rgba(255,255,255,0.07) 0deg 5deg, transparent 5deg 12deg)',
    'linear-gradient(135deg, #c2410c 0%, #ea580c 45%, #f59e0b 100%)',
  ].join(','),
};

function NoticeCard({ notice, lang, highlight }) {
  const t = useT();
  const locale = LOCALE[lang] || 'en-IN';
  const { title, body } = noticeFor(notice, lang);
  const posted = new Date(notice.createdAt);
  const fresh = Date.now() - posted < NEW_DAYS * 24 * 3_600_000;

  // "Read more" only when the text is really cut off
  const bodyRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || open) return undefined;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [body, open]);

  const share = async () => {
    const url = `${window.location.origin}/notices#n-${notice._id}`;
    const text = [title, body].filter(Boolean).join('\n\n');
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch { /* closed */ }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}`, '_blank', 'noopener');
  };

  return (
    <article id={`n-${notice._id}`}
      className={`scroll-mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-shadow duration-700
        ${highlight ? 'shadow-lg ring-2 ring-primary-400' : 'ring-orange-100'}`}>
      {fresh && <div className="h-1 bg-gradient-to-r from-primary-500 to-amber-400" aria-hidden="true" />}
      <div className="flex gap-3.5 p-4 sm:gap-5 sm:p-6">
        {/* Calendar leaf: the day it was posted */}
        <time dateTime={posted.toISOString()}
          className="flex h-[60px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-b from-orange-50 to-amber-50 ring-1 ring-orange-100 sm:h-16 sm:w-14">
          <span className="text-[11px] font-semibold uppercase leading-none tracking-wide text-primary-600">
            {posted.toLocaleDateString(locale, { month: 'short' })}
          </span>
          <span className="mt-1 text-[22px] font-bold leading-none text-gray-900">
            {posted.toLocaleDateString(locale, { day: 'numeric' })}
          </span>
        </time>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {fresh && (
              <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">{t('New')}</span>
            )}
            <span>{postedText(posted, lang)}</span>
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold leading-snug text-gray-900 sm:text-lg">{title}</h2>
          {body && (
            <p ref={bodyRef}
              className={`mt-2 whitespace-pre-line break-words text-[15px] leading-7 text-gray-700 ${open ? '' : CLAMP}`}>
              {/* Cut short, blank lines between paragraphs are closed up so the "…" ends real text */}
              {open ? body : body.replace(/\n\s*\n+/g, '\n')}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            {cut || open ? (
              <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                className="flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
                {open ? t('Show less') : t('Read more')}
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            ) : <span />}
            <button type="button" onClick={share}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-primary-200 hover:bg-orange-50 hover:text-primary-700">
              <Share2 className="h-3.5 w-3.5" />{t('Share')}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100" aria-hidden="true">
      <div className="h-[60px] w-[52px] shrink-0 animate-pulse rounded-xl bg-orange-50" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

function NoticesPage() {
  const t = useT();
  const { lang } = useLanguage();
  const locale = LOCALE[lang] || 'en-IN';
  const q = useQuery({
    queryKey: ['public-notices'],
    queryFn: () => getPublicNotices().then((r) => r.data.data),
    refetchInterval: 2 * 60_000,              // a TV picks up new notices within 2 minutes
    refetchIntervalInBackground: true,
  });
  const tv = useTvLayout();
  const notices = (q.data?.notices || []).filter((n) => noticeFor(n, lang).title);
  const info = q.data?.temple?.name ? q.data.temple : cachedTemple();
  const phone = info.phone?.trim();

  useEffect(() => { document.title = `${t('Notice Board')} · ${info.nameMr || info.name}`; }, [t, info.nameMr, info.name]);

  // A shared notice's link: bring that notice into view and mark it for a moment
  const [highlight, setHighlight] = useState(null);
  const jumped = useRef(false);
  useEffect(() => {
    const id = window.location.hash.replace(/^#n-/, '');
    if (jumped.current || !id || !q.data?.notices?.some((n) => n._id === id)) return;
    jumped.current = true;
    document.getElementById(`n-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlight(id);
  }, [q.data]);
  useEffect(() => {
    if (!highlight) return undefined;
    const timer = setTimeout(() => setHighlight(null), 3500);
    return () => clearTimeout(timer);
  }, [highlight]);

  if (tv) {
    return (
      <NoticesTv notices={notices} info={info} lang={lang} loading={q.isLoading}
        offlineSince={q.isError && q.data ? new Date(q.dataUpdatedAt) : null} />
    );
  }

  return (
    <div className="min-h-dvh bg-[#fffaf3]">
      {/* ── Header ── */}
      <header className="relative overflow-hidden pt-safe text-white" style={HERO_BG}>
        <div className="mx-auto max-w-2xl px-4 pb-14 pt-4 sm:px-6 sm:pb-16 sm:pt-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm" />
            <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug drop-shadow-sm">{info.nameMr || info.name}</p>
            <LanguageSwitch className="shrink-0 border-white/40 text-xs shadow-sm" />
          </div>

          <div className="mt-8 flex items-end gap-4 sm:mt-10">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
              <Megaphone className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{t('Notice Board')}</h1>
              <p className="mt-0.5 text-sm text-orange-50/95 sm:text-base">{t('Announcements from the temple')}</p>
            </div>
          </div>

          {q.data && (
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="rounded-full bg-white/20 px-3 py-1 ring-1 ring-white/25">
                {notices.length === 1 ? t('1 notice') : t('{n} notices', { n: notices.length.toLocaleString(locale) })}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-orange-50 ring-1 ring-white/20">
                <RefreshCw className={`h-3 w-3 ${q.isFetching ? 'animate-spin' : ''}`} />
                {t('Updated {time}', { time: new Date(q.dataUpdatedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) })}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Notices: the cards overlap the header ── */}
      <main className="relative mx-auto -mt-8 max-w-2xl space-y-3 px-4 sm:space-y-4 sm:px-6">
        {q.isLoading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : q.isError && !q.data ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-orange-100">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="mt-3 text-lg font-bold text-gray-900">{t('Could not load the notices')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('Check your internet connection and try again.')}</p>
            <button type="button" onClick={() => q.refetch()} className="btn-primary mt-5">{t('Try again')}</button>
          </div>
        ) : notices.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-orange-100">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 ring-8 ring-orange-50/50">
              <Megaphone className="h-8 w-8 text-primary-400" />
            </span>
            <h2 className="mt-5 text-lg font-bold text-gray-900">{t('No notices right now.')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('Please check back later.')}</p>
          </div>
        ) : (
          notices.map((n) => <NoticeCard key={n._id} notice={n} lang={lang} highlight={highlight === n._id} />)
        )}
      </main>

      {/* ── The temple office ── */}
      <footer className="mx-auto max-w-2xl px-4 pb-[calc(2rem+var(--safe-bottom))] pt-8 sm:px-6">
        {(phone || info.address) && (
          <section className="rounded-2xl border border-orange-100 bg-white/70 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('Temple office')}</h2>
            <p className="mt-1.5 font-semibold text-gray-900">{info.nameMr || info.name}</p>
            {info.address && (
              <p className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-gray-600">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-gray-400" />{info.address}
              </p>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 sm:inline-flex">
                <Phone className="h-4 w-4" />{t('Call the temple office')}<span className="font-normal opacity-90">· {phone}</span>
              </a>
            )}
          </section>
        )}
        <p className="mt-5 text-center text-xs text-gray-400">{t('This page updates by itself — new notices appear here.')}</p>
      </footer>
    </div>
  );
}

// A devotee's page: English, Marathi or Hindi — at first the phone's language — with the same saved
// choice as the other devotee pages (/m, /r, /prasad), kept apart from the staff app's language
export default function PublicNotices() {
  return <LanguageProvider storageKey="mgm-lang-devotee" languages={DEVOTEE_LANGUAGES} fromBrowser><NoticesPage /></LanguageProvider>;
}
