import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Maximize2, Minimize2, WifiOff } from 'lucide-react';
import { getMahaprasadDashboard } from '../../api/mahaprasadDashboard.api.js';
import { localDateStr } from '../../utils/formatters.js';
import { temple } from '../../utils/temple.js';
import { DEVOTEE_LANGUAGES, LanguageProvider, LanguageSwitch, useT } from '../../i18n/index.jsx';
import NoticeTicker from '../../components/notices/NoticeTicker.jsx';

// The Mahaprasad TV screen (/mahaprasad/screen), for the hall or the kitchen: prasad served
// against the day's total, in numbers read from across the room, plus sold, still to serve and
// left of the total. Refreshes every 15 seconds, keeps the screen on, and moves to the new day
// at midnight (unless a date is fixed in the link: ?date=YYYY-MM-DD). The same figures in detail:
// MahaprasadDashboard.jsx.

// Dark steps of the dashboard's two colours, validated on this surface (dataviz skill)
const SURFACE = '#1a1a19';
const SOLD = '#3987e5';
const SERVED = '#d95926';

const num = (n) => Number(n || 0).toLocaleString('en-IN');
const pct = (n, total) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);
const clockText = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayText = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

function Figure({ label, value, color, note }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/5 px-[2vw] py-[2.2vh]">
      <p className="flex items-center gap-2 text-[clamp(1rem,1.8vw,2rem)] text-gray-300">
        {color && <span className="inline-block h-[0.8em] w-[0.8em] rounded-sm" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-1 text-[clamp(2.5rem,6vw,7rem)] font-semibold leading-none">{value}</p>
      {note && <p className="mt-2 text-[clamp(0.9rem,1.3vw,1.4rem)] text-gray-400">{note}</p>}
    </div>
  );
}

function Bar({ value, total, color }) {
  return (
    <div className="h-[2.2vh] min-h-3 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct(value, total)}%`, background: color }} />
    </div>
  );
}

function MahaprasadBoard() {
  const t = useT();
  const [params] = useSearchParams();
  const fixedDate = params.get('date');
  const [now, setNow] = useState(() => new Date());
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const date = fixedDate || localDateStr(now);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  }, []);

  // Keep the TV awake while this is open
  useEffect(() => {
    let lock = null;
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } };
    const onVisible = () => { if (!document.hidden) acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

  const q = useQuery({
    queryKey: ['mahaprasad-dashboard', date],
    queryFn: () => getMahaprasadDashboard(date).then((r) => r.data.data),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
  const d = q.data;
  const info = temple();

  useEffect(() => { document.title = t('Shri Mangal Mahaprasad'); }, [t]);

  return (
    <div className="flex min-h-dvh flex-col gap-[3vh] px-[3vw] py-[3vh] text-white" style={{ background: SURFACE }}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[clamp(1.2rem,2.4vw,2.8rem)] font-bold">{info.nameMr || info.name}</p>
          <p className="text-[clamp(1rem,1.8vw,2rem)] text-orange-300">{t('Shri Mangal Mahaprasad')} · {dayText(date)}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[clamp(1.5rem,3.2vw,3.6rem)] font-semibold tabular-nums">{clockText(now)}</p>
          <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
            <LanguageSwitch className="border-white/30 text-xs" />
            <button type="button" onClick={toggleFull} className="rounded-lg p-2 hover:bg-white/10" aria-label={full ? t('Exit fullscreen') : t('Fullscreen')} title={full ? t('Exit fullscreen') : t('Fullscreen')}>
              {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <Link to="/mahaprasad/dashboard" className="rounded-lg p-2 hover:bg-white/10" aria-label={t('Back')} title={t('Back')}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {!d ? (
        <div className="flex flex-1 items-center justify-center text-[clamp(1.2rem,2vw,2rem)] text-gray-400">
          {q.isError ? (q.error?.response?.data?.message || t('Could not load the dashboard')) : t('Loading…')}
        </div>
      ) : (
        <>
          <main className="flex flex-1 flex-col justify-center gap-[2.5vh]">
            <p className="text-[clamp(1.4rem,2.6vw,3rem)] text-gray-300">{t('Prasad served')}</p>
            <p className="flex flex-wrap items-baseline gap-x-[1.5vw] leading-none">
              <span className="text-[clamp(5rem,16vw,20rem)] font-bold" style={{ color: SERVED }}>{num(d.served)}</span>
              {d.limited && <span className="text-[clamp(2rem,5vw,6rem)] text-gray-400">/ {num(d.target)}</span>}
            </p>
            {/* The day's total = Settings → Mahaprasad daily cap; with no cap there's nothing to measure against */}
            {d.limited && (
              <>
                <div className="space-y-[1.4vh]">
                  <Bar value={d.served} total={d.target} color={SERVED} />
                  <Bar value={d.sold.persons} total={d.target} color={SOLD} />
                </div>
                <p className="text-[clamp(1rem,1.6vw,1.8rem)] text-gray-400">
                  {pct(d.served, d.target)}% {t('served')} · {pct(d.sold.persons, d.target)}% {t('sold')}
                </p>
              </>
            )}
          </main>

          <footer className="flex flex-col gap-[2vw] sm:flex-row">
            <Figure label={t('Sold')} value={num(d.sold.persons)} color={SOLD}
              note={d.sold.online ? `${num(d.sold.online)} ${t('online')}` : null} />
            <Figure label={t('Still to serve')} value={num(d.toServe)} />
            {d.limited && (d.over > 0
              ? <Figure label={t('Over the day’s total')} value={`+${num(d.over)}`} />
              : <Figure label={t('Left of the total')} value={num(d.left)} />)}
          </footer>
        </>
      )}

      {q.isError && d && (
        <p className="flex items-center gap-2 text-[clamp(0.9rem,1.2vw,1.3rem)] text-amber-300">
          <WifiOff className="h-4 w-4" /> {t('Not updating — check the internet. Showing figures from {time}.', { time: clockText(new Date(d.at)) })}
        </p>
      )}

      {/* Notices for devotees (Notice Board in the app) */}
      <NoticeTicker textClass="text-[clamp(1.1rem,2vw,2.2rem)]" />
    </div>
  );
}

// The Mahaprasad TV keeps its own language (Hindi too): switching it leaves the app's language alone,
// also when the TV runs in the same browser as the app
export default function MahaprasadScreen() {
  return <LanguageProvider storageKey="mgm-lang-mahaprasad-screen" languages={DEVOTEE_LANGUAGES}><MahaprasadBoard /></LanguageProvider>;
}
