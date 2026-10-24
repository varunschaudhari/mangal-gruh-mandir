import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import QRCode from 'qrcode/lib/browser.js';
import { Maximize2, Megaphone, Minimize2, WifiOff } from 'lucide-react';
import { LanguageSwitch, useT } from '../../i18n/index.jsx';
import { noticeFor } from '../../utils/noticeText.js';

// The notice board on a TV in the hall (PublicNotices.jsx picks it on a big landscape screen, or
// with ?tv=1): read from across the room, nobody touching it. One notice at a time in large text,
// moving on by itself (longer notices stay up longer) with a bar showing when; long text shrinks to
// fit instead of being cut. Beside it: every notice, the current one marked, and a QR to read them
// on a phone. Keeps the screen awake; the language and fullscreen buttons show only while someone
// is using the screen.

const LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };
const SHOW_MIN_MS = 12_000;
const SHOW_MAX_MS = 45_000;
const MS_PER_CHAR = 70;        // reading time
const NEW_DAYS = 3;
const CONTROLS_MS = 4000;

// Warm dark, saffron light from the top corner — the hall's other TV screens are dark too
const TV_BG = {
  backgroundImage: [
    'radial-gradient(ellipse at 100% 0%, rgba(234,88,12,0.35), transparent 55%)',
    'repeating-conic-gradient(from 200deg at 100% 0%, rgba(251,146,60,0.05) 0deg 4deg, transparent 4deg 10deg)',
    'linear-gradient(160deg, #1f120a 0%, #140b07 60%, #0f0805 100%)',
  ].join(','),
};

const showFor = ({ title, body }) => Math.min(SHOW_MAX_MS, Math.max(SHOW_MIN_MS, (title.length + body.length) * MS_PER_CHAR));

/** Keeps the TV from going to sleep while the board is open */
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } };
    const onVisible = () => { if (!document.hidden) acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); };
  }, []);
}

/** true for a few seconds after the mouse moves, the screen is touched or a key pressed */
function useActive() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setActive(false), CONTROLS_MS);
    const wake = () => { setActive(true); clearTimeout(timer); timer = setTimeout(() => setActive(false), CONTROLS_MS); };
    const events = ['pointermove', 'pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, wake));
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, wake)); };
  }, []);
  return active;
}

