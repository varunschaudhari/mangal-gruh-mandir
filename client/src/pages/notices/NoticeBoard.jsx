import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode/lib/browser.js';
import toast from 'react-hot-toast';
import { Copy, Download, Eye, EyeOff, Megaphone, Pencil, Plus, QrCode, Trash2, Tv, Users, Smartphone } from 'lucide-react';
import { createNotice, deleteNotice, getAllNotices, getStaffNotices, updateNotice } from '../../api/notice.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { ConfirmModal } from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { publicUrl } from '../../utils/platform.js';
import { fDateTime } from '../../utils/formatters.js';
import { isNew, lastSeen, markSeen, noticeFor } from '../../utils/noticeText.js';

// Notice Board (/notice-board). Everyone signed in reads the notices for staff here (and gets a
// phone notification when one goes up). Those with notices:manage post, edit, hide and delete
// notices — for devotees (public page /notices and the TV screens), staff, or both — typed in
// Marathi, Hindi and/or English. Server: controllers/notice.controller.js.

const LANGS = [{ code: 'mr', label: 'मराठी' }, { code: 'hi', label: 'हिंदी' }, { code: 'en', label: 'English' }];
const AUDIENCES = [
  { value: 'both', label: 'Devotees and staff' },
  { value: 'devotees', label: 'Devotees only' },
  { value: 'staff', label: 'Staff only' },
];
const AUDIENCE_BADGE = { both: ['purple', 'Devotees and staff'], devotees: ['orange', 'Devotees'], staff: ['blue', 'Staff'] };
const EMPTY = { title: { mr: '', hi: '', en: '' }, body: { mr: '', hi: '', en: '' }, audience: 'both', isActive: true };

const filled = (field) => LANGS.some((l) => field?.[l.code]?.trim());

