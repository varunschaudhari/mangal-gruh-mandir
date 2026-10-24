import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode/lib/browser.js';
import { AlertTriangle, Ban, CheckCircle2, Clock, FileText, SearchX } from 'lucide-react';
import { getPublicCoupons } from '../../api/mahaprasad.api.js';
import { onlineReceiptUrl } from '../../api/mahaprasadOnline.api.js';
import Spinner from '../../components/ui/Spinner.jsx';
import PersonsCount from './PersonsCount.jsx';
import { temple as cachedTemple } from '../../utils/temple.js';
import {
  DEVOTEE_LANGUAGE_KEY, DEVOTEE_LANGUAGES, LanguageProvider, LanguageSwitch, hasSavedLanguage, phoneLanguage, useLanguage, useT,
} from '../../i18n/index.jsx';

// The devotee's Mahaprasad coupons (/m/:token), opened from the WhatsApp / SMS link. No sign-in.
// One QR per coupon — a group coupon is one QR for everyone — holding the coupon number, the same
// as the paper coupon, so the food counter scans it off the phone. Each coupon is still served
// once. The page refreshes itself, so a coupon shows as served right after the scan.

/** 'valid' | 'served' | 'cancelled' | 'expired' — the expiry rule is the server's (redeemCoupon). */
export function couponState(c, validityDays, now = new Date()) {
  if (c.status === 'redeemed') return 'served';
  if (c.status === 'voided') return 'cancelled';
  if (validityDays > 0) {
    const day = new Date(c.date); day.setHours(0, 0, 0, 0);
    const expires = new Date(day); expires.setDate(expires.getDate() + validityDays);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    if (today >= expires) return 'expired';
  }
  return 'valid';
}

const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeText = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The public pages' frame: the temple's name and logo on top, the language switch (also used by /prasad) */
export function Shell({ children, temple, subtitle = 'Shri Mangal Mahaprasad coupon' }) {
  const t = useT();
  const info = temple || cachedTemple();
  return (
    <div className="min-h-dvh bg-orange-50/60">
      <header className="bg-primary-600 pt-safe text-white shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain p-1" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{info.nameMr || info.name}</p>
            <p className="text-xs leading-snug text-orange-100">{t(subtitle)}</p>
          </div>
          <LanguageSwitch className="shrink-0 border-white/30 text-xs" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-4 pb-[calc(1.5rem+var(--safe-bottom))]">{children}</main>
    </div>
  );
}

function Qr({ text, dim }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 560 })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [text]);
  return (
    <div className={`mx-auto flex h-60 w-60 items-center justify-center ${dim ? 'opacity-15 grayscale' : ''}`}>
      {src ? <img src={src} alt={text} className="h-full w-full [image-rendering:pixelated]" /> : <Spinner />}
    </div>
  );
}