export default function NoticesTv({ notices, info, lang, loading, offlineSince }) {
  const t = useT();
  const locale = LOCALE[lang] || 'en-IN';
  const active = useActive();
  useWakeLock();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const tick = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(tick); }, []);

  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

  // The QR devotees scan to read the notices on their phones
  const [qr, setQr] = useState(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/notices`, { width: 360, margin: 1 }).then(setQr).catch(() => {});
  }, []);

  // Which notice is up; moves on by itself
  const count = notices.length;
  const [index, setIndex] = useState(0);
  const shown = count ? notices[index % count] : null;
  const text = shown ? noticeFor(shown, lang) : { title: '', body: '' };
  const duration = showFor(text);
  useEffect(() => {
    if (count < 2) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), duration);
    return () => clearTimeout(timer);
  }, [index, count, duration]);
  useEffect(() => { if (index >= count) setIndex(0); }, [index, count]);

  // Long text shrinks until it fits the panel (never below half size)
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return undefined;
    const fit = () => {
      let scale = 1;
      content.style.setProperty('--fit', '1');
      while (content.scrollHeight > panel.clientHeight && scale > 0.5) {
        scale -= 0.05;
        content.style.setProperty('--fit', String(scale));
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [shown?._id, lang, text.title, text.body]);

  const templeName = info.nameMr || info.name;
  const posted = shown ? new Date(shown.createdAt) : null;
  const fresh = posted && Date.now() - posted < NEW_DAYS * 24 * 3_600_000;

  return (
    <div className="flex h-dvh flex-col overflow-hidden text-white" style={TV_BG}>
      {/* ── Temple, board, clock ── */}
      <header className="flex shrink-0 items-center gap-[1.4vw] px-[3vw] pt-[3.5vh]">
        <img src="/logo.png" alt="" className="h-[8vh] w-[8vh] shrink-0 rounded-[1.2vh] bg-white object-contain p-[0.5vh]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[clamp(1.1rem,2.2vw,2.8rem)] font-bold leading-tight">{templeName}</p>
          <p className="mt-[0.4vh] flex items-center gap-[0.6vw] text-[clamp(0.9rem,1.5vw,1.9rem)] font-semibold text-amber-300">
            <Megaphone className="h-[1em] w-[1em]" />{t('Notice Board')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[clamp(1.6rem,3.4vw,4.2rem)] font-bold leading-none tabular-nums">
            {now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
          </p>
          <p className="mt-[0.6vh] text-[clamp(0.8rem,1.3vw,1.6rem)] text-white/60">
            {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </header>

      {loading ? (
        <p className="flex flex-1 items-center justify-center text-[clamp(1.2rem,2vw,2.4rem)] text-white/60">{t('Loading…')}</p>
      ) : !shown ? (
        // Nothing posted for devotees: a calm screen, still with the QR
        <main className="flex flex-1 flex-col items-center justify-center gap-[3vh] px-[3vw] text-center">
          <span className="flex h-[16vh] w-[16vh] items-center justify-center rounded-full bg-white/10 ring-[1.5vh] ring-white/5">
            <Megaphone className="h-[8vh] w-[8vh] text-amber-300" />
          </span>
          <h1 className="text-[clamp(1.6rem,3vw,3.6rem)] font-bold">{t('No notices right now.')}</h1>
          <p className="text-[clamp(1rem,1.6vw,2rem)] text-white/60">{t('Please check back later.')}</p>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 gap-[2.2vw] px-[3vw] pb-[3.5vh] pt-[3vh]">
          {/* ── The notice that's up ── */}
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[2vw] bg-white/[0.06] px-[3vw] pb-[4vh] pt-[3.5vh] ring-1 ring-white/10">
            <div className="flex shrink-0 items-center gap-[1vw] text-[clamp(0.85rem,1.4vw,1.8rem)]">
              {fresh && (
                <span className="rounded-full bg-primary-500 px-[0.9em] py-[0.2em] text-[0.85em] font-bold uppercase tracking-wider">{t('New')}</span>
              )}
              <time dateTime={posted.toISOString()} className="text-white/60">
                {posted.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
              {count > 1 && <span className="ml-auto tabular-nums text-white/45">{index + 1} / {count}</span>}
            </div>
            <div ref={panelRef} className="mt-[3vh] min-h-0 flex-1 overflow-hidden">
              <div ref={contentRef} key={`${shown._id}-${lang}`} className="animate-notice-in">
                <h1 className="font-extrabold leading-[1.15] tracking-tight" style={{ fontSize: 'calc(var(--fit, 1) * clamp(2rem, 4.4vw, 5.6rem))' }}>
                  {text.title}
                </h1>
                {text.body && (
                  <p className="mt-[3vh] whitespace-pre-line break-words leading-[1.5] text-white/85" style={{ fontSize: 'calc(var(--fit, 1) * clamp(1.2rem, 2.2vw, 2.8rem))' }}>
                    {text.body}
                  </p>
                )}
              </div>
            </div>
            {/* Time until the next notice */}
            {count > 1 && (
              <div className="absolute inset-x-0 bottom-0 h-[0.7vh] bg-white/10">
                <div key={`${index}-${shown._id}`} className="h-full origin-left bg-gradient-to-r from-primary-500 to-amber-400"
                  style={{ animation: `notice-progress ${duration}ms linear forwards` }} />
              </div>
            )}
          </section>

          {/* ── Every notice, and the QR ── */}
          <aside className="flex w-[27vw] shrink-0 flex-col gap-[2.5vh]">
            {count > 1 && (
              <div className="min-h-0 flex-1 overflow-hidden rounded-[1.5vw] bg-white/[0.04] p-[1.4vw] ring-1 ring-white/10">
                <p className="text-[clamp(0.7rem,1vw,1.3rem)] font-semibold uppercase tracking-[0.15em] text-white/45">{t('All notices')}</p>
                <ol className="mt-[1.5vh] space-y-[0.8vh]">
                  {notices.map((n, i) => (
                    <li key={n._id}
                      className={`flex gap-[0.7vw] rounded-[0.8vw] px-[0.8vw] py-[1vh] text-[clamp(0.8rem,1.25vw,1.6rem)] leading-snug transition-colors duration-500
                        ${i === index % count ? 'bg-primary-500/20 text-white ring-1 ring-primary-400/50' : 'text-white/55'}`}>
                      <span className="w-[1.4em] shrink-0 tabular-nums text-white/35">{i + 1}</span>
                      <span className="line-clamp-2 min-w-0">{noticeFor(n, lang).title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className={`flex items-center gap-[1.2vw] rounded-[1.5vw] bg-white p-[1.3vw] text-gray-900 ${count > 1 ? 'shrink-0' : 'mt-auto'}`}>
              {qr && <img src={qr} alt="" className="aspect-square w-[9vw] shrink-0" />}
              <div className="min-w-0">
                <p className="text-[clamp(0.9rem,1.45vw,1.9rem)] font-bold leading-snug">{t('Read these notices on your phone')}</p>
                <p className="mt-[0.5vh] text-[clamp(0.7rem,1.05vw,1.3rem)] text-gray-500">{t('Scan the QR code')}</p>
              </div>
            </div>
          </aside>
        </main>
      )}

      {offlineSince && (
        <p className="fixed bottom-[1.5vh] left-[3vw] flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 text-[clamp(0.75rem,1vw,1.2rem)] text-amber-300">
          <WifiOff className="h-[1em] w-[1em]" />{t('Not updating — check the internet. Showing notices from {time}.', { time: offlineSince.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) })}
        </p>
      )}

      {/* Language and fullscreen: only while someone is using the screen */}
      <div className={`fixed bottom-[1.5vh] right-[1.5vw] flex items-center gap-2 rounded-full bg-black/70 p-1.5 ring-1 ring-white/15 transition-opacity duration-300
        ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <LanguageSwitch className="border-white/20" />
        {document.documentElement.requestFullscreen && (
          <button type="button" onClick={toggleFull} className="rounded-full p-2 text-white hover:bg-white/10"
            aria-label={full ? t('Exit fullscreen') : t('Fullscreen')} title={full ? t('Exit fullscreen') : t('Fullscreen')}>
            {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}
