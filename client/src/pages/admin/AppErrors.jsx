import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bug, CheckCircle2, ChevronDown, ChevronRight, Smartphone, Monitor, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { getClientErrors, resolveClientError } from '../../api/clientError.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { fDateTime } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const APP_ICONS = { android: Smartphone, ios: Smartphone, electron: Monitor, web: Globe };
const APP_LABELS = { android: 'Android', ios: 'iPhone', electron: 'Desktop', web: 'Web' };
const SOURCE_LABELS = { screen: 'Screen crashed', script: 'Script error', promise: 'Unhandled error' };

// Crashes reported by the apps (utils/errorReporter.js), newest first. "Resolve" removes an
// entry once it's fixed — if it happens again it comes back.
const ErrorRow = ({ e, canResolve, onResolve, resolving }) => {
  const [open, setOpen] = useState(false);
  const t = useT();
  const Icon = APP_ICONS[e.app] || Globe;
  return (
    <div className="card p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <Bug className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium text-gray-900">{e.message}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{t(APP_LABELS[e.app])}{e.appVersion && ` · ${e.appVersion}`}</span>
            <span>{t(SOURCE_LABELS[e.source])}</span>
            {e.path && <span className="font-mono">{e.path}</span>}
            <span>{t('Last: {date}', { date: fDateTime(e.lastSeenAt) })}</span>
            {e.lastUser?.name && <span>{e.lastUser.name}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700" title={t('Times it happened')}>×{e.count}</span>
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">{t('First seen {date}', { date: fDateTime(e.firstSeenAt) })}</p>
          {e.stack && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-50 p-3 text-[11px] text-gray-700">{e.stack}</pre>
          )}
          {e.userAgent && <p className="break-all text-[11px] text-gray-400">{e.userAgent}</p>}
          {canResolve && (
            <button onClick={() => onResolve(e._id)} disabled={resolving} className="btn-secondary">
              <CheckCircle2 className="h-4 w-4" /> {t('Resolve')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const AppErrors = () => {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['client-errors'], queryFn: getClientErrors });
  const errors = data?.data?.data || [];

  const resolve = useMutation({
    mutationFn: resolveClientError,
    onSuccess: () => { toast.success(t('Marked as resolved')); qc.invalidateQueries({ queryKey: ['client-errors'] }); },
    onError: () => toast.error(t('Could not resolve')),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <PageHeader
        title="App Errors"
        subtitle="Crashes reported automatically by the website, desktop and mobile apps"
        breadcrumbs={[{ label: 'Admin' }, { label: 'App Errors' }]}
      />
      {isLoading ? <PageLoader /> : errors.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-gray-500">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          {t('No errors reported')}
        </div>
      ) : errors.map((e) => (
        <ErrorRow key={e._id} e={e} canResolve={can('users:write')} onResolve={(id) => resolve.mutate(id)} resolving={resolve.isPending} />
      ))}
    </div>
  );
};

export default AppErrors;