function CouponCard({ c, validityDays }) {
  const t = useT();
  const state = couponState(c, validityDays);
  const persons = c.groupSize || 1;
  const banner = {
    served:    { cls: 'bg-green-50 text-green-800 border-green-200', Icon: CheckCircle2, text: c.redeemedAt ? t('Served · {time}', { time: timeText(c.redeemedAt) }) : t('Served') },
    cancelled: { cls: 'bg-red-50 text-red-800 border-red-200',       Icon: Ban,          text: t('Cancelled — not valid') },
    expired:   { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock,        text: t('Expired') },
  }[state];
  return (
    <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.type === 'free' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {c.type === 'free' ? (c.occasion || t('Free Seva')) : t('Paid|coupon')}
        </span>
        {persons > 1 && (
          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-700">{t('Group coupon')}</span>
        )}
      </div>
      <PersonsCount n={persons} className={`mt-3 ${state !== 'valid' ? 'opacity-40' : ''}`} />
      <div className="relative mt-2">
        <Qr text={c.couponNumber} dim={state !== 'valid'} />
        {banner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold shadow-sm ${banner.cls}`}>
              <banner.Icon className="h-4 w-4 shrink-0" /> {banner.text}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 font-mono text-xl font-black tracking-wide text-gray-900">{c.couponNumber}</p>
      <p className="text-sm text-gray-500">{dateText(c.date)}</p>
    </section>
  );
}

function CouponsPage() {
  const { token } = useParams();
  const t = useT();

  const q = useQuery({
    queryKey: ['public-coupons', token],
    queryFn: () => getPublicCoupons(token).then((r) => r.data.data),
    retry: (n, err) => err?.response?.status !== 404 && n < 2,
    // Keep it current while a coupon can still be served, so it turns to "Served" after the scan
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.coupons?.some((c) => couponState(c, d.validityDays) === 'valid') ? 20_000 : false;
    },
  });
  const d = q.data;

  // First visit: the coupon language the temple chose (Settings → Mahaprasad) — unless the devotee
  // picked one, or their phone is in Marathi / Hindi
  const { lang, setLang } = useLanguage();
  const adopted = useRef(false);
  useEffect(() => {
    if (!d || adopted.current) return;
    adopted.current = true;
    if (!hasSavedLanguage() && !phoneLanguage(['mr', 'hi']) && DEVOTEE_LANGUAGES.includes(d.language) && d.language !== lang) setLang(d.language);
  }, [d, lang, setLang]);

  useEffect(() => { document.title = t('Shri Mangal Mahaprasad coupon'); }, [t]);

  if (q.isLoading) {
    return <Shell><div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div></Shell>;
  }

  if (q.isError) {
    const notFound = q.error?.response?.status === 404;
    return (
      <Shell>
        <div className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm">
          {notFound ? <SearchX className="mx-auto h-10 w-10 text-primary-400" /> : <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />}
          <h1 className="mt-3 text-lg font-bold text-gray-900">{notFound ? t('Coupon not found') : t('Could not load the coupon')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {notFound
              ? t('This link may be incomplete. Please open the full link from your message, or ask at the Shri Mangal Mahaprasad counter.')
              : t('Check your internet connection and try again.')}
          </p>
          {!notFound && <button type="button" onClick={() => q.refetch()} className="btn-primary mt-4">{t('Try again')}</button>}
        </div>
      </Shell>
    );
  }

  const anyValid = d.coupons.some((c) => couponState(c, d.validityDays) === 'valid');

  return (
    <Shell temple={d.temple}>
      {/* Bought online while Razorpay had test keys: the hall refuses it */}
      {d.test && (
        <p className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2.5 text-center text-sm font-bold text-red-800">
          {t('TEST coupon — no real payment. Not valid at the Shri Mangal Mahaprasad hall.')}
        </p>
      )}
      {anyValid && !d.test && (
        <p className="mb-3 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-center text-sm text-gray-700">
          {t('Show this QR at the Shri Mangal Mahaprasad hall. Each coupon can be used once.')}
          <span className="mt-0.5 block text-xs text-gray-500">{t('If the scanner can’t read it, turn up the screen brightness.')}</span>
        </p>
      )}
      <div className="space-y-4">
        {d.coupons.map((c) => <CouponCard key={c.couponNumber} c={c} validityDays={d.validityDays} />)}
      </div>
      {d.online && (
        <a href={onlineReceiptUrl(token)} target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-semibold text-primary-700 shadow-sm">
          <FileText className="h-4 w-4" /> {t('Payment receipt (PDF)')}
        </a>
      )}
      {d.temple?.phone && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {t('Questions? Call the temple office:')}{' '}
          <a href={`tel:${d.temple.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-700">{d.temple.phone}</a>
        </p>
      )}
    </Shell>
  );
}

// A devotee's page: English, Marathi or Hindi — at first the phone's language — kept apart from the
// staff app's language (the same choice on all the devotee pages)
export default function PublicCoupons() {
  return <LanguageProvider storageKey={DEVOTEE_LANGUAGE_KEY} languages={DEVOTEE_LANGUAGES} fromBrowser><CouponsPage /></LanguageProvider>;
}
