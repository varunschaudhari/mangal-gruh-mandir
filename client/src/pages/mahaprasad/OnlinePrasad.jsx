import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Minus, Plus, RotateCcw, ShieldCheck, Undo2, Users } from 'lucide-react';
import { createOnlineOrder, getOnlineInfo, getOnlineOrder, verifyOnlineOrder } from '../../api/mahaprasadOnline.api.js';
import Spinner from '../../components/ui/Spinner.jsx';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { Shell } from './PublicCoupons.jsx';

// The public page where devotees buy Mahaprasad coupons (/prasad). No sign-in: pick the day, the
// plates and a mobile number → Razorpay Checkout → the coupon page (/m/<token>) with the QR, which
// is also sent to the mobile on WhatsApp / SMS. The order's token stays in the address (?order=…),
// so a reload or a closed tab comes back to it. Days on sale, prices and plates left are the
// server's (services/mahaprasadOnline.service.js); this page only shows them.

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js';
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const SHORT_PROBLEM = { closed_today: 'Closed', no_price: 'Not sold', full: 'Full|day', too_far: 'Not yet', past: 'Over' };

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_JS;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay did not load')));
    s.onerror = () => { s.remove(); reject(new Error('Razorpay did not load')); };
    document.body.appendChild(s);
  });
}

const dayDate = (date, lang) => new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { day: 'numeric', month: 'short' });
const weekday = (date, lang) => new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'short' });
const longDate = (date, lang) => new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

