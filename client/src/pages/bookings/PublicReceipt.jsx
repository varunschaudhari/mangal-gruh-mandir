import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, Printer, SearchX } from 'lucide-react';
import { getPublicReceipt } from '../../api/booking.api.js';
import { bookingReceiptHtml } from '../../utils/bookingReceipt.js';
import { printHtml } from '../../utils/printHtml.js';
import { withLogo } from '../../utils/printTemplate.js';
import { temple as cachedTemple } from '../../utils/temple.js';
import { publicUrl } from '../../utils/platform.js';
import Spinner from '../../components/ui/Spinner.jsx';
import { fmtDateTime } from '../../components/booking/registerUtils.js';
import { DEVOTEE_LANGUAGE_KEY, DEVOTEE_LANGUAGES, LanguageProvider, LanguageSwitch, hasSavedLanguage, useLanguage, useT } from '../../i18n/index.jsx';

// The public receipt (/r/:token) opened from the WhatsApp / SMS link or the QR on the slip.
// No sign-in. The receipt itself is the same HTML as the A4 print, shown in a frame — in Hindi
// when the page is (it opens in the booking's language until the devotee picks one).


const toBooking = (r, token) => ({
  ...r,
  receiptUrl: publicUrl(`/r/${token}`), // the QR on a printed / saved copy leads back here
});
const toSettings = (r) => ({
  templeName: r.temple?.name,
  temple: r.temple,
  receiptFooter: r.footer,
});

function Shell({ children, temple }) {
  const t = useT();
  const info = temple || cachedTemple();
  return (
    <div className="min-h-dvh bg-orange-50/60">
      <header className="bg-primary-600 pt-safe text-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain p-1" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{info.nameMr || info.name}</p>
            <p className="truncate text-xs text-orange-100">{t('Abhishek / puja receipt')}</p>
          </div>
          <LanguageSwitch className="shrink-0 border-white/30 text-xs" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 py-4 pb-[calc(1.5rem+var(--safe-bottom))] sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}

function ReceiptPage() {
  const { token } = useParams();
  const t = useT();
  const { lang, setLang } = useLanguage();
  const adopted = useRef(false);
  const frameRef = useRef(null);
  const [html, setHtml] = useState(null); // { view, print }
  const [height, setHeight] = useState(640);

  const q = useQuery({
    queryKey: ['public-receipt', token],
    queryFn: () => getPublicReceipt(token).then((r) => r.data.data),
    retry: (n, err) => err?.response?.status !== 404 && n < 2,
    staleTime: 60_000,
  });
  const r = q.data;

  // First visit: the language the booking was made in (Hindi for a Hindi-speaking devotee)
  useEffect(() => {
    if (!r || adopted.current) return;
    adopted.current = true;
    if (!hasSavedLanguage() && DEVOTEE_LANGUAGES.includes(r.language) && r.language !== lang) setLang(r.language);
  }, [r, lang, setLang]);

  useEffect(() => {
    if (!r) return undefined;
    let alive = true;
    const b = toBooking(r, token);
    const s = toSettings(r);
    Promise.all([bookingReceiptHtml(b, s, { autoPrint: false, lang }), bookingReceiptHtml(b, s, { autoPrint: true, lang })])
      .then((pages) => Promise.all(pages.map(withLogo)))
      .then(([view, print]) => { if (alive) setHtml({ view, print }); })
      .catch(() => { if (alive) setHtml({ view: '', print: '' }); });
    document.title = `${t('Receipt')} ${r.receiptNo}`;
    return () => { alive = false; };
  }, [r, token, t, lang]);

  // Fit the frame to the receipt so the page scrolls as one (no scroll inside a scroll).
  const fit = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(Math.max(320, doc.documentElement.scrollHeight));
  }, []);
  const onFrameLoad = () => {
    fit();
    const doc = frameRef.current?.contentDocument;
    doc?.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', fit, { once: true }); });
  };
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  if (q.isLoading) {
    return <Shell><div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div></Shell>;
  }

  if (q.isError) {
    const notFound = q.error?.response?.status === 404;
    return (
      <Shell>
        <div className="mx-auto mt-6 max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          {notFound ? <SearchX className="mx-auto h-10 w-10 text-primary-400" /> : <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />}
          <h1 className="mt-3 text-lg font-bold text-gray-900">{notFound ? t('Receipt not found') : t('Could not load the receipt')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {notFound
              ? t('This link may be incomplete. Please open the full link from your message, or ask at the temple office with your receipt number.')
              : t('Check your internet connection and try again.')}
          </p>
          {!notFound && <button type="button" onClick={() => q.refetch()} className="btn-primary mt-4">{t('Try again')}</button>}
        </div>
      </Shell>
    );
  }

  const voided = r?.status === 'voided';

  return (
    <Shell temple={r?.temple}>
      {voided && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <Ban className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">{t('This booking was cancelled (voided)')}</p>
            <p className="text-sm">{t('This receipt is no longer valid. Please contact the temple office.')}</p>
          </div>
        </div>
      )}

      {!voided && r.checkedInAt && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {t('Checked in at the hall')} · {fmtDateTime(r.checkedInAt)}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{t('Receipt no.')}</p>
          <p className="font-mono text-sm font-bold text-gray-900">{r.receiptNo}</p>
        </div>
        <button type="button" onClick={() => html?.print && printHtml(html.print, { filename: `Receipt-${r.receiptNo.replace(/\//g, '-')}.pdf` })}
          disabled={!html?.print}
          className="btn-primary min-h-[44px] px-5">
          <Printer className="h-4 w-4" /> {t('Print / Save PDF')}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {html?.view ? (
          <iframe
            ref={frameRef}
            title={`${t('Receipt')} ${r.receiptNo}`}
            srcDoc={html.view}
            sandbox="allow-same-origin"
            onLoad={onFrameLoad}
            style={{ height }}
            className="block w-full border-0"
          />
        ) : (
          <div className="flex h-64 items-center justify-center"><Spinner /></div>
        )}
      </div>

      {r.temple?.phone && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {t('Questions? Call the temple office:')}{' '}
          <a href={`tel:${r.temple.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-700">{r.temple.phone}</a>
        </p>
      )}
    </Shell>
  );
}

// A devotee's page: English, Marathi or Hindi — at first the phone's language — kept apart from the
// staff app's language (the same choice on all the devotee pages)
export default function PublicReceipt() {
  return <LanguageProvider storageKey={DEVOTEE_LANGUAGE_KEY} languages={DEVOTEE_LANGUAGES} fromBrowser><ReceiptPage /></LanguageProvider>;
}