function NoticeEditor({ notice, onClose }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => (notice
    ? { title: { ...EMPTY.title, ...notice.title }, body: { ...EMPTY.body, ...notice.body }, audience: notice.audience, isActive: notice.isActive }
    : EMPTY));
  const [tab, setTab] = useState(() => LANGS.find((l) => notice?.title?.[l.code]?.trim())?.code || 'mr');
  const setText = (field, value) => setForm((f) => ({ ...f, [field]: { ...f[field], [tab]: value } }));

  const save = useMutation({
    mutationFn: () => (notice ? updateNotice(notice._id, form) : createNotice(form)),
    onSuccess: () => {
      toast.success(notice ? t('Notice saved') : t('Notice posted'));
      qc.invalidateQueries({ queryKey: ['notices'] });
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Could not save the notice')),
  });

  const forStaff = form.audience !== 'devotees';
  const forDevotees = form.audience !== 'staff';
  const willNotify = forStaff && form.isActive && !notice?.notifiedAt;

  return (
    <Sheet open onClose={onClose} title={notice ? t('Edit notice') : t('New notice')} size="lg"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !filled(form.title)} className="btn-primary">
            {save.isPending ? t('Saving…') : notice ? t('Save') : t('Post notice')}
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-gray-700">{t('Who is it for?')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <label key={a.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm
                ${form.audience === a.value ? 'border-primary-500 bg-primary-50 font-semibold text-primary-800' : 'border-gray-200 text-gray-700'}`}>
                <input type="radio" name="audience" value={a.value} checked={form.audience === a.value}
                  onChange={() => setForm((f) => ({ ...f, audience: a.value }))} className="h-4 w-4" />
                {t(a.label)}
              </label>
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-gray-500">
            {forDevotees && <li className="flex items-center gap-1.5"><Tv className="h-3.5 w-3.5 shrink-0" />{t('Devotees see it on the notice page and along the bottom of the TV screens.')}</li>}
            {forStaff && <li className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0" />{t('Staff see it on the Notice Board in the app.')}</li>}
          </ul>
        </fieldset>

        <div>
          {/* One title and text per language — readers get theirs, else another one that is filled in */}
          <div role="tablist" className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {LANGS.map((l) => (
              <button key={l.code} type="button" role="tab" aria-selected={tab === l.code} onClick={() => setTab(l.code)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === l.code ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
                {l.label}
                {(form.title[l.code]?.trim() || form.body[l.code]?.trim()) && <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-label={t('Filled in')} />}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="notice-title" className="mb-1 block text-sm font-medium text-gray-700">{t('Title')}</label>
              <input id="notice-title" value={form.title[tab]} onChange={(e) => setText('title', e.target.value)} maxLength={150}
                lang={tab} className="input" placeholder={t('e.g. Temple closed on Sunday for the eclipse')} />
            </div>
            <div>
              <label htmlFor="notice-body" className="mb-1 block text-sm font-medium text-gray-700">{t('Notice')}</label>
              <textarea id="notice-body" value={form.body[tab]} onChange={(e) => setText('body', e.target.value)} maxLength={2000}
                lang={tab} rows={6} className="input" placeholder={t('Details (optional)')} />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">{t('Write it in one language or more. Each reader sees their language, or another one that is filled in.')}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded" />
          <span>
            <span className="font-medium text-gray-800">{t('Showing')}</span>
            <span className="block text-xs text-gray-500">{t('Untick to hide it without deleting it.')}</span>
          </span>
        </label>

        {willNotify && (
          <p className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <Smartphone className="h-4 w-4 shrink-0" />{t('Staff get a phone notification when you save it.')}
          </p>
        )}
      </div>
    </Sheet>
  );
}

// The devotees' page: its link and a QR to print and put up at the temple
function DevoteeLink() {
  const t = useT();
  const url = publicUrl('/notices');
  const [qr, setQr] = useState(null);
  const showQr = async () => {
    try { setQr(await QRCode.toDataURL(url, { width: 640, margin: 2 })); } catch { toast.error(t('Failed')); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(t('Copied!')); } catch { toast.error(t('Failed')); }
  };
  return (
    <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{t('Notice page for devotees')}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-sm text-primary-700">{url}</a>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={copy} className="btn-secondary flex items-center gap-1.5 text-sm"><Copy className="h-4 w-4" />{t('Copy link')}</button>
        <button type="button" onClick={showQr} className="btn-secondary flex items-center gap-1.5 text-sm"><QrCode className="h-4 w-4" />{t('QR code')}</button>
      </div>
      <Sheet open={Boolean(qr)} onClose={() => setQr(null)} title={t('Notice page for devotees')} size="sm">
        <div className="text-center">
          {qr && <img src={qr} alt={url} className="mx-auto w-64 max-w-full" />}
          <p className="mt-2 text-sm text-gray-600">{t('Print it and put it up at the temple: devotees scan it to see the notices.')}</p>
          <a href={qr || undefined} download="notice-board-qr.png" className="btn-primary mt-4 inline-flex items-center gap-1.5">
            <Download className="h-4 w-4" />{t('Download')}
          </a>
        </div>
      </Sheet>
    </section>
  );
}

export default function NoticeBoard() {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const manage = can('notices:manage');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);     // notice | 'new' | null
  const [removing, setRemoving] = useState(null);
  // "New" = posted since this device last opened the board; seen from now on
  const [seenBefore] = useState(lastSeen);
  useEffect(() => { markSeen(); }, []);

  const q = useQuery({
    queryKey: ['notices', manage ? 'all' : 'staff'],
    queryFn: () => (manage ? getAllNotices() : getStaffNotices()).then((r) => r.data.data),
    refetchInterval: 5 * 60_000,
  });
  const done = (msg) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['notices'] }); };
  const fail = (err) => toast.error(err.response?.data?.message || t('Failed'));
  const toggle = useMutation({
    mutationFn: (n) => updateNotice(n._id, { isActive: !n.isActive }),
    onSuccess: (r) => done(r.data.data.isActive ? t('Notice is showing') : t('Notice hidden')),
    onError: fail,
  });
  const del = useMutation({
    mutationFn: () => deleteNotice(removing._id),
    onSuccess: () => { setRemoving(null); done(t('Notice deleted')); },
    onError: fail,
  });

  if (q.isLoading) return <PageLoader />;
  const notices = q.data || [];

  return (
    <div className="space-y-4">
      <PageHeader title="Notice Board"
        subtitle={manage ? 'Notices for devotees and staff' : 'Notices from the temple office'}
        actions={manage && (
          <button type="button" onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" />{t('New notice')}
          </button>
        )} />

      {manage && <DevoteeLink />}

      {notices.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <Megaphone className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          {manage ? t('No notices yet. Post the first one with New notice.') : t('No notices right now.')}
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => {
            const { title, body } = noticeFor(n, lang);
            const [variant, audience] = AUDIENCE_BADGE[n.audience] || AUDIENCE_BADGE.both;
            const fresh = n.isActive !== false && isNew(n, seenBefore);
            return (
              <article key={n._id} className={`card p-4 ${n.isActive === false ? 'opacity-60' : ''} ${fresh ? 'border-l-4 border-l-primary-500' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {fresh && <Badge variant="orange">{t('New')}</Badge>}
                      {manage && <Badge variant={variant}>{t(audience)}</Badge>}
                      {manage && n.isActive === false && <Badge variant="gray">{t('Hidden')}</Badge>}
                    </div>
                    <h2 className="mt-1 text-base font-bold leading-snug text-gray-900">{title}</h2>
                    {body && <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">{body}</p>}
                    <p className="mt-2 text-xs text-gray-400">
                      {fDateTime(n.createdAt)}{n.createdBy?.name ? ` · ${n.createdBy.name}` : ''}
                    </p>
                  </div>
                  {manage && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => toggle.mutate(n)} disabled={toggle.isPending} className="btn-ghost p-2 text-gray-500"
                        title={n.isActive ? t('Hide') : t('Show')} aria-label={n.isActive ? t('Hide') : t('Show')}>
                        {n.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => setEditing(n)} className="btn-ghost p-2 text-gray-500" title={t('Edit')} aria-label={t('Edit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setRemoving(n)} className="btn-ghost p-2 text-gray-500 hover:text-red-600" title={t('Delete')} aria-label={t('Delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && <NoticeEditor notice={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmModal open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={() => del.mutate()} loading={del.isPending}
        title="Delete notice" message={t('Delete this notice? To take it down for now, hide it instead.')} />
    </div>
  );
}