function Card({ children, className = '' }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

function PolicyLinks() {
  const t = useT();
  const links = [['/about', 'About & contact'], ['/pricing', 'Pricing'], ['/terms', 'Terms'], ['/refund', 'Refund policy'], ['/privacy', 'Privacy']];
  return (
    <footer className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
      {links.map(([href, label]) => <a key={href} href={href} className="underline-offset-2 hover:underline">{t(label)}</a>)}
    </footer>
  );
}

export default function OnlinePrasad() {
  const t = useT();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const orderToken = params.get('order');

  const info = useQuery({
    queryKey: ['prasad-online'],
    queryFn: () => getOnlineInfo().then((r) => r.data.data),
    refetchInterval: 60_000,   // plates left
  });
  const d = info.data;

  const [day, setDay] = useState(null);
  const [plates, setPlates] = useState(1);
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { document.title = t('Buy Mahaprasad coupon'); }, [t]);

  // First day on sale, picked once the days arrive (and again if the picked one closes)
  const days = useMemo(() => d?.days || [], [d]);
  const chosen = days.find((x) => x.date === day);
  useEffect(() => {
    if (!days.length || (chosen && !chosen.problem)) return;
    const first = days.find((x) => !x.problem);
    if (first) setDay(first.date);
  }, [days, chosen]);

  const maxPlates = Math.max(1, Math.min(d?.maxPlates || 10, chosen?.left ?? Infinity));
  useEffect(() => { if (plates > maxPlates) setPlates(maxPlates); }, [plates, maxPlates]);
  const total = (chosen?.price || 0) * plates;

  // ── An order in the address: follow it until it's paid (then to the coupon page) ──
  const order = useQuery({
    queryKey: ['prasad-order', orderToken],
    enabled: Boolean(orderToken),
    queryFn: () => getOnlineOrder(orderToken, true).then((r) => r.data.data),
    retry: (n, err) => err?.response?.status !== 404 && n < 3,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'pending' || s === 'issuing') return confirming ? 3_000 : 8_000;
      if (s === 'expired') return 20_000;   // a payment that still arrives issues (or is refunded)
      return false;
    },
  });
  const o = order.data;
  useEffect(() => {
    if (o?.status === 'paid' && o.couponPath) navigate(o.couponPath, { replace: true });
  }, [o, navigate]);

  const errText = (err) => {
    const why = err?.response?.data?.errors?.[0];
    if (why?.code === 'full') return why.left > 0 ? t('Only {n} left for this day', { n: why.left }) : t('All coupons for this day are sold');
    const msg = err?.response?.data?.message;
    if (msg) return t(msg);
    if (err?.message === 'Razorpay did not load') return t('The payment window could not open. Check your internet connection and try again.');
    return t('Something went wrong — please try again');
  };

  const confirm = async (token, answer) => {
    setConfirming(true);
    setNotice('');
    try {
      const { data } = await verifyOnlineOrder(token, answer);
      if (data.data.status === 'paid' && data.data.couponPath) { navigate(data.data.couponPath, { replace: true }); return; }
    } catch { /* the page keeps asking the server; it finishes the payment by itself */ }
    qc.invalidateQueries({ queryKey: ['prasad-order', token] });
  };

  const openCheckout = async (token, options) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const Razorpay = await loadCheckout();
      const rzp = new Razorpay({
        ...options,
        theme: { color: '#ea580c' },
        handler: (answer) => { setBusy(false); confirm(token, answer); },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setBusy(false);
            setNotice(t('The payment was not finished. You can pay again below.'));
            qc.invalidateQueries({ queryKey: ['prasad-order', token] });
          },
        },
      });
      rzp.open();
    } catch (err) {
      setBusy(false);
      setError(errText(err));
    }
  };

  const startOrder = async () => {
    setError('');
    setNotice('');
    if (!chosen || chosen.problem) { setError(t('Choose a date')); return; }
    if (!/^[6-9]\d{9}$/.test(mobile)) { setError(t('Enter your 10-digit mobile number')); return; }
    setBusy(true);
    try {
      await loadCheckout();   // first, so a blocked payment window fails before plates are held
      const { data } = await createOnlineOrder({ date: chosen.date, plates, mobile, name: name.trim() || undefined });
      const { order: created, checkout } = data.data;
      qc.setQueryData(['prasad-order', created.token], { ...created, checkout });
      setParams({ order: created.token }, { replace: true });
      await openCheckout(created.token, checkout);
    } catch (err) {
      setBusy(false);
      setError(errText(err));
      qc.invalidateQueries({ queryKey: ['prasad-online'] });
    }
  };

  const startAgain = () => {
    setError('');
    setNotice('');
    setConfirming(false);
    setParams({}, { replace: true });
    qc.invalidateQueries({ queryKey: ['prasad-online'] });
  };

  const header = useMemo(() => (d?.mode === 'test' ? (
    <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
      {t('Test mode — no real money is taken')}
    </p>
  ) : null), [d?.mode, t]);

  // ── Following an order ──
  if (orderToken) {
    if (order.isLoading) return <Shell temple={d?.temple} subtitle="Buy Mahaprasad coupon"><div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div></Shell>;
    if (order.isError || !o) {
      return (
        <Shell temple={d?.temple} subtitle="Buy Mahaprasad coupon">
          <Card className="mt-4 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
            <p className="mt-2 font-semibold text-gray-900">{order.error?.response?.status === 404 ? t('Order not found') : t('Could not load your order')}</p>
            <button type="button" onClick={startAgain} className="btn-primary mt-4">{t('Start again')}</button>
          </Card>
          <PolicyLinks />
        </Shell>
      );
    }
    const summary = (
      <p className="text-sm text-gray-600">
        {t(o.plates === 1 ? '{n} plate · {date}' : '{n} plates · {date}', { n: o.plates, date: longDate(o.date, lang) })} · <span className="font-semibold text-gray-900">{rupees(o.amount)}</span>
      </p>
    );
    return (
      <Shell temple={d?.temple} subtitle="Buy Mahaprasad coupon">
        {header}
        {(o.status === 'issuing' || ((o.status === 'pending') && confirming)) && (
          <Card className="text-center">
            <Spinner size="lg" />
            <p className="mt-3 font-semibold text-gray-900">{t('Confirming your payment…')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('Please keep this page open. Your coupon will appear here and on WhatsApp / SMS.')}</p>
          </Card>
        )}
        {o.status === 'pending' && !confirming && (
          <Card>
            <p className="font-semibold text-gray-900">{t('Waiting for your payment')}</p>
            {summary}
            {notice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {o.checkout ? (
              <button type="button" disabled={busy} onClick={() => openCheckout(o.token, o.checkout)} className="btn-primary mt-4 w-full py-3 text-base disabled:opacity-60">
                {busy ? t('Opening…') : t('Pay {amount}', { amount: rupees(o.amount) })}
              </button>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Clock className="h-4 w-4" /> {t('Checking whether your payment went through…')}</p>
            )}
            <button type="button" onClick={startAgain} className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-gray-500">
              <RotateCcw className="h-4 w-4" /> {t('Change the order')}
            </button>
          </Card>
        )}
        {o.status === 'expired' && (
          <Card>
            <p className="flex items-center gap-2 font-semibold text-gray-900"><Clock className="h-5 w-5 text-amber-500" /> {t('Time ran out')}</p>
            {summary}
            <p className="mt-2 text-sm text-gray-600">{t('The payment was not finished in time, so the plates were let go. If money was taken from your account, your coupon will come by itself or the money will be returned.')}</p>
            <button type="button" onClick={startAgain} className="btn-primary mt-4 w-full py-3">{t('Start again')}</button>
          </Card>
        )}
        {o.status === 'refunded' && (
          <Card>
            <p className="flex items-center gap-2 font-semibold text-gray-900"><Undo2 className="h-5 w-5 text-primary-600" /> {t('Your payment is being refunded')}</p>
            {summary}
            {o.refundReason && <p className="mt-2 text-sm text-gray-600">{t(o.refundReason)}</p>}
            <p className="mt-2 text-sm text-gray-600">{t('The full amount goes back to the account you paid from, usually within 5–7 working days.')}</p>
            <button type="button" onClick={startAgain} className="btn-primary mt-4 w-full py-3">{t('Choose another day')}</button>
          </Card>
        )}
        {o.status === 'failed' && (
          <Card>
            <p className="font-semibold text-gray-900">{t('Online payment is not available right now — please try again in a few minutes')}</p>
            <button type="button" onClick={startAgain} className="btn-primary mt-4 w-full py-3">{t('Start again')}</button>
          </Card>
        )}
        <PolicyLinks />
      </Shell>
    );
  }

  // ── The form ──
  if (info.isLoading) return <Shell subtitle="Buy Mahaprasad coupon"><div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div></Shell>;
  if (info.isError) {
    return (
      <Shell subtitle="Buy Mahaprasad coupon">
        <Card className="mt-4 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-2 font-semibold text-gray-900">{t('Could not load the page')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('Check your internet connection and try again.')}</p>
          <button type="button" onClick={() => info.refetch()} className="btn-primary mt-4">{t('Try again')}</button>
        </Card>
        <PolicyLinks />
      </Shell>
    );
  }
  if (!d.enabled || !days.some((x) => !x.problem)) {
    return (
      <Shell temple={d.temple} subtitle="Buy Mahaprasad coupon">
        <Card className="mt-4 text-center">
          <p className="font-semibold text-gray-900">{d.enabled ? t('No Mahaprasad coupons are on sale online right now.') : t('Online Mahaprasad coupons are not available right now — please buy at the temple counter')}</p>
          {d.temple?.phone && (
            <p className="mt-2 text-sm text-gray-500">
              {t('Questions? Call the temple office:')}{' '}
              <a href={`tel:${d.temple.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-700">{d.temple.phone}</a>
            </p>
          )}
        </Card>
        <PolicyLinks />
      </Shell>
    );
  }

  return (
    <Shell temple={d.temple} subtitle="Buy Mahaprasad coupon">
      {header}
      <Card>
        <h1 className="text-lg font-bold text-gray-900">{t('Buy Mahaprasad coupons online')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('Pay online and get your coupon QR on WhatsApp / SMS. Show it at the Mahaprasad hall.')}</p>
      </Card>

      <Card className="mt-3">
        <p className="mb-2 text-sm font-semibold text-gray-800">{t('1. Choose the day')}</p>
        <div className="grid grid-cols-4 gap-2">
          {days.map((x, i) => {
            const active = x.date === day;
            const off = Boolean(x.problem);
            return (
              <button key={x.date} type="button" disabled={off} onClick={() => setDay(x.date)}
                aria-pressed={active}
                className={`rounded-xl border-2 px-1 py-2 text-center transition-colors ${active ? 'border-primary-500 bg-primary-50' : off ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white hover:border-primary-300'}`}>
                <span className="block text-[11px] font-semibold uppercase text-gray-500">{i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : weekday(x.date, lang)}</span>
                <span className="block text-sm font-bold text-gray-900">{dayDate(x.date, lang)}</span>
                <span className={`block text-xs ${off ? 'text-gray-400' : 'text-primary-700 font-semibold'}`}>{off ? t(SHORT_PROBLEM[x.problem] || 'Closed') : rupees(x.price)}</span>
              </button>
            );
          })}
        </div>
        {days[0]?.problem === 'closed_today' && <p className="mt-2 text-xs text-gray-500">{t(days[0].problemText)}</p>}
      </Card>

      <Card className="mt-3">
        <p className="mb-2 text-sm font-semibold text-gray-800">{t('2. Number of plates')}</p>
        <div className="flex items-center gap-4">
          <button type="button" aria-label={t('Fewer plates')} disabled={plates <= 1} onClick={() => setPlates((n) => Math.max(1, n - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-200 text-gray-700 disabled:opacity-40">
            <Minus className="h-5 w-5" />
          </button>
          <span className="w-10 text-center text-3xl font-black tabular-nums text-gray-900">{plates}</span>
          <button type="button" aria-label={t('More plates')} disabled={plates >= maxPlates} onClick={() => setPlates((n) => Math.min(maxPlates, n + 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-200 text-gray-700 disabled:opacity-40">
            <Plus className="h-5 w-5" />
          </button>
          <span className="text-sm text-gray-500">{t('{price} per plate', { price: rupees(chosen?.price) })}</span>
        </div>
        {chosen?.left != null && chosen.left <= 20 && (
          <p className="mt-2 text-xs font-semibold text-amber-700">{t('Only {n} left for this day', { n: chosen.left })}</p>
        )}
        {plates > 1 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('One QR for all {n} persons — please come to the hall together.', { n: plates })}
          </p>
        )}
      </Card>

      <Card className="mt-3">
        <label htmlFor="prasad-mobile" className="mb-2 block text-sm font-semibold text-gray-800">{t('3. Your mobile number')}</label>
        <div className="flex items-center rounded-xl border border-gray-300 bg-white focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100">
          <span className="pl-3 pr-1 text-gray-500">+91</span>
          <input id="prasad-mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10}
            value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-full rounded-r-xl border-0 bg-transparent px-2 py-3 text-lg tracking-wide outline-none" placeholder="98XXXXXXXX" />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">{t('Your coupon QR is sent to this number on WhatsApp / SMS.')}</p>
        <label htmlFor="prasad-name" className="mb-1 mt-3 block text-sm font-medium text-gray-700">{t('Name (optional)')}</label>
        <input id="prasad-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name"
          className="input w-full" placeholder={t('For the receipt')} />
      </Card>

      <div className="sticky bottom-0 -mx-4 mt-3 border-t border-orange-100 bg-orange-50/95 px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 backdrop-blur">
        {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy || !chosen || Boolean(chosen.problem)} onClick={startOrder}
          className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base disabled:opacity-60">
          {busy ? <Spinner size="sm" /> : <ShieldCheck className="h-5 w-5" />}
          {busy ? t('Opening…') : t('Pay {amount}', { amount: rupees(total) })}
        </button>
        <p className="mt-2 text-center text-[11px] leading-snug text-gray-500">
          {t('Coupons are for the chosen day and are not refunded. By paying you agree to the')}{' '}
          <a href="/terms" className="underline">{t('terms')}</a> · <a href="/refund" className="underline">{t('refund policy')}</a>
        </p>
      </div>
      <PolicyLinks />
    </Shell>
  );
}
